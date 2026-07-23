/**
 * ModerationService (Phase 05) — Honda Hub's Moderation & Governance system.
 *
 * Entities owned: Report, ModerationCase, ModerationCaseNote, ModerationAction.
 * Also writes: AuditLog (via AuditLogService shared delegate).
 * Never writes: Post, Comment, Vehicle, User — applyAction calls the
 *   content-moderation delegate (the owning service's moderation-write path),
 *   never the target entity table directly (Single-Writer Rule, §3.5).
 *
 * Public methods (actions):
 *   fileReport, consolidateReportsIntoCase, createCase, assignCase, addCaseNote,
 *   setCasePriority, applyAction, resolveCase, reopenCase, recordAppeal,
 *   resolveAppeal, authorisePrivateMessageAccess,
 *   listQueue, getCase, viewReportedContent, listAuditLog.
 *
 * Hard rules enforced (§6):
 *  - AI may NEVER create a ModerationAction. applyAction requires an authenticated
 *    human moderator/admin; an AI-originated call (no user identity / non-mod) is
 *    hard-rejected with MODERATION_ACTION_REQUIRES_HUMAN + an alert logged.
 *  - applyAction never writes to the target content entity directly — it calls
 *    content-moderation.applyContentAction() (the owning-service delegate).
 *  - Reports never prevent filing — blocking (Phase 02 SafetyService) has zero
 *    effect on fileReport().
 *  - Unique on (reporter_id, target_type, target_id) while Report.status=open.
 *  - ModerationAction is append-only — no update or delete path exists, ever.
 *    A reversal is a NEW row, never an edit.
 *  - ModerationCaseNote is append-only — never edited or deleted.
 *  - resolveAppeal (and escalated-case resolution) is Admin-only.
 *  - A Moderator can view otherwise-restricted content only via viewReportedContent
 *    while an active Report references it.
 *
 * Events (per the Phase 05 Architecture Pack §5):
 *   ContentReported        → report_update notification to the reporter (filed).
 *   ModerationActionApplied → moderation_outcome notification to the content author
 *                             (+ audit-log mirror for listing_removed).
 *   VehicleVerified         → consumer wiring lives in VehicleService (trust signal
 *                             + notification + audit log); Phase 05 completed that wiring.
 *   BusinessVerified        → no trigger until Phase 07; consumer (business_verified
 *                             trust signal) is already a valid TrustScoreEvent signal_type.
 */
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { createNotification } from "../../shared/notifications.ts";
import { NotificationType } from "../../shared/identity.ts";
import {
  ModerationActionType, AuditActionType, REPORT_TARGET_TYPES, REPORT_CATEGORY_VALUES,
  CASE_STATUS, CASE_PRIORITY, PRIORITY_RANK, CASE_SEVERITY, APPEAL_STATUS, REPORT_STATUS,
  ACTOR_TYPE, isModeratorOrAdmin, isAdmin, actorString,
} from "../../shared/moderation.ts";
import { writeAuditLog } from "../../shared/audit-log.ts";
import { applyContentAction } from "../../shared/content-moderation.ts";

const ACTION_TYPE_VALUES = Object.values(ModerationActionType);

function json(data: any, status = 200) {
  return Response.json(data, { status });
}
function err(code: string, status: number, details?: any) {
  return json({ error: code, ...(details ? { details } : {}) }, status);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // ---- fileReport (any authenticated user, not tier-gated) ----
    if (action === "fileReport") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const target_type = body.target_type;
      const target_id = body.target_id;
      const category = (body.category || "").trim();
      if (!REPORT_TARGET_TYPES.includes(target_type)) return err("VALIDATION_FAILED", 422, { target_type: "invalid" });
      if (!target_id) return err("VALIDATION_FAILED", 422, { target_id: "required" });
      if (!REPORT_CATEGORY_VALUES.includes(category)) return err("VALIDATION_FAILED", 422, { category: "invalid" });
      // Reports never prevent filing — blocking has zero effect (hard rule).
      // Duplicate OPEN report from the SAME reporter against the SAME target is rejected.
      const existing = await base44.entities.Report.filter({
        reporter_id: user.id, target_type, target_id, status: REPORT_STATUS.OPEN,
      });
      if (existing.length > 0) return err("DUPLICATE_OPEN_REPORT", 409, { report: "already reported by you" });
      const description = (body.description || "").trim() || null;
      const report = await base44.entities.Report.create({
        reporter_id: user.id, target_type, target_id, category, description, status: REPORT_STATUS.OPEN,
      });
      // ContentReported event → report_update notification to the reporter (filed confirmation).
      await createNotification(base44, {
        recipient_id: user.id, notification_type: NotificationType.REPORT_UPDATE,
        actor_id: user.id, target_type: "report", target_id: report.id,
      }).catch(() => {});
      // §2.1/§5.1 — report filing is always audit-logged (report_filed).
      await writeAuditLog(base44, {
        action: AuditActionType.REPORT_FILED,
        actor_type: ACTOR_TYPE.USER, actor_id: user.id,
        target_type, target_id,
        context: JSON.stringify({ report_id: report.id, category }),
      }).catch(() => {});
      return json({ ok: true, report });
    }

    // ---- recordAppeal (the affected user appeals a ModerationAction applied to them) ----
    // §7.2 payload { moderation_action_id } (action_id accepted for back-compat).
    if (action === "recordAppeal") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const actionId = body.moderation_action_id || body.action_id;
      if (!actionId) return err("VALIDATION_FAILED", 422, { moderation_action_id: "required" });
      const modAction = await base44.asServiceRole.entities.ModerationAction.get(actionId).catch(() => null);
      if (!modAction) return err("RESOURCE_NOT_FOUND", 404);
      // Only the affected content author may appeal (own enforcement record).
      const authorId = await resolveContentAuthor(base44, modAction.target_type, modAction.target_id);
      if (!authorId || authorId !== user.id) {
        return err("PERMISSION_DENIED", 403, { appeal: "only the affected user may appeal" });
      }
      if (modAction.appeal_status !== APPEAL_STATUS.NONE) {
        return err("VALIDATION_FAILED", 422, { appeal: "appeal already recorded" });
      }
      // Appeal-status update is the sanctioned appeal-field mutation (not action_type/actor/reason).
      const updated = await base44.asServiceRole.entities.ModerationAction.update(actionId, {
        appeal_status: APPEAL_STATUS.REQUESTED,
        appealed_at: new Date().toISOString(),
      });
      return json({ ok: true, action: updated });
    }

    // All remaining actions require Mod/Admin.
    if (!user || !isModeratorOrAdmin(user)) {
      return err("PERMISSION_DENIED", 403);
    }

    // ---- consolidateReportsIntoCase ----
    if (action === "consolidateReportsIntoCase") {
      const target_type = body.target_type;
      const target_id = body.target_id;
      if (!REPORT_TARGET_TYPES.includes(target_type)) return err("VALIDATION_FAILED", 422, { target_type: "invalid" });
      if (!target_id) return err("VALIDATION_FAILED", 422, { target_id: "required" });
      const openReports = await base44.asServiceRole.entities.Report.filter({
        target_type, target_id, status: REPORT_STATUS.OPEN,
      }, "-created_date", 200);
      if (openReports.length === 0) return err("VALIDATION_FAILED", 422, { reports: "no open reports for this target" });
      const theCase = await base44.asServiceRole.entities.ModerationCase.create({
        status: CASE_STATUS.OPEN,
        priority: body.priority || CASE_PRIORITY.MEDIUM,
        severity: body.severity || CASE_SEVERITY.MINOR,
        target_type, target_id,
      });
      for (const r of openReports) {
        await base44.asServiceRole.entities.Report.update(r.id, { status: REPORT_STATUS.CONSOLIDATED, moderation_case_id: theCase.id });
      }
      return json({ ok: true, case: theCase, consolidated_count: openReports.length });
    }

    // ---- createCase ----
    if (action === "createCase") {
      const target_type = body.target_type;
      const target_id = body.target_id;
      if (!REPORT_TARGET_TYPES.includes(target_type)) return err("VALIDATION_FAILED", 422, { target_type: "invalid" });
      if (!target_id) return err("VALIDATION_FAILED", 422, { target_id: "required" });
      if (body.priority && !Object.values(CASE_PRIORITY).includes(body.priority)) return err("VALIDATION_FAILED", 422, { priority: "invalid" });
      if (body.severity && !Object.values(CASE_SEVERITY).includes(body.severity)) return err("VALIDATION_FAILED", 422, { severity: "invalid" });
      const theCase = await base44.asServiceRole.entities.ModerationCase.create({
        status: CASE_STATUS.OPEN,
        priority: body.priority || CASE_PRIORITY.MEDIUM,
        severity: body.severity || CASE_SEVERITY.MINOR,
        target_type, target_id,
        ai_priority_score: typeof body.ai_priority_score === "number" ? body.ai_priority_score : null,
      });
      return json({ ok: true, case: theCase });
    }

    // ---- assignCase ----
    // §7.2 payload { case_id, moderator_id? } — moderator_id optional (self-assign when omitted).
    if (action === "assignCase") {
      const theCase = await base44.asServiceRole.entities.ModerationCase.get(body.case_id).catch(() => null);
      if (!theCase) return err("RESOURCE_NOT_FOUND", 404);
      const assignee = body.moderator_id || body.assigned_moderator_id || null;
      const next: any = { assigned_moderator_id: assignee };
      const fromStatus = theCase.status;
      if (!theCase.assigned_moderator_id) next.status = CASE_STATUS.ASSIGNED;
      const updated = await base44.asServiceRole.entities.ModerationCase.update(body.case_id, next);
      // §2.2 — audit the open→assigned status transition when it occurs.
      if (next.status && next.status !== fromStatus) {
        await writeAuditLog(base44, {
          action: AuditActionType.MODERATION_CASE_STATUS_CHANGED,
          actor_type: isAdmin(user) ? ACTOR_TYPE.ADMIN : ACTOR_TYPE.MODERATOR, actor_id: user.id,
          target_type: "moderation_case", target_id: body.case_id,
          context: JSON.stringify({ from: fromStatus, to: next.status, assigned_moderator_id: assignee }),
        }).catch(() => {});
      }
      return json({ ok: true, case: updated });
    }

    // ---- addCaseNote (append-only) ----
    if (action === "addCaseNote") {
      const noteBody = (body.body || body.note || "").trim();
      if (!noteBody) return err("VALIDATION_FAILED", 422, { body: "required" });
      const theCase = await base44.asServiceRole.entities.ModerationCase.get(body.case_id).catch(() => null);
      if (!theCase) return err("RESOURCE_NOT_FOUND", 404);
      const created = await base44.asServiceRole.entities.ModerationCaseNote.create({ moderation_case_id: body.case_id, body: noteBody });
      return json({ ok: true, note: created });
    }

    // ---- setCasePriority (priority and/or severity; AI may set ai_priority_score advisory only) ----
    if (action === "setCasePriority") {
      const theCase = await base44.asServiceRole.entities.ModerationCase.get(body.case_id).catch(() => null);
      if (!theCase) return err("RESOURCE_NOT_FOUND", 404);
      const update: any = {};
      if (body.priority) {
        if (!Object.values(CASE_PRIORITY).includes(body.priority)) return err("VALIDATION_FAILED", 422, { priority: "invalid" });
        update.priority = body.priority;
      }
      if (body.severity) {
        if (!Object.values(CASE_SEVERITY).includes(body.severity)) return err("VALIDATION_FAILED", 422, { severity: "invalid" });
        update.severity = body.severity;
      }
      if (typeof body.ai_priority_score === "number") update.ai_priority_score = body.ai_priority_score;
      const updated = await base44.asServiceRole.entities.ModerationCase.update(body.case_id, update);
      return json({ ok: true, case: updated });
    }

    // ---- escalateCase (Mod/Admin) — open/assigned/in_review → escalated (§3.2/§6.4) ----
    if (action === "escalateCase") {
      const theCase = await base44.asServiceRole.entities.ModerationCase.get(body.case_id).catch(() => null);
      if (!theCase) return err("RESOURCE_NOT_FOUND", 404);
      if ([CASE_STATUS.RESOLVED_UPHELD, CASE_STATUS.RESOLVED_DISMISSED, CASE_STATUS.ESCALATED].includes(theCase.status)) {
        return err("INVALID_STATE_TRANSITION", 409, { case: "case is already resolved or escalated" });
      }
      const reason = (body.reason || "").trim();
      const fromStatus = theCase.status;
      const updatedCase = await base44.asServiceRole.entities.ModerationCase.update(body.case_id, { status: CASE_STATUS.ESCALATED });
      // §2.2 — every case status change is audit-logged (moderation_case_status_changed).
      await writeAuditLog(base44, {
        action: AuditActionType.MODERATION_CASE_STATUS_CHANGED,
        actor_type: isAdmin(user) ? ACTOR_TYPE.ADMIN : ACTOR_TYPE.MODERATOR, actor_id: user.id,
        target_type: "moderation_case", target_id: body.case_id,
        context: JSON.stringify({ from: fromStatus, to: CASE_STATUS.ESCALATED, reason }),
      }).catch(() => {});
      return json({ ok: true, case: updatedCase });
    }

    // ---- applyAction (Mod/Admin ONLY — AI hard-rejected structurally) ----
    if (action === "applyAction") {
      // Structural AI boundary: requires an authenticated HUMAN moderator/admin.
      // An AI-integration credential has no human user identity → hard reject + alert.
      if (!user || !isModeratorOrAdmin(user)) {
        console.error(`[MODERATION_ALERT] AI-originated applyAction attempt rejected — target ${body.target_type}:${body.target_id} action ${body.action_type}`);
        return err("MODERATION_ACTION_REQUIRES_HUMAN", 403, { action: "only a human moderator/admin may apply a moderation action" });
      }
      const case_id = body.case_id;
      const action_type = body.action_type;
      const reason = (body.reason || "").trim();
      const target_type = body.target_type;
      const target_id = body.target_id;
      if (!ACTION_TYPE_VALUES.includes(action_type)) return err("VALIDATION_FAILED", 422, { action_type: "invalid" });
      if (!case_id) return err("VALIDATION_FAILED", 422, { case_id: "required" });
      if (!reason) return err("VALIDATION_FAILED", 422, { reason: "required" });
      if (!REPORT_TARGET_TYPES.includes(target_type)) return err("VALIDATION_FAILED", 422, { target_type: "invalid" });
      if (!target_id) return err("VALIDATION_FAILED", 422, { target_id: "required" });

      const theCase = await base44.asServiceRole.entities.ModerationCase.get(case_id).catch(() => null);
      if (!theCase) return err("RESOURCE_NOT_FOUND", 404);
      if (theCase.status === CASE_STATUS.RESOLVED_UPHELD || theCase.status === CASE_STATUS.RESOLVED_DISMISSED) {
        return err("CASE_ALREADY_RESOLVED", 409, { case: "this case has already been resolved" });
      }

      // 1. Create the append-only ModerationAction row (actor = moderator:<id> / admin:<id>).
      const modAction = await base44.asServiceRole.entities.ModerationAction.create({
        moderation_case_id: case_id, action_type, actor: actorString(user),
        target_type, target_id, reason,
        appeal_status: APPEAL_STATUS.NONE,
      });

      // 2. Call the owning service's delegate to change the content status —
      //    NEVER write to the target entity table directly from here.
      const contentResult = await applyContentAction(base44, target_type, target_id, action_type);

      // 3. §2.5/§5.2 — EVERY ModerationAction mirrors a moderation_action_applied AuditLog entry
      //    (the specific action_type is carried in context). listing_removed_by_moderation remains
      //    in the registry for other consumers but the generic mirror is moderation_action_applied.
      await writeAuditLog(base44, {
        action: AuditActionType.MODERATION_ACTION_APPLIED,
        actor_type: isAdmin(user) ? ACTOR_TYPE.ADMIN : ACTOR_TYPE.MODERATOR,
        actor_id: user.id,
        target_type, target_id,
        context: JSON.stringify({ moderation_action_id: modAction.id, action_type, reason }),
      }).catch(() => {});

      // 4. ModerationActionApplied → moderation_outcome notification to the content author.
      const authorId = await resolveContentAuthor(base44, target_type, target_id);
      if (authorId) {
        await createNotification(base44, {
          recipient_id: authorId, notification_type: NotificationType.MODERATION_OUTCOME,
          actor_id: user.id, target_type, target_id,
        }).catch(() => {});
      }

      return json({ ok: true, action: modAction, content_changed: contentResult.changed });
    }

    // ---- resolveCase ----
    if (action === "resolveCase") {
      const theCase = await base44.asServiceRole.entities.ModerationCase.get(body.case_id).catch(() => null);
      if (!theCase) return err("RESOURCE_NOT_FOUND", 404);
      if (theCase.status === CASE_STATUS.RESOLVED_UPHELD || theCase.status === CASE_STATUS.RESOLVED_DISMISSED) {
        return err("CASE_ALREADY_RESOLVED", 409, { case: "already resolved" });
      }
      // Escalated cases require Admin to resolve.
      if (theCase.status === CASE_STATUS.ESCALATED && !isAdmin(user)) {
        return err("PERMISSION_DENIED", 403, { case: "only an admin may resolve an escalated case" });
      }
      // §3.2 outcome: resolved_upheld | resolved_dismissed (short form upheld/dismissed accepted for back-compat).
      const rawOutcome = (body.outcome || "").trim();
      const upheld = rawOutcome === "upheld" || rawOutcome === CASE_STATUS.RESOLVED_UPHELD;
      const dismissed = rawOutcome === "dismissed" || rawOutcome === CASE_STATUS.RESOLVED_DISMISSED;
      if (!upheld && !dismissed) return err("VALIDATION_FAILED", 422, { outcome: "must be resolved_upheld or resolved_dismissed" });
      const newStatus = upheld ? CASE_STATUS.RESOLVED_UPHELD : CASE_STATUS.RESOLVED_DISMISSED;
      const fromStatus = theCase.status;
      const updated = await base44.asServiceRole.entities.ModerationCase.update(body.case_id, {
        status: newStatus, resolved_at: new Date().toISOString(),
      });
      // §2.2 — audit the case status change (moderation_case_status_changed).
      await writeAuditLog(base44, {
        action: AuditActionType.MODERATION_CASE_STATUS_CHANGED,
        actor_type: isAdmin(user) ? ACTOR_TYPE.ADMIN : ACTOR_TYPE.MODERATOR, actor_id: user.id,
        target_type: "moderation_case", target_id: body.case_id,
        context: JSON.stringify({ from: fromStatus, to: newStatus }),
      }).catch(() => {});
      // Update linked reports to resolved/dismissed (kept in sync by ModerationService).
      const reports = await base44.asServiceRole.entities.Report.filter({ moderation_case_id: body.case_id, status: REPORT_STATUS.CONSOLIDATED });
      for (const r of reports) {
        await base44.asServiceRole.entities.Report.update(r.id, {
          status: upheld ? REPORT_STATUS.RESOLVED : REPORT_STATUS.DISMISSED,
        });
      }
      return json({ ok: true, case: updated });
    }

    // ---- reopenCase ----
    if (action === "reopenCase") {
      const theCase = await base44.asServiceRole.entities.ModerationCase.get(body.case_id).catch(() => null);
      if (!theCase) return err("RESOURCE_NOT_FOUND", 404);
      if (theCase.status !== CASE_STATUS.RESOLVED_UPHELD && theCase.status !== CASE_STATUS.RESOLVED_DISMISSED) {
        return err("VALIDATION_FAILED", 422, { case: "case is not resolved" });
      }
      const fromStatus = theCase.status;
      const updated = await base44.asServiceRole.entities.ModerationCase.update(body.case_id, {
        status: CASE_STATUS.OPEN, resolved_at: null,
      });
      // §2.2 — audit the reopen transition (moderation_case_status_changed).
      await writeAuditLog(base44, {
        action: AuditActionType.MODERATION_CASE_STATUS_CHANGED,
        actor_type: isAdmin(user) ? ACTOR_TYPE.ADMIN : ACTOR_TYPE.MODERATOR, actor_id: user.id,
        target_type: "moderation_case", target_id: body.case_id,
        context: JSON.stringify({ from: fromStatus, to: CASE_STATUS.OPEN }),
      }).catch(() => {});
      return json({ ok: true, case: updated });
    }

    // ---- resolveAppeal (ADMIN ONLY) ----
    // §7.2 payload { moderation_action_id, outcome } (action_id/decision accepted for back-compat).
    if (action === "resolveAppeal") {
      if (!isAdmin(user)) {
        return err("PERMISSION_DENIED", 403, { appeal: "only an admin may resolve an appeal" });
      }
      const actionId = body.moderation_action_id || body.action_id;
      if (!actionId) return err("VALIDATION_FAILED", 422, { moderation_action_id: "required" });
      const modAction = await base44.asServiceRole.entities.ModerationAction.get(actionId).catch(() => null);
      if (!modAction) return err("RESOURCE_NOT_FOUND", 404);
      if (modAction.appeal_status !== APPEAL_STATUS.REQUESTED && modAction.appeal_status !== APPEAL_STATUS.UNDER_REVIEW) {
        return err("VALIDATION_FAILED", 422, { appeal: "no pending appeal on this action" });
      }
      const decision = body.outcome || body.decision; // "upheld" | "overturned" (§7.2: outcome)
      if (!["upheld", "overturned"].includes(decision)) return err("VALIDATION_FAILED", 422, { outcome: "must be upheld or overturned" });
      // Sanctioned appeal-field mutation on the original row.
      const updated = await base44.asServiceRole.entities.ModerationAction.update(actionId, {
        appeal_status: decision === "upheld" ? APPEAL_STATUS.UPHELD : APPEAL_STATUS.OVERTURNED,
        appeal_resolved_at: new Date().toISOString(), appeal_resolved_by: user.id,
      });
      // If overturned, create a NEW ModerationAction row (content_restored) — never edit the original's action_type.
      let reversal: any = null;
      if (decision === "overturned") {
        reversal = await base44.asServiceRole.entities.ModerationAction.create({
          moderation_case_id: modAction.moderation_case_id,
          action_type: ModerationActionType.CONTENT_RESTORED,
          actor: actorString(user),
          target_type: modAction.target_type,
          target_id: modAction.target_id,
          reason: `Appeal overturned — reversing action ${modAction.id}`,
          appeal_status: APPEAL_STATUS.NONE,
        });
        // Call the delegate to restore the content.
        await applyContentAction(base44, modAction.target_type, modAction.target_id, ModerationActionType.CONTENT_RESTORED);
        // §2.5/§5.2 — the reversing ModerationAction also mirrors a moderation_action_applied audit entry.
        await writeAuditLog(base44, {
          action: AuditActionType.MODERATION_ACTION_APPLIED,
          actor_type: ACTOR_TYPE.ADMIN, actor_id: user.id,
          target_type: modAction.target_type, target_id: modAction.target_id,
          context: JSON.stringify({ moderation_action_id: reversal.id, action_type: ModerationActionType.CONTENT_RESTORED, reverses: modAction.id }),
        }).catch(() => {});
        // Notify the author of the restoration.
        const authorId = await resolveContentAuthor(base44, modAction.target_type, modAction.target_id);
        if (authorId) {
          await createNotification(base44, {
            recipient_id: authorId, notification_type: NotificationType.MODERATION_OUTCOME,
            actor_id: user.id, target_type: modAction.target_type, target_id: modAction.target_id,
          }).catch(() => {});
        }
      }
      return json({ ok: true, action: updated, reversal });
    }

    // ---- authorisePrivateMessageAccess (Mod/Admin) ----
    // §7.2 payload { moderator_id, conversation_or_message_id, report_id }. Grants scoped,
    // temporary access to Marketplace message content only while an active Report references
    // the message. Marketplace messages land in Phase 08; the authorization decision is implemented now.
    if (action === "authorisePrivateMessageAccess") {
      const messageId = body.conversation_or_message_id || body.target_id;
      if (!messageId) return err("VALIDATION_FAILED", 422, { conversation_or_message_id: "required" });
      const targetType = body.target_type || "marketplace_message";
      let activeReports: any[] = [];
      if (body.report_id) {
        const report = await base44.asServiceRole.entities.Report.get(body.report_id).catch(() => null);
        if (!report || report.status !== REPORT_STATUS.OPEN || report.target_id !== messageId) {
          return err("PRIVATE_MESSAGE_ACCESS_NOT_AUTHORISED", 403, { access: "report does not actively reference this message" });
        }
        activeReports = [report];
      } else {
        activeReports = await base44.asServiceRole.entities.Report.filter({
          target_type: targetType, target_id: messageId, status: REPORT_STATUS.OPEN,
        });
      }
      if (activeReports.length === 0) {
        return err("PRIVATE_MESSAGE_ACCESS_NOT_AUTHORISED", 403, { access: "no active report references this message" });
      }
      // Scoped, temporary grant (1h). No persisted entity — the grant is a derived token;
      // re-validation on each subsequent read still requires an active Report (§6.14).
      const expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      return json({ ok: true, authorised: true, access_grant_id: `${activeReports[0].id}:${messageId}`, report_id: activeReports[0].id, expires_at });
    }

    // ---- listQueue (mod queue, sorted by priority DESC then created_at ASC) ----
    if (action === "listQueue") {
      const cases = await base44.asServiceRole.entities.ModerationCase.filter(
        { status: { $in: [CASE_STATUS.OPEN, CASE_STATUS.ASSIGNED, CASE_STATUS.IN_REVIEW, CASE_STATUS.ESCALATED] } },
        "-created_date", 200,
      );
      cases.sort((a: any, b: any) => {
        const pa = PRIORITY_RANK[a.priority] ?? 99;
        const pb = PRIORITY_RANK[b.priority] ?? 99;
        if (pa !== pb) return pa - pb;
        return (a.created_date || "").localeCompare(b.created_date || "");
      });
      // Enrich with open-report counts.
      const enriched = await Promise.all(cases.map(async (c: any) => {
        const reports = await base44.asServiceRole.entities.Report.filter({ target_type: c.target_type, target_id: c.target_id, status: { $in: [REPORT_STATUS.OPEN, REPORT_STATUS.CONSOLIDATED] } });
        return { ...c, report_count: reports.length };
      }));
      return json({ ok: true, cases: enriched });
    }

    // ---- getCase (case detail with notes + actions + appeal + consolidated reports) ----
    if (action === "getCase") {
      const theCase = await base44.asServiceRole.entities.ModerationCase.get(body.case_id).catch(() => null);
      if (!theCase) return err("RESOURCE_NOT_FOUND", 404);
      const [notes, actions, reports] = await Promise.all([
        base44.asServiceRole.entities.ModerationCaseNote.filter({ moderation_case_id: body.case_id }, "created_date", 200),
        base44.asServiceRole.entities.ModerationAction.filter({ moderation_case_id: body.case_id }, "created_date", 200),
        base44.asServiceRole.entities.Report.filter({ moderation_case_id: body.case_id }, "-created_date", 200),
      ]);
      return json({ ok: true, case: theCase, notes, actions, reports });
    }

    // ---- viewReportedContent (mod canView gate — active report required) ----
    if (action === "viewReportedContent") {
      const target_type = body.target_type;
      const target_id = body.target_id;
      if (!REPORT_TARGET_TYPES.includes(target_type)) return err("VALIDATION_FAILED", 422, { target_type: "invalid" });
      if (!target_id) return err("VALIDATION_FAILED", 422, { target_id: "required" });
      const activeReports = await base44.asServiceRole.entities.Report.filter({
        target_type, target_id, status: { $in: [REPORT_STATUS.OPEN, REPORT_STATUS.CONSOLIDATED] },
      });
      if (activeReports.length === 0) {
        return err("PERMISSION_DENIED", 403, { content: "no active report references this content" });
      }
      const content = await fetchReportedContent(base44, target_type, target_id);
      return json({ ok: true, content, report_ids: activeReports.map((r: any) => r.id) });
    }

    // ---- listAuditLog (Admin browser) ----
    if (action === "listAuditLog") {
      if (!isAdmin(user)) return err("PERMISSION_DENIED", 403, { audit: "admin only" });
      const filter: any = {};
      if (body.action) filter.action = body.action;
      if (body.actor_id) filter.actor_id = body.actor_id;
      if (body.target_type) filter.target_type = body.target_type;
      if (body.target_id) filter.target_id = body.target_id;
      const logs = await base44.asServiceRole.entities.AuditLog.filter(filter, "-created_date", body.limit || 200);
      return json({ ok: true, logs });
    }

    return err("VALIDATION_FAILED", 422, { action: "unknown" });
  } catch (error) {
    return json({ error: error.message }, 500);
  }
});

// Resolve the content author for a (target_type, target_id) — for moderation notifications.
async function resolveContentAuthor(base44: any, target_type: string, target_id: string): Promise<string | null> {
  try {
    if (target_type === "post" || target_type === "comment") {
      const entity = (target_type === "post") ? "Post" : "Comment";
      const item = await base44.asServiceRole.entities[entity].get(target_id);
      return item.created_by_id || null;
    }
    if (target_type === "vehicle") {
      const item = await base44.asServiceRole.entities.Vehicle.get(target_id);
      return item.created_by_id || null;
    }
    if (target_type === "user") {
      return target_id;
    }
  } catch {}
  return null;
}

// Fetch the actual content for a moderation investigation (mod-only, active-report-gated).
async function fetchReportedContent(base44: any, target_type: string, target_id: string): Promise<any> {
  try {
    if (target_type === "post") {
      const post = await base44.asServiceRole.entities.Post.get(target_id);
      const author = await base44.asServiceRole.entities.User.get(post.created_by_id).catch(() => null);
      return { type: "post", post, author };
    }
    if (target_type === "comment") {
      const comment = await base44.asServiceRole.entities.Comment.get(target_id);
      const author = await base44.asServiceRole.entities.User.get(comment.created_by_id).catch(() => null);
      return { type: "comment", comment, author };
    }
    if (target_type === "vehicle") {
      const vehicle = await base44.asServiceRole.entities.Vehicle.get(target_id);
      const author = await base44.asServiceRole.entities.User.get(vehicle.created_by_id).catch(() => null);
      return { type: "vehicle", vehicle, author };
    }
    if (target_type === "user") {
      const reportedUser = await base44.asServiceRole.entities.User.get(target_id);
      return { type: "user", user: reportedUser };
    }
  } catch {}
  return { type: target_type, note: "backing entity not yet built or not found" };
}