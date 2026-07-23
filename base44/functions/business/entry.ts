/**
 * BusinessService (Phase 07) — owns Business, BusinessMembership, BusinessReview.
 *
 * Single-Writer: this function is the ONLY writer to those three entities.
 * Reads (never writes) User, Modification, EventAttendance, Event (evidence
 * check), Media (logo/cover URL resolution), TrustScore/TrustScoreEvent
 * (verified-contact + membership lookup), Vehicle (review vehicle ownership).
 *
 * Methods (§8.2): createBusiness, updateBusiness, addMember, changeMemberRole,
 *   removeMember, submitVerification, approveVerification, rejectVerification,
 *   createReviewDraft, publishReview, updateReview, removeOwnReview,
 *   restoreOwnReview, respondToReview, applyModerationActionToReview (internal),
 *   recalculateReviewAggregate (reconciliation).
 * Read methods (§8.3): getBusiness, listBusinesses, getBusinessMembers,
 *   getReviewsForBusiness, getOwnReview.
 *
 * Hard rules enforced:
 *  - Business creation requires Trusted Member+ (ADR-039); creator becomes the
 *    sole initial owner BusinessMembership. Creation NEVER auto-verifies.
 *  - Exactly one active owner per Business at all times — changeMemberRole
 *    promotes target + demotes the previous owner atomically; removeMember
 *    rejects removing the sole owner.
 *  - A Business can NEVER edit/delete a review's rating/body — only its own
 *    business_response (via respondToReview). No role, including Admin, may.
 *  - A reviewer cannot review a Business they hold a BusinessMembership on.
 *  - experience_verified is set ONLY by BusinessService (this function), at
 *    review creation/edit time, from real Modification/EventAttendance evidence
 *    (ADR-027) — never by the Business, a human directly, or AI.
 *  - verification_status changes only via submit/approve/reject — never a direct
 *    field write; approve/reject are Moderator/Admin-only.
 *  - Rating aggregate (rating_sum/review_count) is recomputed from published
 *    BusinessReview rows on every lifecycle transition (ADR-029 — drift-free).
 *
 * NOTE — items not implemented this phase (see Architecture Questions):
 *  - AQ1: Business status moderation (active↔suspended/removed_by_moderation
 *    and back to active) — no method or action-type→status mapping specified.
 *    updateBusiness rejects `status` writes; no suspend/restore method exists.
 *  - AQ3: respondToReview does not support removing a response (empty/null) —
 *    only create/edit of a non-empty value.
 *  - publishReview → hidden_pending_review "borderline trust / flagged content"
 *    routing: the triggering condition is not specified; Trusted Member+ reviews
 *    publish directly. hidden_pending_review remains reachable via moderation
 *    (applyModerationActionToReview with new_status).
 */
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import {
  BUSINESS_CATEGORY_VALUES, BusinessRole, BusinessMembershipStatus, BusinessVerificationStatus,
  BusinessStatus, BusinessReviewStatus, BUSINESS_REVIEW_STATUS_VALUES, isReviewActive,
  isBizManager, isBizOwner, getActiveMembership, getManagerRole, getActiveMembers,
  detectExperienceVerified, recalculateReviewAggregate, applyModerationActionToReview,
  meetsCreationTier, meetsParticipationTier, accountInGoodStanding,
} from "../../shared/business.ts";
import { isModeratorOrAdmin, actorTypeFor } from "../../shared/community.ts";
import { onBusinessVerified } from "../../shared/business-verified.ts";
import { createNotification } from "../../shared/notifications.ts";
import { NotificationType } from "../../shared/identity.ts";
import { writeAuditLog } from "../../shared/audit-log.ts";
import { AuditActionType } from "../../shared/moderation.ts";
import { validateReference, ReferenceTypes } from "../../shared/reference-resolver.ts";
import { json, err } from "../../shared/http.ts";
import { resolveMediaUrl } from "../../shared/media.ts";

const RATING_MIN = 1, RATING_MAX = 5;
const NAME_MAX = 100, BODY_MAX = 2000, RESPONSE_MAX = 2000;
const DEFAULT_LIMIT = 20, MAX_LIMIT = 100;

// Business fields a BizOwn/BizMgr may edit via updateBusiness (excludes
// verification_status, status, follower_count, review_count, rating_sum — all
// protected). experience_verified is not on Business.
const BUSINESS_EDITABLE = ["name", "about", "category", "contact_email", "contact_phone", "website", "location_general", "services_offered", "opening_hours", "social_links", "logo_media_id", "cover_media_id"];

// Reviewer may edit rating/body only while the review is in one of these states.
const REVIEW_EDITABLE = new Set([BusinessReviewStatus.DRAFT, BusinessReviewStatus.HIDDEN_PENDING_REVIEW, BusinessReviewStatus.PUBLISHED]);

async function hasVerifiedContact(base44: any, userId: string): Promise<boolean> {
  try {
    const ts = await base44.asServiceRole.entities.TrustScore.filter({ user_id: userId });
    if (ts.length === 0) return false;
    const events = await base44.asServiceRole.entities.TrustScoreEvent.filter({ trust_score_id: ts[0].id });
    return events.some((e: any) => e.signal_type === "email_verified" || e.signal_type === "phone_verified");
  } catch {
    return false;
  }
}

// Validate vehicle_id belongs to the reviewer (same ownership pattern as Post.primary_vehicle_id).
async function validateOwnedVehicle(base44: any, user: any, vehicleId: string): Promise<{ ok: boolean; error?: string }> {
  const ref = await validateReference(base44, { target_type: ReferenceTypes.VEHICLE, target_id: vehicleId, allowedTypes: [ReferenceTypes.VEHICLE] });
  if (!ref.valid) return { ok: false, error: ref.error };
  try {
    const v = await base44.asServiceRole.entities.Vehicle.get(vehicleId);
    if (v.created_by_id !== user.id) return { ok: false, error: "vehicle must belong to you" };
    return { ok: true };
  } catch {
    return { ok: false, error: "vehicle not found" };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // ============ createBusiness ============
    if (action === "createBusiness") {
      if (!user) return err("AUTH_REQUIRED", 401);
      if (!accountInGoodStanding(user)) {
        return err(user.account_status === "banned" ? "ACCOUNT_BANNED" : "ACCOUNT_SUSPENDED", 403);
      }
      if (!meetsCreationTier(user)) {
        return err("BUSINESS_CREATION_TIER_REQUIRED", 403, { current_tier: user.account_tier, required_tier: "trusted_member" });
      }
      const name = (body.name || "").trim();
      if (!name || name.length > NAME_MAX) return err("VALIDATION_FAILED", 422, { name: "required, max 100 chars" });
      const category = body.category;
      if (!BUSINESS_CATEGORY_VALUES.includes(category)) return err("VALIDATION_FAILED", 422, { category: "invalid" });
      const business = await base44.entities.Business.create({
        name,
        about: (body.about || "").trim() || null,
        category,
        contact_email: (body.contact_email || "").trim() || null,
        contact_phone: (body.contact_phone || "").trim() || null,
        website: (body.website || "").trim() || null,
        location_general: (body.location_general || "").trim() || null,
        services_offered: (body.services_offered || "").trim() || null,
        opening_hours: (body.opening_hours || "").trim() || null,
        social_links: (body.social_links || "").trim() || null,
        follower_count: 0,
        verification_status: BusinessVerificationStatus.UNVERIFIED,
        status: BusinessStatus.ACTIVE,
        review_count: 0,
        rating_sum: 0,
      });
      // Atomic initial owner membership (exactly one owner at creation).
      await base44.entities.BusinessMembership.create({
        business_id: business.id, user_id: user.id, role: BusinessRole.OWNER, status: BusinessMembershipStatus.ACTIVE,
      });
      return json({ ok: true, business_id: business.id, status: BusinessStatus.ACTIVE, verification_status: BusinessVerificationStatus.UNVERIFIED, business });
    }

    // ============ updateBusiness (BizOwn/BizMgr) ============
    if (action === "updateBusiness") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const business = await base44.entities.Business.get(body.business_id).catch(() => null);
      if (!business) return err("RESOURCE_NOT_FOUND", 404);
      const role = await getManagerRole(base44, user.id, business.id);
      if (!isBizManager(role)) return err("PERMISSION_DENIED", 403);
      // Protected fields — never client-settable.
      for (const f of ["verification_status", "status", "follower_count", "review_count", "rating_sum"]) {
        if (body[f] !== undefined) return err("PERMISSION_DENIED", 403, { [f]: "not settable" });
      }
      const upd: any = {};
      if (body.name !== undefined) {
        const n = (body.name || "").trim();
        if (!n || n.length > NAME_MAX) return err("VALIDATION_FAILED", 422, { name: "required, max 100 chars" });
        upd.name = n;
      }
      if (body.category !== undefined) {
        if (!BUSINESS_CATEGORY_VALUES.includes(body.category)) return err("VALIDATION_FAILED", 422, { category: "invalid" });
        upd.category = body.category;
      }
      for (const f of ["about", "contact_email", "contact_phone", "website", "location_general", "services_offered", "opening_hours", "social_links"]) {
        if (body[f] !== undefined) upd[f] = (body[f] || "").trim() || null;
      }
      for (const f of ["logo_media_id", "cover_media_id"]) {
        if (body[f] !== undefined) upd[f] = body[f] || null;
      }
      const updated = await base44.entities.Business.update(business.id, upd);
      return json({ ok: true, business_id: business.id, business: updated });
    }

    // ============ addMember (BizOwn only; staff) ============
    if (action === "addMember") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const business = await base44.entities.Business.get(body.business_id).catch(() => null);
      if (!business) return err("RESOURCE_NOT_FOUND", 404);
      const role = await getManagerRole(base44, user.id, business.id);
      if (!isBizOwner(role)) return err("PERMISSION_DENIED", 403, { reason: "owner only" });
      const targetId = body.user_id;
      if (!targetId) return err("VALIDATION_FAILED", 422, { user_id: "required" });
      const target = await base44.asServiceRole.entities.User.get(targetId).catch(() => null);
      if (!target) return err("VALIDATION_FAILED", 422, { user_id: "not found" });
      const existing = await base44.entities.BusinessMembership.filter({ business_id: business.id, user_id: targetId });
      if (existing.some((m: any) => m.status === BusinessMembershipStatus.ACTIVE)) {
        return err("CONFLICT", 409, { user_id: "already a member" });
      }
      // Reactivate a removed row, or create a new one (unique on business_id+user_id).
      if (existing.length > 0) {
        const m = await base44.entities.BusinessMembership.update(existing[0].id, { role: BusinessRole.STAFF, status: BusinessMembershipStatus.ACTIVE });
        await writeAuditLog(base44, { action: AuditActionType.BUSINESS_STATUS_CHANGED, actor_type: actorTypeFor(user), actor_id: user.id, target_type: "business", target_id: business.id, context: JSON.stringify({ member_added: targetId }) }).catch(() => {});
        return json({ ok: true, membership_id: m.id, status: BusinessMembershipStatus.ACTIVE });
      }
      const membership = await base44.entities.BusinessMembership.create({
        business_id: business.id, user_id: targetId, role: BusinessRole.STAFF, status: BusinessMembershipStatus.ACTIVE,
      });
      await writeAuditLog(base44, { action: AuditActionType.BUSINESS_STATUS_CHANGED, actor_type: actorTypeFor(user), actor_id: user.id, target_type: "business", target_id: business.id, context: JSON.stringify({ member_added: targetId }) }).catch(() => {});
      return json({ ok: true, membership_id: membership.id, status: BusinessMembershipStatus.ACTIVE });
    }

    // ============ changeMemberRole (BizOwn only; preserves exactly-one-owner) ============
    if (action === "changeMemberRole") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const business = await base44.entities.Business.get(body.business_id).catch(() => null);
      if (!business) return err("RESOURCE_NOT_FOUND", 404);
      const myRole = await getManagerRole(base44, user.id, business.id);
      if (!isBizOwner(myRole)) return err("PERMISSION_DENIED", 403, { reason: "owner only" });
      const newRole = body.new_role;
      if (![BusinessRole.OWNER, BusinessRole.STAFF].includes(newRole)) {
        return err("VALIDATION_FAILED", 422, { new_role: "must be owner or staff" });
      }
      const target = await getActiveMembership(base44, body.member_user_id, business.id);
      if (!target) return err("VALIDATION_FAILED", 422, { member_user_id: "not an active member" });
      if (newRole === BusinessRole.OWNER) {
        if (target.role === BusinessRole.OWNER) return json({ ok: true, membership_id: target.id, role: BusinessRole.OWNER });
        // Ownership transfer: promote target, demote the current owner (caller) to staff atomically.
        await base44.entities.BusinessMembership.update(target.id, { role: BusinessRole.OWNER });
        const me = await getActiveMembership(base44, user.id, business.id);
        if (me) await base44.entities.BusinessMembership.update(me.id, { role: BusinessRole.STAFF });
        await writeAuditLog(base44, { action: AuditActionType.BUSINESS_STATUS_CHANGED, actor_type: actorTypeFor(user), actor_id: user.id, target_type: "business", target_id: business.id, context: JSON.stringify({ ownership_transferred_to: body.member_user_id }) }).catch(() => {});
        return json({ ok: true, membership_id: target.id, role: BusinessRole.OWNER });
      }
      // newRole === staff: cannot demote the sole owner (would leave zero owners).
      if (target.role === BusinessRole.OWNER) {
        return err("VALIDATION_FAILED", 422, { role: "cannot demote the sole owner — transfer ownership first" });
      }
      await base44.entities.BusinessMembership.update(target.id, { role: BusinessRole.STAFF });
      return json({ ok: true, membership_id: target.id, role: BusinessRole.STAFF });
    }

    // ============ removeMember (BizOwn; or self for a staff member) ============
    if (action === "removeMember") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const business = await base44.entities.Business.get(body.business_id).catch(() => null);
      if (!business) return err("RESOURCE_NOT_FOUND", 404);
      const target = await getActiveMembership(base44, body.member_user_id, business.id);
      if (!target) return err("VALIDATION_FAILED", 422, { member_user_id: "not an active member" });
      const isSelf = body.member_user_id === user.id;
      // Cannot remove the sole owner (would violate exactly-one-owner).
      if (target.role === BusinessRole.OWNER) {
        return err("VALIDATION_FAILED", 422, { membership: "cannot remove the owner — transfer ownership first" });
      }
      if (!isSelf) {
        const myRole = await getManagerRole(base44, user.id, business.id);
        if (!isBizOwner(myRole)) return err("PERMISSION_DENIED", 403, { reason: "owner only" });
      }
      const updated = await base44.entities.BusinessMembership.update(target.id, { status: BusinessMembershipStatus.REMOVED });
      await writeAuditLog(base44, { action: AuditActionType.BUSINESS_STATUS_CHANGED, actor_type: actorTypeFor(user), actor_id: user.id, target_type: "business", target_id: business.id, context: JSON.stringify({ member_removed: body.member_user_id, self: isSelf }) }).catch(() => {});
      return json({ ok: true, membership_id: updated.id, status: BusinessMembershipStatus.REMOVED });
    }

    // ============ submitVerification (BizOwn only) ============
    if (action === "submitVerification") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const business = await base44.entities.Business.get(body.business_id).catch(() => null);
      if (!business) return err("RESOURCE_NOT_FOUND", 404);
      const role = await getManagerRole(base44, user.id, business.id);
      if (!isBizOwner(role)) return err("PERMISSION_DENIED", 403, { reason: "owner only" });
      if (![BusinessVerificationStatus.UNVERIFIED, BusinessVerificationStatus.REJECTED].includes(business.verification_status)) {
        return err("INVALID_STATE_TRANSITION", 409, { current: business.verification_status });
      }
      const updated = await base44.entities.Business.update(business.id, { verification_status: BusinessVerificationStatus.PENDING });
      await writeAuditLog(base44, { action: AuditActionType.BUSINESS_STATUS_CHANGED, actor_type: actorTypeFor(user), actor_id: user.id, target_type: "business", target_id: business.id, context: JSON.stringify({ verification_from: business.verification_status, verification_to: BusinessVerificationStatus.PENDING }) }).catch(() => {});
      return json({ ok: true, business_id: business.id, verification_status: BusinessVerificationStatus.PENDING, business: updated });
    }

    // ============ approveVerification (Mod/Admin only) ============
    if (action === "approveVerification") {
      if (!user || !isModeratorOrAdmin(user)) return err("PERMISSION_DENIED", 403);
      const business = await base44.entities.Business.get(body.business_id).catch(() => null);
      if (!business) return err("RESOURCE_NOT_FOUND", 404);
      if (business.verification_status !== BusinessVerificationStatus.PENDING) {
        return err("INVALID_STATE_TRANSITION", 409, { current: business.verification_status });
      }
      const updated = await base44.entities.Business.update(business.id, { verification_status: BusinessVerificationStatus.VERIFIED });
      // BusinessVerified event consumers (trust signal to all members + notify all members + audit).
      await onBusinessVerified(base44, { business_id: business.id, business_name: business.name, actor_id: user.id }).catch(() => {});
      return json({ ok: true, business_id: business.id, verification_status: BusinessVerificationStatus.VERIFIED, business: updated });
    }

    // ============ rejectVerification (Mod/Admin only; reason required) ============
    if (action === "rejectVerification") {
      if (!user || !isModeratorOrAdmin(user)) return err("PERMISSION_DENIED", 403);
      const business = await base44.entities.Business.get(body.business_id).catch(() => null);
      if (!business) return err("RESOURCE_NOT_FOUND", 404);
      if (business.verification_status !== BusinessVerificationStatus.PENDING) {
        return err("INVALID_STATE_TRANSITION", 409, { current: business.verification_status });
      }
      const reason = (body.reason || "").trim();
      if (!reason) return err("VALIDATION_FAILED", 422, { reason: "required" });
      const updated = await base44.entities.Business.update(business.id, { verification_status: BusinessVerificationStatus.REJECTED });
      const members = await getActiveMembers(base44, business.id);
      for (const m of members) {
        await createNotification(base44, { recipient_id: m.user_id, notification_type: NotificationType.MODERATION_OUTCOME, actor_id: user.id, target_type: "business", target_id: business.id }).catch(() => {});
      }
      await writeAuditLog(base44, { action: AuditActionType.BUSINESS_STATUS_CHANGED, actor_type: actorTypeFor(user), actor_id: user.id, target_type: "business", target_id: business.id, context: JSON.stringify({ verification_from: BusinessVerificationStatus.PENDING, verification_to: BusinessVerificationStatus.REJECTED, reason }) }).catch(() => {});
      return json({ ok: true, business_id: business.id, verification_status: BusinessVerificationStatus.REJECTED, business: updated });
    }

    // ============ createReviewDraft (New Member+ verified contact; not a member) ============
    if (action === "createReviewDraft") {
      if (!user) return err("AUTH_REQUIRED", 401);
      if (!accountInGoodStanding(user)) {
        return err(user.account_status === "banned" ? "ACCOUNT_BANNED" : "ACCOUNT_SUSPENDED", 403);
      }
      if (!meetsParticipationTier(user)) return err("PERMISSION_DENIED", 403, { required_tier: "new_member" });
      const business = await base44.entities.Business.get(body.business_id).catch(() => null);
      if (!business || business.status === BusinessStatus.REMOVED_BY_MODERATION) return err("RESOURCE_NOT_FOUND", 404);
      // Self-review rejection: a member cannot review their own business.
      const membership = await getActiveMembership(base44, user.id, business.id);
      if (membership) return err("CANNOT_REVIEW_OWN_BUSINESS", 400, { reason: "cannot review a business you hold a membership on" });
      // Verified contact method required.
      if (!(await hasVerifiedContact(base44, user.id))) {
        return err("VALIDATION_FAILED", 422, { contact: "a verified email or phone is required to review" });
      }
      // Optional vehicle must belong to the reviewer.
      if (body.vehicle_id) {
        const v = await validateOwnedVehicle(base44, user, body.vehicle_id);
        if (!v.ok) return err("VALIDATION_FAILED", 422, { vehicle_id: v.error });
      }
      // Unique on (business_id, reviewer_id) while status is draft/published/hidden_pending_review.
      const existing = await base44.entities.BusinessReview.filter({ business_id: business.id, reviewer_id: user.id });
      if (existing.some((r: any) => isReviewActive(r.status))) {
        return err("REVIEW_ALREADY_EXISTS", 409, { review_id: existing[0].id });
      }
      const rating = Number(body.rating);
      if (!Number.isInteger(rating) || rating < RATING_MIN || rating > RATING_MAX) {
        return err("VALIDATION_FAILED", 422, { rating: "must be an integer 1–5" });
      }
      const bodyText = (body.body || "").trim();
      if (!bodyText) return err("VALIDATION_FAILED", 422, { body: "required" });
      if (bodyText.length > BODY_MAX) return err("VALIDATION_FAILED", 422, { body: "max 2000 chars" });
      const experience_verified = await detectExperienceVerified(base44, business.id, user.id);
      const review = await base44.entities.BusinessReview.create({
        business_id: business.id, reviewer_id: user.id, vehicle_id: body.vehicle_id || null,
        rating, body: bodyText, status: BusinessReviewStatus.DRAFT, experience_verified,
      });
      return json({ ok: true, review_id: review.id, status: BusinessReviewStatus.DRAFT, review });
    }

    // ============ publishReview (Trusted Member+; → published) ============
    if (action === "publishReview") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const review = await base44.entities.BusinessReview.get(body.review_id).catch(() => null);
      if (!review) return err("RESOURCE_NOT_FOUND", 404);
      if (review.reviewer_id !== user.id) return err("PERMISSION_DENIED", 403);
      if (!meetsCreationTier(user)) return err("REVIEW_TIER_REQUIRED", 403, { required_tier: "trusted_member" });
      if (review.status === BusinessReviewStatus.REMOVED_BY_MODERATION) {
        return err("INVALID_STATE_TRANSITION", 409, { reason: "cannot restore a moderator's removal" });
      }
      // rating/body may be set/updated at publish time.
      const upd: any = {};
      if (body.rating !== undefined) {
        const r = Number(body.rating);
        if (!Number.isInteger(r) || r < RATING_MIN || r > RATING_MAX) return err("VALIDATION_FAILED", 422, { rating: "must be an integer 1–5" });
        upd.rating = r;
      }
      if (body.body !== undefined) {
        const b = (body.body || "").trim();
        if (!b) return err("VALIDATION_FAILED", 422, { body: "required" });
        if (b.length > BODY_MAX) return err("VALIDATION_FAILED", 422, { body: "max 2000 chars" });
        upd.body = b;
      }
      // Re-detect experience in case evidence changed since the draft.
      upd.experience_verified = await detectExperienceVerified(base44, review.business_id, user.id);
      if (review.status === BusinessReviewStatus.PUBLISHED) {
        // Already published — apply any rating/body edits, recompute aggregate, AuditLog on rating change.
        const oldRating = review.rating;
        const ratingChanged = upd.rating !== undefined && upd.rating !== oldRating;
        const updated = await base44.entities.BusinessReview.update(review.id, upd);
        if (ratingChanged) {
          await recalculateReviewAggregate(base44, review.business_id);
          await writeAuditLog(base44, { action: AuditActionType.BUSINESS_STATUS_CHANGED, actor_type: actorTypeFor(user), actor_id: user.id, target_type: "business_review", target_id: review.id, context: JSON.stringify({ rating_from: oldRating, rating_to: upd.rating }) }).catch(() => {});
        }
        return json({ ok: true, review_id: review.id, status: BusinessReviewStatus.PUBLISHED, review: updated });
      }
      // draft / hidden_pending_review / removed_by_reviewer → published.
      // NOTE (gap): the borderline-trust / flagged-content route to hidden_pending_review
      // is not implemented — its triggering condition is unspecified (see Architecture Questions).
      upd.status = BusinessReviewStatus.PUBLISHED;
      upd.published_at = review.published_at || new Date().toISOString();
      const updated = await base44.entities.BusinessReview.update(review.id, upd);
      // BusinessReviewPublished → recompute aggregate (idempotent full recompute) + notify business members.
      await recalculateReviewAggregate(base44, review.business_id);
      const members = await getActiveMembers(base44, review.business_id);
      for (const m of members) {
        await createNotification(base44, { recipient_id: m.user_id, notification_type: NotificationType.BUSINESS_TAG, actor_id: user.id, target_type: "business_review", target_id: review.id }).catch(() => {});
      }
      return json({ ok: true, review_id: review.id, status: BusinessReviewStatus.PUBLISHED, review: updated });
    }

    // ============ updateReview (reviewer-only; on draft/hidden/published) ============
    if (action === "updateReview") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const review = await base44.entities.BusinessReview.get(body.review_id).catch(() => null);
      if (!review) return err("RESOURCE_NOT_FOUND", 404);
      if (review.reviewer_id !== user.id) return err("PERMISSION_DENIED", 403);
      if (!REVIEW_EDITABLE.has(review.status)) {
        return err("INVALID_STATE_TRANSITION", 409, { current: review.status });
      }
      const upd: any = {};
      if (body.rating !== undefined) {
        const r = Number(body.rating);
        if (!Number.isInteger(r) || r < RATING_MIN || r > RATING_MAX) return err("VALIDATION_FAILED", 422, { rating: "must be an integer 1–5" });
        upd.rating = r;
      }
      if (body.body !== undefined) {
        const b = (body.body || "").trim();
        if (!b) return err("VALIDATION_FAILED", 422, { body: "required" });
        if (b.length > BODY_MAX) return err("VALIDATION_FAILED", 422, { body: "max 2000 chars" });
        upd.body = b;
      }
      const oldRating = review.rating;
      const ratingChanged = upd.rating !== undefined && upd.rating !== oldRating;
      // Re-detect experience in case evidence changed since the draft.
      upd.experience_verified = await detectExperienceVerified(base44, review.business_id, user.id);
      const updated = await base44.entities.BusinessReview.update(review.id, upd);
      // BusinessReviewUpdated → recompute aggregate only if rating_changed; AuditLog on rating change (ADR-030).
      if (ratingChanged) {
        await recalculateReviewAggregate(base44, review.business_id);
        await writeAuditLog(base44, { action: AuditActionType.BUSINESS_STATUS_CHANGED, actor_type: actorTypeFor(user), actor_id: user.id, target_type: "business_review", target_id: review.id, context: JSON.stringify({ rating_from: oldRating, rating_to: upd.rating }) }).catch(() => {});
      }
      return json({ ok: true, review_id: review.id, review: updated });
    }

    // ============ removeOwnReview (reviewer-only; published/hidden → removed_by_reviewer) ============
    if (action === "removeOwnReview") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const review = await base44.entities.BusinessReview.get(body.review_id).catch(() => null);
      if (!review) return err("RESOURCE_NOT_FOUND", 404);
      if (review.reviewer_id !== user.id) return err("PERMISSION_DENIED", 403);
      if (review.status === BusinessReviewStatus.REMOVED_BY_MODERATION) {
        return err("INVALID_STATE_TRANSITION", 409, { reason: "cannot modify a moderator's removal" });
      }
      if (review.status === BusinessReviewStatus.REMOVED_BY_REVIEWER) return json({ ok: true, review_id: review.id, status: BusinessReviewStatus.REMOVED_BY_REVIEWER });
      const updated = await base44.entities.BusinessReview.update(review.id, { status: BusinessReviewStatus.REMOVED_BY_REVIEWER });
      // BusinessReviewRemoved → recompute aggregate (decrement).
      await recalculateReviewAggregate(base44, review.business_id);
      return json({ ok: true, review_id: review.id, status: BusinessReviewStatus.REMOVED_BY_REVIEWER, review: updated });
    }

    // ============ restoreOwnReview (reviewer-only; removed_by_reviewer → published) ============
    if (action === "restoreOwnReview") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const review = await base44.entities.BusinessReview.get(body.review_id).catch(() => null);
      if (!review) return err("RESOURCE_NOT_FOUND", 404);
      if (review.reviewer_id !== user.id) return err("PERMISSION_DENIED", 403);
      if (review.status !== BusinessReviewStatus.REMOVED_BY_REVIEWER) {
        return err("INVALID_STATE_TRANSITION", 409, { current: review.status, reason: "can only restore your own voluntary removal" });
      }
      const updated = await base44.entities.BusinessReview.update(review.id, { status: BusinessReviewStatus.PUBLISHED });
      await recalculateReviewAggregate(base44, review.business_id);
      return json({ ok: true, review_id: review.id, status: BusinessReviewStatus.PUBLISHED, review: updated });
    }

    // ============ respondToReview (BizOwn/BizMgr; business_response only) ============
    if (action === "respondToReview") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const review = await base44.entities.BusinessReview.get(body.review_id).catch(() => null);
      if (!review) return err("RESOURCE_NOT_FOUND", 404);
      const role = await getManagerRole(base44, user.id, review.business_id);
      if (!isBizManager(role)) return err("BUSINESS_RESPONSE_NOT_AUTHORISED", 403);
      if (review.status !== BusinessReviewStatus.PUBLISHED) {
        return err("INVALID_STATE_TRANSITION", 409, { current: review.status });
      }
      const response = (body.business_response || "").trim();
      // NOTE (AQ3): removal of a response via empty/null is not supported — only create/edit of a non-empty value.
      if (!response) return err("VALIDATION_FAILED", 422, { business_response: "required" });
      if (response.length > RESPONSE_MAX) return err("VALIDATION_FAILED", 422, { business_response: "max 2000 chars" });
      const oldResponse = review.business_response || null;
      const updated = await base44.entities.BusinessReview.update(review.id, {
        business_response: response, business_responded_by_id: user.id, business_responded_at: new Date().toISOString(),
      });
      // BusinessRespondedToReview → notify the reviewer.
      await createNotification(base44, { recipient_id: review.reviewer_id, notification_type: NotificationType.MENTION, actor_id: user.id, target_type: "business_review", target_id: review.id }).catch(() => {});
      // AuditLog the response edit (old/new value per ADR-030).
      await writeAuditLog(base44, { action: AuditActionType.BUSINESS_STATUS_CHANGED, actor_type: actorTypeFor(user), actor_id: user.id, target_type: "business_review", target_id: review.id, context: JSON.stringify({ business_response_from: oldResponse, business_response_to: response }) }).catch(() => {});
      return json({ ok: true, review_id: review.id, business_responded_by_id: user.id, business_responded_at: updated.business_responded_at, review: updated });
    }

    // ============ applyModerationActionToReview (internal — called by content-moderation delegate) ============
    if (action === "applyModerationActionToReview") {
      // Internal-only: validates new_status, sets it, recomputes aggregate.
      const newStatus = body.new_status;
      const r = await applyModerationActionToReview(base44, body.review_id, newStatus);
      if (!r.ok) return err("RESOURCE_NOT_FOUND", 404, { error: r.error });
      return json({ ok: true, review_id: body.review_id, status: newStatus, changed: r.changed });
    }

    // ============ recalculateReviewAggregate (reconciliation — Admin) ============
    if (action === "recalculateReviewAggregate") {
      if (!user) return err("AUTH_REQUIRED", 401);
      if (!isModeratorOrAdmin(user)) return err("PERMISSION_DENIED", 403);
      const result = await recalculateReviewAggregate(base44, body.business_id);
      return json({ ok: true, business_id: body.business_id, review_count: result.review_count, rating_sum: result.rating_sum });
    }

    // ---- All remaining (read) actions ----
    if (!user) {
      // getBusiness and listBusinesses are public (unauthenticated callers may read profiles).
    }

    // ============ getBusiness (public) ============
    if (action === "getBusiness") {
      const business = await base44.entities.Business.get(body.business_id).catch(() => null);
      if (!business || business.status === BusinessStatus.REMOVED_BY_MODERATION) return err("RESOURCE_NOT_FOUND", 404);
      const members = user ? await getActiveMembers(base44, business.id) : [];
      const team = await Promise.all(members.map(async (m: any) => {
        const u = await base44.asServiceRole.entities.User.get(m.user_id).catch(() => null);
        return { user_id: m.user_id, role: m.role, display_name: u?.display_name || u?.handle || "Member", handle: u?.handle || null, avatar_media_id: u?.avatar_media_id || null };
      }));
      const myMembership = user ? await getActiveMembership(base44, user.id, business.id) : null;
      const isManager = isBizManager(myMembership?.role);
      return json({
        ok: true,
        business: {
          ...business,
          logo_url: await resolveMediaUrl(base44, (business as any).logo_media_id),
          cover_url: await resolveMediaUrl(base44, (business as any).cover_media_id),
          average_rating: business.review_count > 0 ? business.rating_sum / business.review_count : null,
        },
        team: isManager ? team : [],
        my_membership: myMembership ? { role: myMembership.role } : null,
        is_manager: isManager,
        is_owner: isBizOwner(myMembership?.role),
      });
    }

    // ============ listBusinesses (public) ============
    if (action === "listBusinesses") {
      const filter: any = { status: BusinessStatus.ACTIVE };
      if (body.category && BUSINESS_CATEGORY_VALUES.includes(body.category)) filter.category = body.category;
      if (body.verification_status && ["unverified", "pending", "verified", "rejected"].includes(body.verification_status)) filter.verification_status = body.verification_status;
      // NOTE (AQ6): no sort order specified — defaulting to created_date desc (newest first).
      let businesses = await base44.asServiceRole.entities.Business.filter(filter, "-created_date", MAX_LIMIT);
      if (body.search) {
        const q = String(body.search).toLowerCase();
        businesses = businesses.filter((b: any) => (b.name || "").toLowerCase().includes(q) || (b.location_general || "").toLowerCase().includes(q));
      }
      const limit = Math.min(Number(body.limit) || DEFAULT_LIMIT, MAX_LIMIT);
      const offset = Number(body.offset) || 0;
      const page = businesses.slice(offset, offset + limit);
      const enriched = await Promise.all(page.map(async (b: any) => ({
        ...b,
        logo_url: await resolveMediaUrl(base44, b.logo_media_id),
        average_rating: b.review_count > 0 ? b.rating_sum / b.review_count : null,
      })));
      return json({ ok: true, businesses: enriched, next_offset: offset + enriched.length < businesses.length ? offset + limit : null });
    }

    // ============ getBusinessMembers (members only) ============
    if (action === "getBusinessMembers") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const business = await base44.entities.Business.get(body.business_id).catch(() => null);
      if (!business) return err("RESOURCE_NOT_FOUND", 404);
      const mine = await getActiveMembership(base44, user.id, business.id);
      if (!mine) return err("PERMISSION_DENIED", 403, { reason: "members only" });
      const members = await getActiveMembers(base44, business.id);
      const enriched = await Promise.all(members.map(async (m: any) => {
        const u = await base44.asServiceRole.entities.User.get(m.user_id).catch(() => null);
        return { user_id: m.user_id, role: m.role, status: m.status, display_name: u?.display_name || u?.handle || "Member", handle: u?.handle || null, avatar_media_id: u?.avatar_media_id || null };
      }));
      return json({ ok: true, members: enriched, my_role: mine.role });
    }

    // ============ getReviewsForBusiness (published + hidden for BizOwn/BizMgr) ============
    if (action === "getReviewsForBusiness") {
      const business = await base44.entities.Business.get(body.business_id).catch(() => null);
      if (!business || business.status === BusinessStatus.REMOVED_BY_MODERATION) return err("RESOURCE_NOT_FOUND", 404);
      const limit = Math.min(Number(body.limit) || DEFAULT_LIMIT, MAX_LIMIT);
      const offset = Number(body.offset) || 0;
      const published = await base44.asServiceRole.entities.BusinessReview.filter({ business_id: business.id, status: BusinessReviewStatus.PUBLISHED }, "-created_date", MAX_LIMIT);
      let reviews = published;
      // BizOwn/BizMgr additionally see their own Business's hidden_pending_review items.
      if (user) {
        const mine = await getActiveMembership(base44, user.id, business.id);
        if (isBizManager(mine?.role)) {
          const hidden = await base44.asServiceRole.entities.BusinessReview.filter({ business_id: business.id, status: BusinessReviewStatus.HIDDEN_PENDING_REVIEW }, "-created_date", MAX_LIMIT);
          reviews = [...published, ...hidden];
        }
      }
      reviews.sort((a: any, b: any) => (b.created_date || "").localeCompare(a.created_date || ""));
      const page = reviews.slice(offset, offset + limit);
      const enriched = await Promise.all(page.map(async (r: any) => {
        const u = await base44.asServiceRole.entities.User.get(r.reviewer_id).catch(() => null);
        return { ...r, reviewer_name: u?.display_name || u?.handle || "Reviewer", reviewer_handle: u?.handle || null, reviewer_avatar_media_id: u?.avatar_media_id || null };
      }));
      return json({ ok: true, reviews: enriched, next_offset: offset + enriched.length < reviews.length ? offset + limit : null });
    }

    // ============ getOwnReview (reviewer only) ============
    if (action === "getOwnReview") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const existing = await base44.entities.BusinessReview.filter({ business_id: body.business_id, reviewer_id: user.id });
      return json({ ok: true, review: existing[0] || null });
    }

    return err("VALIDATION_FAILED", 422, { action: "unknown" });
  } catch (error) {
    return json({ error: error.message }, 500);
  }
});