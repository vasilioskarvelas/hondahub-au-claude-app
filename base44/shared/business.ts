/**
 * Honda Hub — Business shared module (Phase 07)
 *
 * Business/BusinessMembership/BusinessReview registries and the helpers that
 * both BusinessService (base44/functions/business) and the content-moderation
 * delegate need. Single-Writer is preserved: BusinessService is the sole writer
 * of Business/BusinessMembership/BusinessReview; applyModerationActionToReview is
 * the internal moderation path called by the content-moderation delegate (never a
 * direct ModerationService write to BusinessReview).
 *
 * Tier gates reuse the Phase 06 community helpers (Trusted Member+ to create,
 * New Member+ to participate) so the gate logic stays in one place.
 */

import { meetsCreationTier, meetsParticipationTier, accountInGoodStanding } from "./community.ts";

export { meetsCreationTier, meetsParticipationTier, accountInGoodStanding };

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
  ARCHIVED: "archived",
  REMOVED_BY_MODERATION: "removed_by_moderation",
});

export const BusinessReviewStatus = Object.freeze({
  DRAFT: "draft",
  PUBLISHED: "published",
  HIDDEN_PENDING_REVIEW: "hidden_pending_review",
  REMOVED_BY_REVIEWER: "removed_by_reviewer",
  REMOVED_BY_MODERATION: "removed_by_moderation",
});

/** BizMgr — owner or staff (manager-level: may respond to reviews, create events). */
export function isBizManager(role: string | undefined | null): boolean {
  return role === BusinessRole.OWNER || role === BusinessRole.STAFF;
}

/** BizOwn — only role that can manage members / transfer ownership. */
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

/**
 * experience_verified auto-detection (§26 / Phase 07 hard rule). True iff the
 * reviewer has REAL evidence of transacting with this Business:
 *   (a) a Modification they own (created_by_id) with installed_by_business_id =
 *       this Business, OR
 *   (b) an EventAttendance (going/interested) on an Event organised by this
 *       Business (organiser_type=business, organiser_id=this Business).
 * Never settable by the Business, a human directly, or AI — only this function,
 * called by BusinessService on create/publish/update.
 */
export async function detectExperienceVerified(base44: any, businessId: string, reviewerId: string): Promise<boolean> {
  // (a) Modification evidence.
  try {
    const mods = await base44.asServiceRole.entities.Modification.filter({
      installed_by_business_id: businessId, created_by_id: reviewerId,
    });
    if (mods.length > 0) return true;
  } catch {}
  // (b) EventAttendance evidence on a Business-organised event.
  try {
    const bizEvents = await base44.asServiceRole.entities.Event.filter({
      organiser_type: "business", organiser_id: businessId, status: { $ne: "cancelled" },
    }, "-created_date", 200);
    if (bizEvents.length > 0) {
      const ids = new Set(bizEvents.map((e: any) => e.id));
      const att = await base44.asServiceRole.entities.EventAttendance.filter({
        user_id: reviewerId, status: { $in: ["going", "interested"] },
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
 * SUM/COUNT over published rows (acceptance test). No stored average_rating.
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
 * refreshExperienceForUser — recompute experience_verified on a user's
 * non-removed review(s) for a business, given the CURRENT evidence. Called by
 * the evidence-creation paths (ModificationService.create / update and
 * EventService.attendEvent) so experience_verified flips automatically the
 * moment qualifying evidence exists — with no Business or user action involved
 * (Phase 07 acceptance test). Only BusinessService / this helper ever set
 * experience_verified.
 */
export async function refreshExperienceForUser(base44: any, userId: string, businessId: string): Promise<{ verified: boolean; updated: number }> {
  const reviews = await base44.asServiceRole.entities.BusinessReview.filter({
    business_id: businessId, reviewer_id: userId,
    status: { $ne: BusinessReviewStatus.REMOVED_BY_MODERATION },
  });
  if (reviews.length === 0) return { verified: false, updated: 0 };
  const verified = await detectExperienceVerified(base44, businessId, userId);
  let updated = 0;
  for (const r of reviews) {
    if (!!r.experience_verified !== verified) {
      await base44.asServiceRole.entities.BusinessReview.update(r.id, { experience_verified: verified });
      updated++;
    }
  }
  return { verified, updated };
}

/**
 * applyModerationActionToReview — the internal moderation-write path for a
 * BusinessReview, called by the content-moderation delegate (never a direct
 * ModerationService write to BusinessReview). content_removed →
 * removed_by_moderation; content_restored → published. Aggregate is always
 * recomputed so rating_sum/review_count match published rows after every
 * moderation transition.
 */
export async function applyModerationActionToReview(
  base44: any,
  reviewId: string,
  actionType: string,
): Promise<{ ok: boolean; changed: boolean; error?: string }> {
  try {
    const review = await base44.asServiceRole.entities.BusinessReview.get(reviewId);
    if (actionType === "content_removed") {
      if (review.status === BusinessReviewStatus.REMOVED_BY_MODERATION) return { ok: true, changed: false };
      await base44.asServiceRole.entities.BusinessReview.update(reviewId, { status: BusinessReviewStatus.REMOVED_BY_MODERATION });
      await recalculateReviewAggregate(base44, review.business_id);
      return { ok: true, changed: true };
    }
    if (actionType === "content_restored") {
      if (review.status === BusinessReviewStatus.PUBLISHED) return { ok: true, changed: false };
      await base44.asServiceRole.entities.BusinessReview.update(reviewId, { status: BusinessReviewStatus.PUBLISHED });
      await recalculateReviewAggregate(base44, review.business_id);
      return { ok: true, changed: true };
    }
    return { ok: true, changed: false };
  } catch (e: any) {
    return { ok: false, changed: false, error: "review not found" };
  }
}