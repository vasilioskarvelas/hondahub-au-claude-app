/**
 * LaunchPurge — admin-only pre-launch cleanup function.
 *
 * STRICT SAFETY MODEL:
 *  - dry_run defaults to TRUE. In dry_run, nothing is deleted — returns a JSON
 *    summary of exactly what WOULD be removed (counts + ids) and what WOULD be
 *    preserved.
 *  - A real run requires BOTH { dry_run: false } AND { confirm: "PURGE" }.
 *    Any other call is read-only.
 *  - Admin only (user.role === "admin"), else PERMISSION_DENIED.
 *  - PRESERVES: admin Users, JobStatus rows, app configuration/registries.
 *  - Clears all rows of the purge entity list below.
 *  - Append-only entities (AuditLog, ModerationAction, ModerationCaseNote) are
 *    attempted; if the delete path is blocked, they are reported as
 *    "cannot_delete" instead of failing the whole run.
 *  - Bounded to 500 rows per entity per call; idempotent — re-run until all
 *    remaining counts reach 0.
 */
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

const PURGE_ENTITIES = [
  "Business", "BusinessMembership", "BusinessReview",
  "Post", "PostLike", "Comment", "Follow",
  "Group", "GroupMembership", "Event", "EventAttendance",
  "Listing", "MarketplaceListing", "MarketplaceConversation", "MarketplaceMessage",
  "Offer", "Bid", "Vehicle", "GarageCar", "Media",
  "TimelineEntry", "Modification", "MaintenanceRecord", "PerformanceRecord",
  "TrustScore", "TrustScoreEvent",
  "Report", "ModerationCase", "ModerationCaseNote", "ModerationAction",
  "AuditLog", "Notification",
];

// Known append-only entities (no delete path per their schema descriptions).
const APPEND_ONLY = new Set(["AuditLog", "ModerationAction", "ModerationCaseNote"]);

const BATCH = 500;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ ok: false, error: "PERMISSION_DENIED" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run !== false; // defaults to true
    const confirm = body.confirm;

    if (!dryRun && confirm !== "PURGE") {
      return Response.json({
        ok: false,
        error: "CONFIRMATION_REQUIRED",
        message: "Set both dry_run: false AND confirm: 'PURGE' to execute the purge.",
      }, { status: 422 });
    }

    const summary = {};
    const preserved = {};
    const cannotDelete = {};

    // ---- Purge entities ----
    for (const entityName of PURGE_ENTITIES) {
      try {
        const entity = base44.asServiceRole.entities[entityName];
        const rows = await entity.filter({}, "created_date", BATCH);
        const ids = rows.map((r) => r.id);

        if (dryRun) {
          summary[entityName] = {
            would_remove: ids.length,
            ids,
            append_only: APPEND_ONLY.has(entityName) || undefined,
          };
        } else {
          let deleted = 0;
          const errors = [];
          for (const id of ids) {
            try {
              await entity.delete(id);
              deleted++;
            } catch (e) {
              errors.push({ id, error: e.message });
            }
          }
          let remainingCount = 0;
          try {
            const remaining = await entity.filter({}, "created_date", BATCH);
            remainingCount = remaining.length;
          } catch {}
          summary[entityName] = {
            deleted,
            remaining: remainingCount,
            errors: errors.length ? errors : undefined,
          };
          if (errors.length === ids.length && ids.length > 0) {
            cannotDelete[entityName] = {
              reason: "all deletes failed (likely append-only / no delete path)",
              count: ids.length,
            };
          }
        }
      } catch (e) {
        cannotDelete[entityName] = { error: e.message };
      }
    }

    // ---- Non-admin Users (preserve admins) ----
    try {
      const allUsers = await base44.asServiceRole.entities.User.filter({}, "created_date", BATCH);
      const adminUsers = allUsers.filter((u) => u.role === "admin");
      const nonAdminUsers = allUsers.filter((u) => u.role !== "admin");

      preserved["User (admin — PRESERVED)"] = {
        count: adminUsers.length,
        ids: adminUsers.map((u) => ({ id: u.id, email: u.email, role: u.role, full_name: u.full_name })),
      };

      if (dryRun) {
        summary["User (non-admin)"] = {
          would_remove: nonAdminUsers.length,
          ids: nonAdminUsers.map((u) => ({ id: u.id, email: u.email, role: u.role, full_name: u.full_name })),
        };
      } else {
        let deleted = 0;
        const errors = [];
        for (const u of nonAdminUsers) {
          try {
            await base44.asServiceRole.entities.User.delete(u.id);
            deleted++;
          } catch (e) {
            errors.push({ id: u.id, email: u.email, error: e.message });
          }
        }
        let remainingNonAdmin = 0;
        try {
          const remaining = await base44.asServiceRole.entities.User.filter({}, "created_date", BATCH);
          remainingNonAdmin = remaining.filter((u) => u.role !== "admin").length;
        } catch {}
        summary["User (non-admin)"] = {
          deleted,
          remaining: remainingNonAdmin,
          errors: errors.length ? errors : undefined,
        };
      }
    } catch (e) {
      cannotDelete["User"] = { error: e.message };
    }

    // ---- Preserved: JobStatus ----
    try {
      const jobStatuses = await base44.asServiceRole.entities.JobStatus.filter({}, "created_date", BATCH);
      preserved["JobStatus (PRESERVED)"] = {
        count: jobStatuses.length,
        ids: jobStatuses.map((j) => j.id),
      };
    } catch {
      preserved["JobStatus (PRESERVED)"] = { count: "error" };
    }

    return Response.json({
      ok: true,
      mode: dryRun ? "DRY_RUN" : "EXECUTED",
      summary,
      preserved,
      cannot_delete: Object.keys(cannotDelete).length > 0 ? cannotDelete : undefined,
      note: dryRun
        ? "DRY RUN — nothing was deleted. Review the would_remove lists above. To execute: { dry_run: false, confirm: 'PURGE' }."
        : "Purge executed. Re-run until all remaining counts reach 0.",
    });
  } catch (error) {
    return Response.json({ ok: false, error: { code: "INTERNAL_ERROR", message: error.message } }, { status: 500 });
  }
}