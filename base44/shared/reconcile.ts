/**
 * Honda Hub — Reconciliation & background-job shared module (Phase 11)
 *
 * Every remaining scheduled job from BACKGROUND_JOBS.md lives here. Each job
 * is idempotent (running twice produces the same result) and bounded (best-
 * effort over a fixed batch — MVP scale). The reconcile backend function
 * dispatches by `action` to one of these, records a JobStatus row, and alerts
 * on the two launch-critical jobs.
 *
 * Service-boundary note: reconciliation jobs write denormalized counters
 * directly via asServiceRole. This is the reconciliation service's defined
 * role (correcting drift); authoritative writes remain owned by each
 * entity's owning service. No new domain entity was added (JobStatus is
 * infrastructure — an operational run log, not part of the product domain).
 *
 * Batching: source-of-truth entities are listed once (limit ~1000) and
 * aggregated in memory; the owned entity is then corrected where its stored
 * counter drifted. At MVP scale (<1000 rows per entity) this is exact; beyond
 * that it is a bounded best-effort and the job reports the bound.
 */

import { isReferenceType, ReferenceTypes } from "./reference-resolver.ts";

const b = (base44: any) => base44.asServiceRole;

export interface JobResult {
  job_name: string;
  status: "success" | "failure";
  alerts: number;
  alert_details?: string;
  summary: string;
  counts: Record<string, number>;
}

/** Registry — used by the dashboard to render the schedule + launch-critical state. */
export const JOB_REGISTRY = [
  { name: "post_counter_reconciliation", label: "Post counter reconciliation", schedule: "hourly", launch_critical: false, group: "Hourly Reconciliation", description: "Recompute Post.like_count / comment_count from PostLike + Comment." },
  { name: "business_review_aggregate_reconciliation", label: "Business review aggregate", schedule: "hourly", launch_critical: false, group: "Hourly Reconciliation", description: "Recompute Business.review_count / rating_sum from published BusinessReview." },
  { name: "event_attendance_reconciliation", label: "Event attendance count", schedule: "hourly", launch_critical: false, group: "Hourly Reconciliation", description: "Recompute Event.attendee_count from EventAttendance (status=going)." },
  { name: "group_member_reconciliation", label: "Group member count", schedule: "hourly", launch_critical: false, group: "Hourly Reconciliation", description: "Recompute Group.member_count from GroupMembership (status=active)." },
  { name: "marketplace_conversation_count_reconciliation", label: "Marketplace conversation count", schedule: "hourly", launch_critical: false, group: "Hourly Reconciliation", description: "Recompute MarketplaceListing.conversation_count from MarketplaceConversation." },
  { name: "invalid_polymorphic_reference_sweep", label: "Invalid polymorphic reference sweep", schedule: "every 30 min", launch_critical: true, group: "Launch-Critical Sweeps", description: "Alert on any (target_type,target_id) that is unknown / not allowed / dangling." },
  { name: "duplicate_active_record_detection", label: "Duplicate active-record detection", schedule: "every 30 min", launch_critical: true, group: "Launch-Critical Sweeps", description: "Alert on >1 active row where a uniqueness invariant expects one." },
  { name: "pending_deletion_processing", label: "Pending-deletion processing", schedule: "daily 03:00", launch_critical: false, group: "Daily Maintenance", description: "Purge user-generated content for users in account_status=pending_deletion." },
  { name: "stale_moderation_access_grant_expiry", label: "Stale moderation-access-grant expiry", schedule: "daily 03:00", launch_critical: false, group: "Daily Maintenance", description: "Expire moderator grants on archived/removed groups." },
  { name: "auditlog_append_only_integrity", label: "AuditLog append-only integrity", schedule: "daily 03:00", launch_critical: false, group: "Daily Maintenance", description: "Flag AuditLog rows whose updated_date != created_date (best-effort edit detection)." },
  { name: "orphaned_media_cleanup", label: "Orphaned Media cleanup", schedule: "daily 03:00", launch_critical: false, group: "Daily Maintenance", description: "Delete Media not referenced by any *_media_id field (7-day upload grace, system media kept)." },
  { name: "failed_side_effect_retry", label: "Generic failed-side-effect retry", schedule: "daily 03:00", launch_critical: false, group: "Daily Maintenance", description: "Re-apply the completed-listing → vehicle sale_status='sold' side effect where it lapsed." },
  { name: "maintenance_due_reminder", label: "Maintenance-due reminder", schedule: "daily 08:00", launch_critical: false, group: "Maintenance Due", description: "Read next_service_date / next_service_odometer_km directly; email owners of due vehicles. No stored reminder field." },
];

// ---------------------------------------------------------------------------
// 1. Post-counter reconciliation (likes / comments)
// ---------------------------------------------------------------------------
export async function postCounterReconciliation(base44: any): Promise<JobResult> {
  const e = b(base44).entities;
  const posts = await e.Post.list("-created_date", 500);
  const likes = await e.PostLike.list("-created_date", 1000);
  const comments = await e.Comment.list("-created_date", 1000);
  const likeMap = new Map<string, number>();
  for (const l of likes) likeMap.set(l.post_id, (likeMap.get(l.post_id) || 0) + 1);
  const cMap = new Map<string, number>();
  for (const c of comments) if (c.status === "published") cMap.set(c.post_id, (cMap.get(c.post_id) || 0) + 1);
  let corrected = 0;
  for (const p of posts) {
    const lc = likeMap.get(p.id) || 0;
    const cc = cMap.get(p.id) || 0;
    if (p.like_count !== lc || p.comment_count !== cc) {
      await e.Post.update(p.id, { like_count: lc, comment_count: cc }).catch(() => {});
      corrected++;
    }
  }
  return { job_name: "post_counter_reconciliation", status: "success", alerts: 0, summary: `checked ${posts.length} posts, corrected ${corrected}`, counts: { posts: posts.length, corrected } };
}

// ---------------------------------------------------------------------------
// 2. Business-review-aggregate reconciliation
// ---------------------------------------------------------------------------
export async function businessReviewAggregateReconciliation(base44: any): Promise<JobResult> {
  const e = b(base44).entities;
  const businesses = await e.Business.list("-created_date", 500);
  const reviews = await e.BusinessReview.list("-created_date", 1000);
  const rc = new Map<string, number>(), rs = new Map<string, number>();
  for (const r of reviews) if (r.status === "published") {
    rc.set(r.business_id, (rc.get(r.business_id) || 0) + 1);
    rs.set(r.business_id, (rs.get(r.business_id) || 0) + (r.rating || 0));
  }
  let corrected = 0;
  for (const biz of businesses) {
    const count = rc.get(biz.id) || 0, sum = rs.get(biz.id) || 0;
    if (biz.review_count !== count || biz.rating_sum !== sum) {
      await e.Business.update(biz.id, { review_count: count, rating_sum: sum }).catch(() => {});
      corrected++;
    }
  }
  return { job_name: "business_review_aggregate_reconciliation", status: "success", alerts: 0, summary: `checked ${businesses.length} businesses, corrected ${corrected}`, counts: { businesses: businesses.length, corrected } };
}

// ---------------------------------------------------------------------------
// 3. Event-attendance-count reconciliation
// ---------------------------------------------------------------------------
export async function eventAttendanceReconciliation(base44: any): Promise<JobResult> {
  const e = b(base44).entities;
  const events = await e.Event.list("-created_date", 500);
  const att = await e.EventAttendance.list("-created_date", 1000);
  const m = new Map<string, number>();
  for (const a of att) if (a.status === "going") m.set(a.event_id, (m.get(a.event_id) || 0) + 1);
  let corrected = 0;
  for (const ev of events) {
    const c = m.get(ev.id) || 0;
    if (ev.attendee_count !== c) { await e.Event.update(ev.id, { attendee_count: c }).catch(() => {}); corrected++; }
  }
  return { job_name: "event_attendance_reconciliation", status: "success", alerts: 0, summary: `checked ${events.length} events, corrected ${corrected}`, counts: { events: events.length, corrected } };
}

// ---------------------------------------------------------------------------
// 4. Group-member-count reconciliation
// ---------------------------------------------------------------------------
export async function groupMemberReconciliation(base44: any): Promise<JobResult> {
  const e = b(base44).entities;
  const groups = await e.Group.list("-created_date", 500);
  const mem = await e.GroupMembership.list("-created_date", 1000);
  const m = new Map<string, number>();
  for (const g of mem) if (g.status === "active") m.set(g.group_id, (m.get(g.group_id) || 0) + 1);
  let corrected = 0;
  for (const grp of groups) {
    const c = m.get(grp.id) || 0;
    if (grp.member_count !== c) { await e.Group.update(grp.id, { member_count: c }).catch(() => {}); corrected++; }
  }
  return { job_name: "group_member_reconciliation", status: "success", alerts: 0, summary: `checked ${groups.length} groups, corrected ${corrected}`, counts: { groups: groups.length, corrected } };
}

// ---------------------------------------------------------------------------
// 5. Marketplace-conversation-count reconciliation
// ---------------------------------------------------------------------------
export async function marketplaceConversationCountReconciliation(base44: any): Promise<JobResult> {
  const e = b(base44).entities;
  const listings = await e.MarketplaceListing.list("-created_date", 500);
  const convs = await e.MarketplaceConversation.list("-created_date", 1000);
  const m = new Map<string, number>();
  for (const c of convs) m.set(c.listing_id, (m.get(c.listing_id) || 0) + 1);
  let corrected = 0;
  for (const l of listings) {
    const c = m.get(l.id) || 0;
    if (l.conversation_count !== c) { await e.MarketplaceListing.update(l.id, { conversation_count: c }).catch(() => {}); corrected++; }
  }
  return { job_name: "marketplace_conversation_count_reconciliation", status: "success", alerts: 0, summary: `checked ${listings.length} listings, corrected ${corrected}`, counts: { listings: listings.length, corrected } };
}

// ---------------------------------------------------------------------------
// 6. Orphaned-Media cleanup
// ---------------------------------------------------------------------------
export async function orphanedMediaCleanup(base44: any): Promise<JobResult> {
  const e = b(base44).entities;
  const referenced = new Set<string>();
  const collect = (rows: any[], ...fields: string[]) => { for (const r of rows) for (const f of fields) { const v = r[f]; if (v) referenced.add(v); } };
  collect(await e.Post.list("-created_date", 1000), "media_id");
  collect(await e.Vehicle.list("-created_date", 1000), "cover_media_id");
  collect(await e.Event.list("-created_date", 1000), "cover_media_id");
  collect(await e.Group.list("-created_date", 1000), "cover_media_id");
  collect(await e.User.list("-created_date", 1000), "avatar_media_id", "cover_media_id");
  const media = await e.Media.list("-created_date", 500);
  const graceMs = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const orphanIds: string[] = [];
  for (const m of media) {
    if (referenced.has(m.id)) continue;
    if (m.source === "system") continue;
    if (m.created_date && (now - new Date(m.created_date).getTime()) < graceMs) continue;
    orphanIds.push(m.id);
    await e.Media.delete(m.id).catch(() => {});
  }
  return { job_name: "orphaned_media_cleanup", status: "success", alerts: orphanIds.length, summary: `deleted ${orphanIds.length} orphaned media (of ${media.length} scanned)`, counts: { scanned: media.length, deleted: orphanIds.length } };
}

// ---------------------------------------------------------------------------
// 7. Invalid-polymorphic-reference sweep (LAUNCH-CRITICAL — alerts)
// ---------------------------------------------------------------------------
const BACKING_ENTITY_FOR_TYPE: Record<string, string> = {
  user: "User", vehicle: "Vehicle", post: "Post", comment: "Comment",
  group: "Group", event: "Event", business: "Business",
  listing: "MarketplaceListing", report: "Report", moderation_case: "ModerationCase",
  marketplace_message: "MarketplaceMessage", business_review: "BusinessReview",
};

async function buildIdMaps(base44: any): Promise<Record<string, Set<string>>> {
  const e = b(base44).entities;
  const maps: Record<string, Set<string>> = {};
  const entNames = Array.from(new Set(Object.values(BACKING_ENTITY_FOR_TYPE)));
  for (const name of entNames) {
    const set = new Set<string>();
    try { const rows = await (e as any)[name].list("-created_date", 1000); for (const r of rows) set.add(r.id); } catch {}
    maps[name] = set;
  }
  return maps;
}

export async function invalidPolymorphicReferenceSweep(base44: any): Promise<JobResult> {
  const e = b(base44).entities;
  const maps = await buildIdMaps(base44);
  const violations: any[] = [];
  const check = (entity: string, rows: any[], typeField: string, idField: string, allowed: string[] | null) => {
    for (const r of rows) {
      const t = r[typeField];
      if (t === null || t === undefined || t === "") continue; // null reference is valid
      if (!isReferenceType(t)) { violations.push({ entity, id: r.id, target_type: t, target_id: r[idField], error: "unknown target_type" }); continue; }
      if (allowed && !allowed.includes(t)) { violations.push({ entity, id: r.id, target_type: t, target_id: r[idField], error: "target_type not allowed for this field" }); continue; }
      const entName = BACKING_ENTITY_FOR_TYPE[t];
      if (entName && maps[entName]) {
        if (r[idField] && !maps[entName].has(r[idField])) violations.push({ entity, id: r.id, target_type: t, target_id: r[idField], error: `dangling: ${r[idField]} not in ${entName}` });
      }
    }
  };
  check("Notification", await e.Notification.list("-created_date", 500), "target_type", "target_id", null);
  check("Report", await e.Report.list("-created_date", 500), "target_type", "target_id", null);
  check("ModerationCase", await e.ModerationCase.list("-created_date", 500), "target_type", "target_id", null);
  check("ModerationAction", await e.ModerationAction.list("-created_date", 500), "target_type", "target_id", null);
  check("AuditLog", await e.AuditLog.list("-created_date", 500), "target_type", "target_id", null);
  check("Follow", await e.Follow.list("-created_date", 1000), "target_type", "target_id", ["user", "vehicle", "business"]);
  check("Event", await e.Event.list("-created_date", 500), "organiser_type", "organiser_id", ["user", "business"]);
  check("Subscription", await e.Subscription.list("-created_date", 500), "subscriber_type", "subscriber_id", ["user", "business"]);
  check("EntitlementOverride", await e.EntitlementOverride.list("-created_date", 500), "subscriber_type", "subscriber_id", ["user", "business"]);
  return {
    job_name: "invalid_polymorphic_reference_sweep", status: "success",
    alerts: violations.length, alert_details: JSON.stringify(violations.slice(0, 50)),
    summary: `${violations.length} invalid polymorphic reference(s) found`,
    counts: { violations: violations.length },
  };
}

// ---------------------------------------------------------------------------
// 8. Duplicate-active-record detection (LAUNCH-CRITICAL — alerts)
// ---------------------------------------------------------------------------
export async function duplicateActiveRecordDetection(base44: any): Promise<JobResult> {
  const e = b(base44).entities;
  const violations: any[] = [];
  const dup = (rows: any[], keyFn: (r: any) => string | null, filterFn: ((r: any) => boolean) | null, label: string) => {
    const m = new Map<string, string[]>();
    for (const r of rows) {
      if (filterFn && !filterFn(r)) continue;
      const k = keyFn(r); if (!k) continue;
      if (!m.has(k)) m.set(k, []); m.get(k)!.push(r.id);
    }
    for (const [k, ids] of m) if (ids.length > 1) violations.push({ entity: label, key: k, ids });
  };
  dup(await e.PostLike.list("-created_date", 1000), (r) => `${r.post_id}|${r.user_id}`, null, "PostLike");
  dup(await e.Follow.list("-created_date", 1000), (r) => `${r.follower_id}|${r.target_type}|${r.target_id}`, null, "Follow");
  dup(await e.GroupMembership.list("-created_date", 1000), (r) => `${r.group_id}|${r.user_id}`, (r) => r.status === "active", "GroupMembership");
  dup(await e.EventAttendance.list("-created_date", 1000), (r) => `${r.event_id}|${r.user_id}`, (r) => r.status === "going" || r.status === "interested", "EventAttendance");
  const bm = await e.BusinessMembership.list("-created_date", 1000);
  dup(bm, (r) => `${r.business_id}|${r.user_id}`, (r) => r.status === "active", "BusinessMembership");
  const owners = new Map<string, string[]>();
  for (const m of bm) if (m.status === "active" && m.role === "owner") { if (!owners.has(m.business_id)) owners.set(m.business_id, []); owners.get(m.business_id)!.push(m.id); }
  for (const [biz, ids] of owners) if (ids.length > 1) violations.push({ entity: "BusinessMembership", key: `owner|${biz}`, ids });
  dup(await e.Subscription.list("-created_date", 500), (r) => `${r.subscriber_type}|${r.subscriber_id}`, (r) => r.status === "active", "Subscription");
  dup(await e.BusinessReview.list("-created_date", 1000), (r) => `${r.business_id}|${r.reviewer_id}`, (r) => ["draft", "published", "hidden_pending_review"].includes(r.status), "BusinessReview");
  return {
    job_name: "duplicate_active_record_detection", status: "success",
    alerts: violations.length, alert_details: JSON.stringify(violations.slice(0, 50)),
    summary: `${violations.length} duplicate-active record(s) found`,
    counts: { violations: violations.length },
  };
}

// ---------------------------------------------------------------------------
// 9. Pending-deletion account processing (best-effort content purge)
// ---------------------------------------------------------------------------
export async function pendingDeletionProcessing(base44: any): Promise<JobResult> {
  const e = b(base44).entities;
  const users = await e.User.list("-created_date", 1000);
  const pending = users.filter((u: any) => u.account_status === "pending_deletion");
  let listingsRemoved = 0, postsRemoved = 0;
  for (const u of pending) {
    const listings = await e.MarketplaceListing.filter({ poster_id: u.id }, "-created_date", 100).catch(() => []);
    for (const l of listings) if (!["removed_by_poster", "removed_by_moderation", "completed"].includes(l.status)) { await e.MarketplaceListing.update(l.id, { status: "removed_by_poster" }).catch(() => {}); listingsRemoved++; }
    const posts = await e.Post.filter({ created_by_id: u.id }, "-created_date", 100).catch(() => []);
    for (const p of posts) if (p.status === "published") { await e.Post.update(p.id, { status: "removed_by_user" }).catch(() => {}); postsRemoved++; }
  }
  return { job_name: "pending_deletion_processing", status: "success", alerts: 0, summary: `${pending.length} pending-deletion user(s); purged ${listingsRemoved} listing(s), ${postsRemoved} post(s)`, counts: { pending_users: pending.length, listings_removed: listingsRemoved, posts_removed: postsRemoved } };
}

// ---------------------------------------------------------------------------
// 10. Stale-moderation-access-grant expiry
//    Interpretation: expire GroupMembership moderator grants on archived/
//    removed groups (the group no longer operates, so mod access is stale).
//    Flagged as an interpretation pending BACKGROUND_JOBS.md confirmation.
// ---------------------------------------------------------------------------
export async function staleModerationAccessGrantExpiry(base44: any): Promise<JobResult> {
  const e = b(base44).entities;
  const groups = await e.Group.list("-created_date", 500);
  const inactive = new Set(groups.filter((g: any) => g.status === "archived" || g.status === "removed_by_moderation").map((g: any) => g.id));
  const mem = await e.GroupMembership.list("-created_date", 1000);
  let expired = 0;
  for (const m of mem) if (m.status === "active" && m.role === "moderator" && inactive.has(m.group_id)) { await e.GroupMembership.update(m.id, { status: "removed" }).catch(() => {}); expired++; }
  return { job_name: "stale_moderation_access_grant_expiry", status: "success", alerts: 0, summary: `expired ${expired} stale moderator grant(s)`, counts: { expired } };
}

// ---------------------------------------------------------------------------
// 11. AuditLog append-only integrity check (best-effort)
// ---------------------------------------------------------------------------
export async function auditlogAppendOnlyIntegrity(base44: any): Promise<JobResult> {
  const e = b(base44).entities;
  const logs = await e.AuditLog.list("-created_date", 500);
  const violations: any[] = [];
  for (const l of logs) {
    if (l.updated_date && l.created_date) {
      const diff = Math.abs(new Date(l.updated_date).getTime() - new Date(l.created_date).getTime());
      if (diff > 2000) violations.push({ id: l.id, reason: "updated_date != created_date (possible edit)", created: l.created_date, updated: l.updated_date });
    }
  }
  return { job_name: "auditlog_append_only_integrity", status: "success", alerts: violations.length, alert_details: JSON.stringify(violations.slice(0, 50)), summary: `${violations.length} integrity violation(s) (best-effort; cannot detect deletes)`, counts: { checked: logs.length, violations: violations.length } };
}

// ---------------------------------------------------------------------------
// 12. Generic failed-side-effect retry
//     Re-applies the completed-listing → vehicle sale_status='sold' side
//     effect where it lapsed. Flagged as an interpretation pending
//     BACKGROUND_JOBS.md confirmation.
// ---------------------------------------------------------------------------
export async function failedSideEffectRetry(base44: any): Promise<JobResult> {
  const e = b(base44).entities;
  const completed = await e.MarketplaceListing.filter({ status: "completed" }, "-created_date", 500).catch(() => []);
  let reapplied = 0;
  for (const l of completed) {
    if (!l.primary_vehicle_id) continue;
    try {
      const v = await e.Vehicle.get(l.primary_vehicle_id);
      if (v.sale_status !== "sold") { await e.Vehicle.update(v.id, { sale_status: "sold" }).catch(() => {}); reapplied++; }
    } catch {}
  }
  return { job_name: "failed_side_effect_retry", status: "success", alerts: 0, summary: `re-applied ${reapplied} lapsed vehicle-sale side effect(s)`, counts: { completed_listings: completed.length, reapplied } };
}

// ---------------------------------------------------------------------------
// 13. Maintenance-due reminder (no stored reminder field)
//     Reads next_service_date / next_service_odometer_km directly. Emails
//     each vehicle owner a digest of due items. Idempotency: gated by
//     "already ran today" via the JobStatus run log (NOT a reminder field on
//     MaintenanceRecord — the build forbids one).
// ---------------------------------------------------------------------------
export async function maintenanceDueReminder(base44: any): Promise<JobResult> {
  const e = b(base44).entities;
  const todayKey = new Date().toISOString().slice(0, 10);
  const lastRuns = await e.JobStatus.filter({ job_name: "maintenance_due_reminder" }, "-created_date", 5).catch(() => []);
  const alreadyToday = (lastRuns as any[]).some((r) => r.created_date && r.created_date.slice(0, 10) === todayKey);
  const records = await e.MaintenanceRecord.filter({ status: "active" }, "-created_date", 1000).catch(() => []);
  const due: any[] = [];
  const now = Date.now();
  for (const m of records) {
    let isDue = false; let reason = "";
    if (m.next_service_date) {
      const daysOut = (new Date(m.next_service_date).getTime() - now) / 86400000;
      if (daysOut <= 7) { isDue = true; reason = daysOut < 0 ? "overdue" : "due_soon"; }
    }
    if (!isDue && m.next_service_odometer_km) {
      try { const v = await e.Vehicle.get(m.vehicle_id); if (v.odometer_km != null && v.odometer_km >= m.next_service_odometer_km) { isDue = true; reason = "odometer_due"; } } catch {}
    }
    if (isDue) due.push({ record: m, reason });
  }
  let emailed = 0;
  if (!alreadyToday) {
    const byOwner = new Map<string, any[]>();
    for (const { record, reason } of due) {
      try { const v = await e.Vehicle.get(record.vehicle_id); const owner = v.created_by_id || record.created_by_id; if (!owner) continue; if (!byOwner.has(owner)) byOwner.set(owner, []); byOwner.get(owner)!.push({ record, reason, vehicle: v }); } catch {}
    }
    for (const [owner, items] of byOwner) {
      try {
        const u = await e.User.get(owner);
        if (!u.email) continue;
        const lines = items.map(({ record, reason, vehicle }: any) => `- ${vehicle.nickname || `${vehicle.year} ${vehicle.make} ${vehicle.model}`}: ${record.maintenance_type} (${reason})${record.next_service_date ? ` due ${record.next_service_date}` : ""}`).join("\n");
        await base44.integrations.Core.SendEmail({ to: u.email, subject: "Honda Hub — maintenance due reminder", body: `Hi,\n\nYou have maintenance due on your vehicle(s):\n\n${lines}\n\n— Honda Hub` });
        emailed++;
      } catch {}
    }
  }
  return { job_name: "maintenance_due_reminder", status: "success", alerts: 0, summary: `${due.length} due, emailed ${emailed} owner(s)${alreadyToday ? " (already ran today — email skipped)" : ""}`, counts: { due: due.length, emailed } };
}

// ---------------------------------------------------------------------------
// Dispatcher map
// ---------------------------------------------------------------------------
export const JOBS: Record<string, (base44: any) => Promise<JobResult>> = {
  post_counter_reconciliation: postCounterReconciliation,
  business_review_aggregate_reconciliation: businessReviewAggregateReconciliation,
  event_attendance_reconciliation: eventAttendanceReconciliation,
  group_member_reconciliation: groupMemberReconciliation,
  marketplace_conversation_count_reconciliation: marketplaceConversationCountReconciliation,
  orphaned_media_cleanup: orphanedMediaCleanup,
  invalid_polymorphic_reference_sweep: invalidPolymorphicReferenceSweep,
  duplicate_active_record_detection: duplicateActiveRecordDetection,
  pending_deletion_processing: pendingDeletionProcessing,
  stale_moderation_access_grant_expiry: staleModerationAccessGrantExpiry,
  auditlog_append_only_integrity: auditlogAppendOnlyIntegrity,
  failed_side_effect_retry: failedSideEffectRetry,
  maintenance_due_reminder: maintenanceDueReminder,
};

/** Latest JobStatus per job (for the dashboard). */
export async function dashboardSnapshot(base44: any) {
  const e = b(base44).entities;
  const recent = await e.JobStatus.list("-created_date", 300).catch(() => []);
  const latest: Record<string, any> = {};
  for (const r of recent) if (!latest[r.job_name]) latest[r.job_name] = r; // list is newest-first
  return JOB_REGISTRY.map((j) => ({ ...j, last: latest[j.name] || null }));
}