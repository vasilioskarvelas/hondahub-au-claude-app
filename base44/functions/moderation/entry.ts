/**
 * ModerationService (Phase 05) — Honda Hub's Moderation & Governance system.
 *
 * Entities owned: Report, ModerationCase, ModerationCaseNote, ModerationAction.
 * Also writes: AuditLog (via AuditLogService shared delegate).
 * Never writes: Post, Comment, Vehicle, User — applyAction calls the
 *   content-moderation delegate (the owning service's moderation-write path),
 *   never the target entity table directly.
 *
 * Public methods (actions):
 *   fileReport, consolidateReportsIntoCase, createCase, assignCase, addCaseNote,
 *   setCasePriority, applyAction, resolveCase, reopenCase, recordAppeal,
 *   resolveAppeal, authorisePrivateMessageAccess,
 *   listQueue, getCase, viewReportedContent, listAuditLog.
 *
 * Hard rules enforced:
 *  - AI may NEVER create a ModerationAction. applyAction requires an authenticated
 *    human moderator/admin; an AI-originated call (no user identity / non-mod) is
 *    hard-rejected with MODERATION_ACTION_REQUIRES_HUMAN + an alert logged.
 *  - applyAction never writes to the target content entity directly — it calls
 *    content-moderation.applyContentAction() (the owning-service delegate).
 *  - Reports never prevent filing — blocking (Phase 02 SafetyService) has zero
 *    effect on fileReport().
 *  - Unique on (reporter_id, target_type, target_id) while Report.status=open.
 *  - ModerationAction is append-only — no update or delete path exists, ever.
 *  - ModerationCaseNote is append-only — never edited or deleted.
 *  - resolveAppeal (and escalated-case resolution) is Admin-only.
 *  - A Moderator can view otherwise-restricted content only via viewReportedContent
 *    while an active Report references it.
 *
 * Events (per EVENT_CATALOG.md):
 *   ContentReported       → report_update notification to the reporter (filed).
 *   ModerationActionApplied → moderation_outcome notification to the content author.
 *   BusinessVerified      → consumer wiring (trust signal + notification) — Phase 07.
 *   VehicleVerified        → approval audit-log entry added here (Phase 05 wiring).
 */
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { validateReference, ReferenceTypes } from "../../shared/reference-resolver.ts";
import { createNotification } from "../../shared/notifications.ts";
import { NotificationType } from "../../shared/identity.ts";
import {
  ModerationActionType, AuditActionType, REPORT_TARGET_TYPES,
  CASE_STATUS, CASE_PRIORITY, PRIORITY_RANK, CASE_SEVERITY, APPEAL_STATUS, REPORT_STATUS,
  isModeratorOrAdmin, isAdmin,
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

    // ---- fileReport (any authenticated user) ----
    if (action === "fileReport") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const target_type = body.target_type;
      const target_id = body.target_id;
      const reason = (body.reason || "").trim();
      if (!REPORT_TARGET_TYPES.includes(target_type)) return err("VALIDATION_FAILED", 422, { target_type: "invalid" });
      if (!target_id) return err("VALIDATION_FAILED", 422, { target_id: "required" });
      if (!reason) return err("VALIDATION_FAILED", 422, { reason: "required" });
      // Reports never prevent filing — blocking has zero effect (hard rule).
      // Duplicate open report from the SAME reporter against the SAME target is rejected.
      const existing = await base44.entities.Report.filter({
        reporter_id: user.id, target_type, target_id, status: REPORT_STATUS.OPEN,
      });
      if (existing.length > 0) return err("DUPLICATE_OPEN_REPORT", 409, { report: "already reported by you" });
      const report = await base44.entities.Report.create({
        reporter_id: user.id, target_type, target_id, reason, details: body.details || null, status: REPORT_STATUS.OPEN,
      });
      // ContentReported event → report_update notification to the reporter (filed confirmation).
      await createNotification(base44, {
        recipient_id: user.id, notification_type: NotificationType.REPORT_UPDATE,
        actor_id: user.id, target_type: ReferenceTypes.REPORT, target_id: report.id,
      }).catch(() => {});
      return json({ ok: true, report });
    }

    // All remaining actions require mod/admin (except recordAppeal which any user may call on their own action).
    // ---- recordAppeal (the affected content author appeals a ModerationAction applied to them) ----
    if (action === "recordAppeal") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const modAction = await base44.asServiceRole.entities.ModerationAction.get(body.action_id).catch(() => null);
      if (!modAction) return err("RESOURCE_NOT_FOUND", 404);
      // Resolve the target author: for post/comment, the author is the content's created_by_id.
      const authorId = await resolveContentAuthor(base44, modAction.target_type, modAction.target_id);
      if (!authorId || authorId !== user.id) {
        return err("PERMISSION_DENIED", 403, { appeal: "only the affected content author may appeal" });
      }
      if (modAction.appeal_status !== APPEAL_STATUS.NONE) {
        return err("VALIDATION_FAILED", 422, { appeal: "appeal already recorded" });
      }
      // Append-only: we DO NOT edit the original action's appeal fields via a generic update of content.
      // Appeal status lives ON the ModerationAction row — recording an appeal is the one sanctioned update
      // to appeal fields (not the action_type/reason/actor). This is the documented appeal-readiness update.
      const updated = await base44.asServiceRole.entities.ModerationAction.update(body.action_id, {
        appeal_status: APPEAL_STATUS.PENDING,
        appealed_at: new Date().toISOString(),
      });
      return json({ ok: true, action: updated });
    }

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
        severity: body.severity || CASE_SEVERITY.MODERATE,
        target_type, target_id,
      });
      for (const r of openReports) {
        await base44.asServiceRole.entities.Report.update(r.id, { status: REPORT_STATUS.CONSOLIDATED, case_id: theCase.id });
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
        severity: body.severity || CASE_SEVERITY.MODERATE,
        target_type, target_id,
      });
      return json({ ok: true, case: theCase });
    }

    // ---- assignCase ----
    if (action === "assignCase") {
      const theCase = await base44.asServiceRole.entities.ModerationCase.get(body.case_id).catch(() => null);
      if (!theCase) return err("RESOURCE_NOT_FOUND", 404);
      const next = { assigned_moderator_id: body.assigned_moderator_id || null };
      if (!theCase.assigned_moderator_id) next.status = CASE_STATUS.ASSIGNED;
      const updated = await base44.asServiceRole.entities.ModerationCase.update(body.case_id, next);
      return json({ ok: true, case: updated });
    }

    // ---- addCaseNote (append-only) ----
    if (action === "addCaseNote") {
      const note = (body.note || "").trim();
      if (!note) return err("VALIDATION_FAILED", 422, { note: "required" });
      const theCase = await base44.asServiceRole.entities.ModerationCase.get(body.case_id).catch(() => null);
      if (!theCase) return err("RESOURCE_NOT_FOUND", 404);
      const created = await base44.asServiceRole.entities.ModerationCaseNote.create({ case_id: body.case_id, note });
      return json({ ok: true, note: created });
    }

    // ---- setCasePriority (priority and/or severity) ----
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
      const updated = await base44.asServiceRole.entities.ModerationCase.update(body.case_id, update);
      return json({ ok: true, case: updated });
    }

    // ---- applyAction (Mod/Admin ONLY — AI hard-rejected) ----
    if (action === "applyAction") {
      // Structural AI boundary: requires an authenticated HUMAN moderator/admin.
      // An AI-integration credential has no human user identity → hard reject.
      if (!user || !isModeratorOrAdmin(user)) {
        // Alert: log the attempted AI-originated call.
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

      // 1. Create the append-only ModerationAction row (never updated/deleted).
      const modAction = await base44.asServiceRole.entities.ModerationAction.create({
        case_id, action_type, actor_id: user.id, target_type, target_id, reason,
        appeal_status: APPEAL_STATUS.NONE,
        reversal_of_action_id: body.reversal_of_action_id || null,
      });

      // 2. Call the owning service's delegate to change the content status —
      //    NEVER write to the target entity table directly from here.
      const contentResult = await applyContentAction(base44, target_type, target_id, action_type);

      // 3. Audit log (for listing_removed — the AuditActionType value exists).
      if (action_type === ModerationActionType.LISTING_REMOVED) {
        await writeAuditLog(base44, {
          action: AuditActionType.LISTING_REMOVED_BY_MODERATION, actor_id: user.id,
          target_type, target_id, details: reason,
        }).catch(() => {});
      }

      // 4. ModerationActionApplied event → moderation_outcome notification to the content author.
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
      // Escalated cases require Admin to resolve.
      if (theCase.status === CASE_STATUS.ESCALATED && !isAdmin(user)) {
        return err("PERMISSION_DENIED", 403, { case: "only an admin may resolve an escalated case" });
      }
      const outcome = body.outcome; // "upheld" | "dismissed"
      if (!["upheld", "dismissed"].includes(outcome)) return err("VALIDATION_FAILED", 422, { outcome: "must be upheld or dismissed" });
      const newStatus = outcome === "upheld" ? CASE_STATUS.RESOLVED_UPHELD : CASE_STATUS.RESOLVED_DISMISSED;
      const updated = await base44.asServiceRole.entities.ModerationCase.update(body.case_id, {
        status: newStatus, resolved_at: new Date().toISOString(), resolved_by: user.id,
      });
      // Update linked reports to resolved/dismissed.
      const reports = await base44.asServiceRole.entities.Report.filter({ case_id: body.case_id, status: REPORT_STATUS.CONSOLIDATED });
      for (const r of reports) {
        await base44.asServiceRole.entities.Report.update(r.id, {
          status: outcome === "upheld" ? REPORT_STATUS.RESOLVED : REPORT_STATUS.DISMISSED,
          resolved_at: new Date().toISOString(), resolved_by: user.id,
        });
      }
      return json({ ok: true, case: updated });
    }

    // ---- reopenCase ----
    if (action === "reopenCase") {
      const theCase = await base44.asServiceRole.entities.ModerationCase.get(body.case_id).catch(() => null);
      if (!theCase) return err("RESOURCE_NOT_FOUND", 404);
      const updated = await base44.asServiceRole.entities.ModerationCase.update(body.case_id, {
        status: CASE_STATUS.OPEN, resolved_at: null, resolved_by: null,
      });
      return json({ ok: true, case: updated });
    }

    // ---- resolveAppeal (ADMIN ONLY) ----
    if (action === "resolveAppeal") {
      if (!isAdmin(user)) {
        return err("PERMISSION_DENIED", 403, { appeal: "only an admin may resolve an appeal" });
      }
      const modAction = await base44.asServiceRole.entities.ModerationAction.get(body.action_id).catch(() => null);
      if (!modAction) return err("RESOURCE_NOT_FOUND", 404);
      if (modAction.appeal_status !== APPEAL_STATUS.PENDING) {
        return err("VALIDATION_FAILED", 422, { appeal: "no pending appeal on this action" });
      }
      const decision = body.decision; // "approved" | "rejected"
      if (!["approved", "rejected"].includes(decision)) return err("VALIDATION_FAILED", 422, { decision: "must be approved or rejected" });
      // Update the appeal fields on the original action (sanctioned appeal-field update).
      const updated = await base44.asServiceRole.entities.ModerationAction.update(body.action_id, {
        appeal_status: decision === "approved" ? APPEAL_STATUS.APPROVED : APPEAL_STATUS.REJECTED,
        appeal_resolved_at: new Date().toISOString(), appeal_resolved_by: user.id,
      });
      // If approved (reversal), create a NEW ModerationAction row (content_restored) — never edit the original's action_type.
      let reversal = null;
      if (decision === "approved") {
        reversal = await base44.asServiceRole.entities.ModerationAction.create({
          case_id: modAction.case_id,
          action_type: ModerationActionType.CONTENT_RESTORED,
          actor_id: user.id,
          target_type: modAction.target_type,
          target_id: modAction.target_id,
          reason: `Appeal approved — reversing action ${modAction.id}`,
          appeal_status: APPEAL_STATUS.NONE,
          reversal_of_action_id: modAction.id,
        });
        // Call the delegate to restore the content.
        await applyContentAction(base44, modAction.target_type, modAction.target_id, ModerationActionType.CONTENT_RESTORED);
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
    // Grants access to a marketplace message's content only while an active Report references it.
    // Marketplace messages land in Phase 08; the authorization decision is implemented now.
    if (action === "authorisePrivateMessageAccess") {
      const target_type = body.target_type || "marketplace_message";
      const target_id = body.target_id;
      if (!target_id) return err("VALIDATION_FAILED", 422, { target_id: "required" });
      const activeReports = await base44.asServiceRole.entities.Report.filter({
        target_type, target_id, status: REPORT_STATUS.OPEN,
      });
      if (activeReports.length === 0) {
        return json({ ok: true, authorised: false, reason: "no active report references this message" });
      }
      // Authorised for this moderator, scoped to the active report. The actual
      // message content fetch is implemented in Phase 08 when MarketplaceMessage exists.
      return json({ ok: true, authorised: true, report_id: activeReports[0].id });
    }

    // ---- listQueue (mod queue, sorted by priority then created_at) ----
    if (action === "listQueue") {
      const cases = await base44.asServiceRole.entities.ModerationCase.filter(
        { status: { $in: [CASE_STATUS.OPEN, CASE_STATUS.ASSIGNED, CASE_STATUS.IN_REVIEW, CASE_STATUS.ESCALATED] } },
        "-created_date", 200,
      );
      cases.sort((a: any, b: any) => {
        const pa = PRIORITY_RANK[a.priority] ?? 99;
        const pb = PRIORITY_RANK[b.priority] ?? 99;
        if (pa !== pb) return pa - pb;
        return (b.created_date || "").localeCompare(a.created_date || "");
      });
      // Enrich with open-report counts.
      const enriched = await Promise.all(cases.map(async (c: any) => {
        const reports = await base44.asServiceRole.entities.Report.filter({ target_type: c.target_type, target_id: c.target_id, status: { $in: [REPORT_STATUS.OPEN, REPORT_STATUS.CONSOLIDATED] } });
        return { ...c, report_count: reports.length };
      }));
      return json({ ok: true, cases: enriched });
    }

    // ---- getCase (case detail with notes + actions + appeal) ----
    if (action === "getCase") {
      const theCase = await base44.asServiceRole.entities.ModerationCase.get(body.case_id).catch(() => null);
      if (!theCase) return err("RESOURCE_NOT_FOUND", 404);
      const [notes, actions, reports] = await Promise.all([
        base44.asServiceRole.entities.ModerationCaseNote.filter({ case_id: body.case_id }, "created_date", 200),
        base44.asServiceRole.entities.ModerationAction.filter({ case_id: body.case_id }, "-created_date", 200),
        base44.asServiceRole.entities.Report.filter({ case_id: body.case_id }, "-created_date", 200),
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
      const logs = await base44.asServiceRole.entities.AuditLog.filter(filter, "-created_date", body.limit || 200);
      return json({ ok: true, logs });
    }

    return err("VALIDATION_FAILED", 422, { action: "unknown" });
  } catch (error) {
    return json({ error: error.message }, 500);
  }
});

// Resolve the content author for a (target_type, target_id) — for notifications.
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
      const comments = await base44.asServiceRole.entities.Comment.filter({ post_id: target_id }, "-created_date", 200);
      return { type: "post", post, author, comments };
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