/**
 * LaunchCleanupReportService — strictly READ-ONLY launch data-hygiene checks.
 *
 * Admin-only. Performs NO create/update/delete/archive operations whatsoever —
 * every SDK call is a read (filter / get). Returns a JSON report of:
 *   1. notifications_null_delivery_status — Notification rows where delivery_status is null/empty.
 *   2. duplicate_business_names — Business rows grouped by shared name (count > 1).
 *   3. dangling_refs — Report / ModerationCase / Notification rows whose
 *      (target_type, target_id) points to a record that no longer exists.
 *
 * Existence checks use base44.asServiceRole.entities.<Entity>.get(target_id),
 * which throws on not-found — caught and treated as dangling. A per-(type:id)
 * cache avoids re-fetching the same target across sources.
 */
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { ReferenceTypes } from "../../shared/reference-resolver.ts";
import { json, err } from "../../shared/http.ts";

const BACKING_ENTITY: Record<string, string> = {
  [ReferenceTypes.USER]: "User",
  [ReferenceTypes.POST]: "Post",
  [ReferenceTypes.COMMENT]: "Comment",
  [ReferenceTypes.EVENT]: "Event",
  [ReferenceTypes.LISTING]: "MarketplaceListing",
  [ReferenceTypes.REPORT]: "Report",
  [ReferenceTypes.VEHICLE]: "Vehicle",
  [ReferenceTypes.GROUP]: "Group",
  [ReferenceTypes.BUSINESS]: "Business",
  [ReferenceTypes.MODERATION_CASE]: "ModerationCase",
  [ReferenceTypes.MARKETPLACE_MESSAGE]: "MarketplaceMessage",
  [ReferenceTypes.BUSINESS_REVIEW]: "BusinessReview",
};

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return err("AUTH_REQUIRED", 401);
    if (user.role !== "admin") return err("PERMISSION_DENIED", 403);

    // ---- (1) notifications_null_delivery_status ----
    const notifications = await base44.asServiceRole.entities.Notification.filter({}, "created_date", 500);
    const nullDeliveryCount = notifications.filter(
      (n: any) => n.delivery_status == null || n.delivery_status === "",
    ).length;

    // ---- (2) duplicate_business_names ----
    const businesses = await base44.asServiceRole.entities.Business.filter({}, "created_date", 500);
    const nameGroups: Record<string, any[]> = {};
    for (const b of businesses) {
      const key = (b.name || "").trim().toLowerCase();
      if (!key) continue;
      if (!nameGroups[key]) nameGroups[key] = [];
      nameGroups[key].push({ id: b.id, name: b.name });
    }
    const duplicateBusinessNames = Object.entries(nameGroups)
      .filter(([, group]) => group.length > 1)
      .map(([name, group]) => ({ name, count: group.length, businesses: group }));

    // ---- (3) dangling_refs — Report, ModerationCase, Notification ----
    const existenceCache = new Set<string>(); // "type:id" → exists
    const danglingRefs: any[] = [];

    const checkDangling = async (sourceEntity: string, rows: any[]) => {
      for (const row of rows) {
        const tt = row.target_type;
        const tid = row.target_id;
        if (!tt || !tid) continue; // null/empty target is valid (no target)
        const cacheKey = `${tt}:${tid}`;
        if (!existenceCache.has(cacheKey)) {
          const entityName = BACKING_ENTITY[tt];
          let exists = false;
          if (entityName) {
            try {
              await base44.asServiceRole.entities[entityName].get(tid);
              exists = true;
            } catch {
              exists = false;
            }
          }
          if (exists) existenceCache.add(cacheKey);
        }
        if (!existenceCache.has(cacheKey)) {
          danglingRefs.push({ source: sourceEntity, source_id: row.id, target_type: tt, target_id: tid });
        }
      }
    };

    const reports = await base44.asServiceRole.entities.Report.filter({}, "created_date", 500);
    await checkDangling("Report", reports);

    const moderationCases = await base44.asServiceRole.entities.ModerationCase.filter({}, "created_date", 500);
    await checkDangling("ModerationCase", moderationCases);

    await checkDangling("Notification", notifications);

    return json({
      notifications_null_delivery_status: nullDeliveryCount,
      duplicate_business_names: duplicateBusinessNames,
      dangling_refs: danglingRefs,
      summary: {
        notifications_scanned: notifications.length,
        businesses_scanned: businesses.length,
        reports_scanned: reports.length,
        moderation_cases_scanned: moderationCases.length,
      },
    });
  } catch (error) {
    return json({ error: error.message }, 500);
  }
}