/**
 * Honda Hub — Business shared module (Phase 07)
 *
 * Business/BusinessMembership/BusinessReview registries and the helpers that
 * both BusinessService (base44/functions/business) and the content-moderation
 * delegate need. Single-Writer is preserved: BusinessService is the sole writer
 * of Business/BusinessMembership/BusinessReview; applyModerationActionToReview
 * is the internal moderation path called by the content-moderation delegate
 * (never a direct ModerationService write to BusinessReview).
 *
 * Tier gates reuse the Phase 06 community helpers (Trusted Member+ to create,
 * New Member+ to participate) so the gate logic stays in one place.
 */

import { meetsCreationTier, meetsParticipationTier, accountInGoodStanding } from "./community.ts";

export { meetsCreationTier, meetsParticipationTier, accountInGoodStanding };

export const BusinessCategory = Object.freeze({
  WORKSHOP: "workshop",
  TUNER: "tuner",
  DEALER: "dealer",
  PARTS_SUPPLIER: "parts_supplier",
  DETAILER: "detailer",
  PANEL_SHOP: "panel_shop",
  TYRE_SHOP: "tyre_shop",
  OTHER: "other",
});
export const BUSINESS_CATEGORY_VALUES = Object.values(BusinessCategory);

export const BusinessRole = Object.freeze({
  OWNER: "owner",
  STAFF: "staff",
});

export const BusinessMembershipStatus = Object.freeze({
  ACTIVE: "active",
  REMOVED: "removed",
});

export const BusinessVerificationStatus = Object.freeze({
  UNVERIFIED: "unverified",
  PENDING: "pending",
  VERIFIED: "verified",
  REJECTED: "rejected",
});

export const BusinessStatus = Object.freeze({
  ACTIVE: "active",
  SUSPENDED: "suspended",
  REMOVED_BY_MODERATION: "removed_by_moderation",
});

export const BusinessReviewStatus = Object.freeze({
  DRAFT: "draft",
  HIDDEN_PENDING_REVIEW: "hidden_pending_review",
  PUBLISHED: "published",
  REMOVED_BY_REVIEWER: "removed_by_reviewer",
  REMOVED_BY_MODERATION: "removed_by_moderation",
});
export const BUSINESS_REVIEW_STATUS_VALUES = Object.values(BusinessReviewStatus);

// A review is "active" (counts toward the uniqueness key) while in one of these states.
const ACTIVE_REVIEW_STATES = new Set([
  BusinessReviewStatus.DRAFT,
  BusinessReviewStatus.PUBLISHED,
  BusinessReviewStatus.HIDDEN_PENDING_REVIEW,
]);

export function isReviewActive(status: string): boolean {
  return ACTIVE_REVIEW_STATES.has(status as any);
}

/** BizMgr — owner or staff (manager-level: may respond to reviews, edit profile). */
export function isBizManager(role: string | undefined | null): boolean {
  return role === BusinessRole.OWNER || role === BusinessRole.STAFF;
}

/** BizOwn — only role that can manage members / submit for verification. */
export function isBizOwner(role: string | undefined | null): boolean {
  return role === BusinessRole.OWNER;
}

/** Returns the caller's active membership row on a business, or null. */
export async function getActiveMembership(base44: any, userId: string, businessId: string): Promise<any | null> {
  const rows = await base44.entities.BusinessMembership.filter({
    business_id: businessId, user_id: userId, status: BusinessMembershipStatus.ACTIVE,
  });
  return rows[0] || null;
}

/** Returns the caller's active role on a business (owner/staff), or null. */
export async function getManagerRole(base44: any, userId: string, businessId: string): Promise<string | null> {
  const m = await getActiveMembership(base44, userId, businessId);
  return m?.role || null;
}

/** All active members (owner + staff) of a business. */
export async function getActiveMembers(base44: any, businessId: string): Promise<any[]> {
  return base44.entities.BusinessMembership.filter({
    business_id: businessId, status: BusinessMembershipStatus.ACTIVE,
  });
}

/**
 * experience_verified auto-detection (§5 / ADR-027, Option C). True iff the
 * reviewer has REAL evidence of transacting with this Business:
 *   (a) a Modification they own (created_by_id) with installed_by_business_id =
 *       this Business, OR
 *   (b) an EventAttendance on an Event organised by this Business
 *       (organiser_type=business, organiser_id=this Business).
 * Computed at review creation/edit time by BusinessService only — never by the
 * Business, a human directly, or AI.
 */
export async function detectExperienceVerified(base44: any, businessId: string, reviewerId: string): Promise<boolean> {
  // (a) Modification evidence — a mod on one of the reviewer's vehicles tagged with this business.
  try {
    const mods = await base44.asServiceRole.entities.Modification.filter({
      installed_by_business_id: businessId, created_by_id: reviewerId,
    });
    if (mods.length > 0) return true;
  } catch {}
  // (b) EventAttendance evidence on a Business-organised event.
  try {
    const bizEvents = await base44.asServiceRole.entities.Event.filter({
      organiser_type: "business", organiser_id: businessId,
    }, "-created_date", 200);
    if (bizEvents.length > 0) {
      const ids = new Set(bizEvents.map((e: any) => e.id));
      const att = await base44.asServiceRole.entities.EventAttendance.filter({
        user_id: reviewerId,
      }, "-created_date", 500);
      if (att.some((a: any) => ids.has(a.event_id))) return true;
    }
  } catch {}
  return false;
}

/**
 * recalculateReviewAggregate — the single reconciliation path for the
 * denormalized rating_sum/review_count. Source of truth = BusinessReview rows
 * with status=published. rating_sum/review_count must always equal a direct
 * SUM/COUNT over published rows (ADR-029). No stored average_rating.
 */
export async function recalculateReviewAggregate(base44: any, businessId: string): Promise<{ rating_sum: number; review_count: number }> {
  const published = await base44.asServiceRole.entities.BusinessReview.filter({
    business_id: businessId, status: BusinessReviewStatus.PUBLISHED,
  });
  const rating_sum = published.reduce((s: number, r: any) => s + (Number(r.rating) || 0), 0);
  const review_count = published.length;
  await base44.asServiceRole.entities.Business.update(businessId, { rating_sum, review_count });
  return { rating_sum, review_count };
}

/**
 * applyModerationActionToReview — the internal moderation-write path for a
 * BusinessReview, called by the content-moderation delegate (never a direct
 * ModerationService write to BusinessReview). Sets the review's status to
 * new_status (validated against the enum) and recomputes the aggregate so
 * rating_sum/review_count match published rows after every moderation
 * transition. (Per §8.2 the payload carries new_status; the delegate derives
 * it from the ModerationAction action_type.)
 */
export async function applyModerationActionToReview(
  base44: any,
  reviewId: string,
  newStatus: string,
): Promise<{ ok: boolean; changed: boolean; error?: string }> {
  if (!BUSINESS_REVIEW_STATUS_VALUES.includes(newStatus)) {
    return { ok: false, changed: false, error: "invalid new_status" };
  }
  try {
    const review = await base44.asServiceRole.entities.BusinessReview.get(reviewId);
    if (review.status === newStatus) return { ok: true, changed: false };
    await base44.asServiceRole.entities.BusinessReview.update(reviewId, { status: newStatus });
    await recalculateReviewAggregate(base44, review.business_id);
    return { ok: true, changed: true };
  } catch {
    return { ok: false, changed: false, error: "review not found" };
  }
}