/**
 * BusinessService (Phase 07) — owns Business, BusinessMembership, BusinessReview.
 *
 * Single-Writer: this function is the ONLY writer to those three entities.
 * Reads (never writes) User (membership), Modification + EventAttendance +
 * Event (experience_verified evidence), Media (logo/cover URL resolution).
 *
 * Methods (per Phase 07 pack): createBusiness, updateBusiness, addMember,
 *   changeMemberRole, removeMember, submitVerification, approveVerification,
 *   rejectVerification, createReviewDraft, publishReview, updateReview,
 *   removeOwnReview, respondToReview, recalculateReviewAggregate (internal).
 *   Plus read helpers: listDirectory, getBusiness, listMyReviews,
 *   listVerificationQueue, listManagedBusinesses.
 *
 * Hard rules enforced:
 *  - Business creation requires Trusted Member+ (ADR-039); creator becomes the
 *    sole initial owner BusinessMembership. Creation NEVER auto-verifies.
 *  - Exactly one owner per Business at all times (ownership-transfer demotes
 *    the previous owner to staff; a sole owner cannot leave/demote without a
 *    successor).
 *  - A Business can NEVER delete a negative review. Only the reviewer
 *    (removeOwnReview) or a Moderator/Admin (applyModerationActionToReview via
 *    the content-moderation delegate) can change a review's status.
 *  - business_response is writable only by an authorised BusinessMembership
 *    (owner/staff); the review's own rating/body is never touched by it.
 *  - A reviewer cannot review a Business they hold a BusinessMembership on.
 *  - experience_verified is set ONLY by BusinessService (this function +
 *    shared refreshExperienceForUser), automatically, from real
 *    Modification/EventAttendance evidence — never by the Business, a human
 *    directly, or AI. No TrustScore signal is awarded for posting a review.
 */
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import {
  BusinessRole, BusinessMembershipStatus, BusinessVerificationStatus, BusinessStatus, BusinessReviewStatus,
  isBizManager, isBizOwner, getActiveMembership, getManagerRole,
  detectExperienceVerified, recalculateReviewAggregate,
  meetsCreationTier, meetsParticipationTier, accountInGoodStanding,
} from "../../shared/business.ts";
import { isModeratorOrAdmin, isAdmin, actorTypeFor } from "../../shared/community.ts";
import { onBusinessVerified } from "../../shared/business-verified.ts";
import { createNotification } from "../../shared/notifications.ts";
import { NotificationType } from "../../shared/identity.ts";
import { writeAuditLog } from "../../shared/audit-log.ts";
import { AuditActionType } from "../../shared/moderation.ts";
import { json, err } from "../../shared/http.ts";
import { resolveMediaUrl } from "../../shared/media.ts";

const RATING_MIN = 1, RATING_MAX = 5;
const NAME_MAX = 100, BODY_MAX = 2000, RESPONSE_MAX = 2000;
const REVIEW_EDITABLE = new Set([BusinessReviewStatus.DRAFT, BusinessReviewStatus.HIDDEN_PENDING_REVIEW]);

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
      const data: any = {
        name,
        description: (body.description || "").trim() || null,
        about: (body.about || "").trim() || null,
        category: (body.category || "").trim() || null,
        location_general: (body.location_general || "").trim() || null,
        website_url: (body.website_url || "").trim() || null,
        phone: (body.phone || "").trim() || null,
        email: (body.email || "").trim() || null,
        logo_media_id: body.logo_media_id || null,
        cover_media_id: body.cover_media_id || null,
        verification_status: BusinessVerificationStatus.UNVERIFIED,
        review_count: 0,
        rating_sum: 0,
        status: BusinessStatus.ACTIVE,
      };
      const business = await base44.entities.Business.create(data);
      // Atomic initial owner membership (exactly one owner at creation).
      await base44.entities.BusinessMembership.create({
        business_id: business.id, user_id: user.id, role: BusinessRole.OWNER, status: BusinessMembershipStatus.ACTIVE,
      });
      return json({ ok: true, business });
    }

    // ============ updateBusiness (BizMgr only) ============
    if (action === "updateBusiness") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const business = await base44.entities.Business.get(body.business_id).catch(() => null);
      if (!business) return err("RESOURCE_NOT_FOUND", 404);
      const role = await getManagerRole(base44, user.id, business.id);
      if (!isBizManager(role)) return err("PERMISSION_DENIED", 403);
      // Protected fields — never client-settable.
      for (const f of ["verification_status", "review_count", "rating_sum", "status"]) {
        if (body[f] !== undefined) return err("PERMISSION_DENIED", 403, { [f]: "not settable" });
      }
      const upd: any = {};
      if (body.name !== undefined) {
        const n = (body.name || "").trim();
        if (!n || n.length > NAME_MAX) return err("VALIDATION_FAILED", 422, { name: "required, max 100 chars" });
        upd.name = n;
      }
      for (const f of ["description", "about", "category", "location_general", "website_url", "phone", "email"]) {
        if (body[f] !== undefined) upd[f] = (body[f] || "").trim() || null;
      }
      for (const f of ["logo_media_id", "cover_media_id"]) {
        if (body[f] !== undefined) upd[f] = body[f] || null;
      }
      const updated = await base44.entities.Business.update(business.id, upd);
      return json({ ok: true, business: updated });
    }

    // ============ addMember (BizOwn only; staff only) ============
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
      const existing = await getActiveMembership(base44, targetId, business.id);
      if (existing) return err("CONFLICT", 409, { user_id: "already a member" });
      const membership = await base44.entities.BusinessMembership.create({
        business_id: business.id, user_id: targetId, role: BusinessRole.STAFF, status: BusinessMembershipStatus.ACTIVE,
      });
      await createNotification(base44, {
        recipient_id: targetId, notification_type: NotificationType.BUSINESS_TAG,
        actor_id: user.id, target_type: "business", target_id: business.id,
      }).catch(() => {});
      return json({ ok: true, membership });
    }

    // ============ changeMemberRole (BizOwn only; ownership transfer demotes self) ============
    if (action === "changeMemberRole") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const business = await base44.entities.Business.get(body.business_id).catch(() => null);
      if (!business) return err("RESOURCE_NOT_FOUND", 404);
      const myRole = await getManagerRole(base44, user.id, business.id);
      if (!isBizOwner(myRole)) return err("PERMISSION_DENIED", 403, { reason: "owner only" });
      const newRole = body.role;
      if (![BusinessRole.OWNER, BusinessRole.STAFF].includes(newRole)) {
        return err("VALIDATION_FAILED", 422, { role: "must be owner or staff" });
      }
      const target = await getActiveMembership(base44, body.user_id, business.id);
      if (!target) return err("RESOURCE_NOT_FOUND", 404, { membership: "not found" });
      if (newRole === BusinessRole.OWNER) {
        if (target.role === BusinessRole.OWNER) return json({ ok: true, membership: target, changed: false });
        // Ownership transfer: promote target, demote the current owner (caller) to staff.
        await base44.entities.BusinessMembership.update(target.id, { role: BusinessRole.OWNER });
        const me = await getActiveMembership(base44, user.id, business.id);
        if (me) await base44.entities.BusinessMembership.update(me.id, { role: BusinessRole.STAFF });
        return json({ ok: true, changed: true });
      }
      // newRole === staff
      if (target.role === BusinessRole.OWNER) {
        return err("INVALID_STATE_TRANSITION", 409, { role: "cannot demote the sole owner — transfer ownership first" });
      }
      await base44.entities.BusinessMembership.update(target.id, { role: BusinessRole.STAFF });
      return json({ ok: true, changed: true });
    }

    // ============ removeMember (BizOwn removes staff; self-leave allowed) ============
    if (action === "removeMember") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const business = await base44.entities.Business.get(body.business_id).catch(() => null);
      if (!business) return err("RESOURCE_NOT_FOUND", 404);
      const target = await getActiveMembership(base44, body.user_id, business.id);
      if (!target) return err("RESOURCE_NOT_FOUND", 404, { membership: "not found" });
      const isSelf = body.user_id === user.id;
      if (target.role === BusinessRole.OWNER) {
        // Only self-leave of an owner is conceivable, and only with a successor — reject otherwise.
        return err("INVALID_STATE_TRANSITION", 409, { membership: "cannot remove the owner — transfer ownership first" });
      }
      if (!isSelf) {
        const myRole = await getManagerRole(base44, user.id, business.id);
        if (!isBizOwner(myRole)) return err("PERMISSION_DENIED", 403, { reason: "owner only" });
      }
      await base44.entities.BusinessMembership.update(target.id, { status: BusinessMembershipStatus.REMOVED });
      return json({ ok: true });
    }

    // ============ submitVerification (BizMgr) ============
    if (action === "submitVerification") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const business = await base44.entities.Business.get(body.business_id).catch(() => null);
      if (!business) return err("RESOURCE_NOT_FOUND", 404);
      const role = await getManagerRole(base44, user.id, business.id);
      if (!isBizManager(role)) return err("PERMISSION_DENIED", 403);
      if (![BusinessVerificationStatus.UNVERIFIED, BusinessVerificationStatus.REJECTED].includes(business.verification_status)) {
        return err("INVALID_STATE_TRANSITION", 409, { current: business.verification_status });
      }
      const updated = await base44.entities.Business.update(business.id, { verification_status: BusinessVerificationStatus.PENDING });
      await writeAuditLog(base44, {
        action: AuditActionType.BUSINESS_STATUS_CHANGED, actor_type: actorTypeFor(user), actor_id: user.id,
        target_type: "business", target_id: business.id,
        context: JSON.stringify({ from: business.verification_status, to: BusinessVerificationStatus.PENDING }),
      }).catch(() => {});
      return json({ ok: true, business: updated });
    }

    // ============ approveVerification (Mod/Admin) ============
    if (action === "approveVerification") {
      if (!user || !isModeratorOrAdmin(user)) return err("PERMISSION_DENIED", 403);
      const business = await base44.entities.Business.get(body.business_id).catch(() => null);
      if (!business) return err("RESOURCE_NOT_FOUND", 404);
      if (business.verification_status !== BusinessVerificationStatus.PENDING) {
        return err("INVALID_STATE_TRANSITION", 409, { current: business.verification_status });
      }
      const updated = await base44.entities.Business.update(business.id, { verification_status: BusinessVerificationStatus.VERIFIED });
      // BusinessVerified event consumers (trust signal + notification + audit).
      const owner = await getActiveMembership(base44, business.id, ""); // placeholder; resolve owner below
      const owners = await base44.entities.BusinessMembership.filter({ business_id: business.id, role: BusinessRole.OWNER, status: BusinessMembershipStatus.ACTIVE });
      const ownerId = owners[0]?.user_id;
      if (ownerId) {
        await onBusinessVerified(base44, { business_id: business.id, business_name: business.name, owner_id: ownerId, actor_id: user.id }).catch(() => {});
      }
      return json({ ok: true, business: updated });
    }

    // ============ rejectVerification (Mod/Admin) ============
    if (action === "rejectVerification") {
      if (!user || !isModeratorOrAdmin(user)) return err("PERMISSION_DENIED", 403);
      const business = await base44.entities.Business.get(body.business_id).catch(() => null);
      if (!business) return err("RESOURCE_NOT_FOUND", 404);
      if (business.verification_status !== BusinessVerificationStatus.PENDING) {
        return err("INVALID_STATE_TRANSITION", 409, { current: business.verification_status });
      }
      const updated = await base44.entities.Business.update(business.id, { verification_status: BusinessVerificationStatus.REJECTED });
      const owners = await base44.entities.BusinessMembership.filter({ business_id: business.id, role: BusinessRole.OWNER, status: BusinessMembershipStatus.ACTIVE });
      if (owners[0]) {
        await createNotification(base44, {
          recipient_id: owners[0].user_id, notification_type: NotificationType.MODERATION_OUTCOME,
          actor_id: user.id, target_type: "business", target_id: business.id,
        }).catch(() => {});
      }
      await writeAuditLog(base44, {
        action: AuditActionType.BUSINESS_STATUS_CHANGED, actor_type: actorTypeFor(user), actor_id: user.id,
        target_type: "business", target_id: business.id,
        context: JSON.stringify({ from: BusinessVerificationStatus.PENDING, to: BusinessVerificationStatus.REJECTED }),
      }).catch(() => {});
      return json({ ok: true, business: updated });
    }

    // ============ createReviewDraft (New Member+ w/ verified contact; not a member) ============
    if (action === "createReviewDraft") {
      if (!user) return err("AUTH_REQUIRED", 401);
      if (!accountInGoodStanding(user)) {
        return err(user.account_status === "banned" ? "ACCOUNT_BANNED" : "ACCOUNT_SUSPENDED", 403);
      }
      if (!meetsParticipationTier(user)) return err("PERMISSION_DENIED", 403, { required_tier: "new_member" });
      const business = await base44.entities.Business.get(body.business_id).catch(() => null);
      if (!business || business.status !== BusinessStatus.ACTIVE) return err("RESOURCE_NOT_FOUND", 404);
      // Self-review rejection: a member cannot review their own business.
      const membership = await getActiveMembership(base44, user.id, business.id);
      if (membership) return err("SELF_REVIEW_REJECTED", 422, { reason: "cannot review a business you hold a membership on" });
      // One review per reviewer per business (while not removed).
      const existing = await base44.entities.BusinessReview.filter({ business_id: business.id, reviewer_id: user.id });
      if (existing.some((r: any) => r.status !== BusinessReviewStatus.REMOVED_BY_REVIEWER && r.status !== BusinessReviewStatus.REMOVED_BY_MODERATION)) {
        return err("CONFLICT", 409, { review: "you already have a review for this business — use updateReview" });
      }
      const rating = Number(body.rating);
      if (!Number.isInteger(rating) || rating < RATING_MIN || rating > RATING_MAX) {
        return err("VALIDATION_FAILED", 422, { rating: "must be an integer 1–5" });
      }
      const bodyText = body.body ? String(body.body).slice(0, BODY_MAX) : null;
      const experience_verified = await detectExperienceVerified(base44, business.id, user.id);
      const review = await base44.entities.BusinessReview.create({
        business_id: business.id, reviewer_id: user.id, rating, body: bodyText,
        status: BusinessReviewStatus.DRAFT, experience_verified, published_at: null,
      });
      return json({ ok: true, review });
    }

    // ============ publishReview (reviewer; Trusted Member+ to publish) ============
    if (action === "publishReview") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const review = await base44.entities.BusinessReview.get(body.review_id).catch(() => null);
      if (!review) return err("RESOURCE_NOT_FOUND", 404);
      if (review.reviewer_id !== user.id) return err("PERMISSION_DENIED", 403);
      if (review.status === BusinessReviewStatus.REMOVED_BY_MODERATION) {
        return err("INVALID_STATE_TRANSITION", 409, { reason: "cannot restore a moderator's removal" });
      }
      if (review.status === BusinessReviewStatus.PUBLISHED) return json({ ok: true, review, changed: false });
      // Below Trusted: a draft can be saved as hidden_pending_review (pending tier).
      if (!meetsCreationTier(user)) {
        if (review.status === BusinessReviewStatus.DRAFT) {
          const updated = await base44.entities.BusinessReview.update(review.id, { status: BusinessReviewStatus.HIDDEN_PENDING_REVIEW });
          return json({ ok: true, review: updated, pending_tier: true });
        }
        return err("PERMISSION_DENIED", 403, { required_tier: "trusted_member" });
      }
      // Trusted Member+: draft / hidden_pending_review / removed_by_reviewer → published.
      const updated = await base44.entities.BusinessReview.update(review.id, {
        status: BusinessReviewStatus.PUBLISHED,
        published_at: review.published_at || new Date().toISOString(),
      });
      await recalculateReviewAggregate(base44, review.business_id);
      // BusinessReviewPublished → notify the business owner(s).
      const owners = await base44.entities.BusinessMembership.filter({ business_id: review.business_id, role: BusinessRole.OWNER, status: BusinessMembershipStatus.ACTIVE });
      for (const o of owners) {
        await createNotification(base44, {
          recipient_id: o.user_id, notification_type: NotificationType.BUSINESS_TAG,
          actor_id: user.id, target_type: "business_review", target_id: review.id,
        }).catch(() => {});
      }
      return json({ ok: true, review: updated, changed: true });
    }

    // ============ updateReview (reviewer; only while draft/hidden) ============
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
      if (body.body !== undefined) upd.body = body.body ? String(body.body).slice(0, BODY_MAX) : null;
      // Re-detect experience in case evidence changed since the draft was created.
      upd.experience_verified = await detectExperienceVerified(base44, review.business_id, user.id);
      const updated = await base44.entities.BusinessReview.update(review.id, upd);
      return json({ ok: true, review: updated });
    }

    // ============ removeOwnReview (reviewer only; never a business) ============
    if (action === "removeOwnReview") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const review = await base44.entities.BusinessReview.get(body.review_id).catch(() => null);
      if (!review) return err("RESOURCE_NOT_FOUND", 404);
      if (review.reviewer_id !== user.id) return err("PERMISSION_DENIED", 403);
      if (review.status === BusinessReviewStatus.REMOVED_BY_MODERATION) {
        return err("INVALID_STATE_TRANSITION", 409, { reason: "cannot modify a moderator's removal" });
      }
      if (review.status === BusinessReviewStatus.REMOVED_BY_REVIEWER) return json({ ok: true, changed: false });
      const updated = await base44.entities.BusinessReview.update(review.id, { status: BusinessReviewStatus.REMOVED_BY_REVIEWER });
      await recalculateReviewAggregate(base44, review.business_id);
      return json({ ok: true, review: updated, changed: true });
    }

    // ============ respondToReview (BizMgr; business_response only) ============
    if (action === "respondToReview") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const review = await base44.entities.BusinessReview.get(body.review_id).catch(() => null);
      if (!review) return err("RESOURCE_NOT_FOUND", 404);
      const role = await getManagerRole(base44, user.id, review.business_id);
      if (!isBizManager(role)) return err("PERMISSION_DENIED", 403);
      if (review.status !== BusinessReviewStatus.PUBLISHED) {
        return err("INVALID_STATE_TRANSITION", 409, { current: review.status });
      }
      const response = (body.business_response || "").trim();
      if (!response) return err("VALIDATION_FAILED", 422, { business_response: "required" });
      if (response.length > RESPONSE_MAX) return err("VALIDATION_FAILED", 422, { business_response: "max 2000 chars" });
      // Only business_response + responded_at — never rating/body.
      const updated = await base44.entities.BusinessReview.update(review.id, {
        business_response: response, responded_at: new Date().toISOString(),
      });
      // BusinessRespondedToReview → notify the reviewer.
      await createNotification(base44, {
        recipient_id: review.reviewer_id, notification_type: NotificationType.MENTION,
        actor_id: user.id, target_type: "business_review", target_id: review.id,
      }).catch(() => {});
      return json({ ok: true, review: updated });
    }

    // ============ recalcAggregate (internal/reconciliation) ============
    if (action === "recalcAggregate") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const result = await recalculateReviewAggregate(base44, body.business_id);
      return json({ ok: true, ...result });
    }

    // All remaining (read) actions require auth.
    if (!user) return err("AUTH_REQUIRED", 401);

    // ============ listDirectory ============
    if (action === "listDirectory") {
      let businesses = await base44.entities.Business.filter({ status: BusinessStatus.ACTIVE }, "-rating_sum", 200);
      if (body.search) {
        const q = String(body.search).toLowerCase();
        businesses = businesses.filter((b: any) => (b.name || "").toLowerCase().includes(q) || (b.category || "").toLowerCase().includes(q) || (b.location_general || "").toLowerCase().includes(q));
      }
      const enriched = await Promise.all(businesses.map(async (b: any) => ({
        ...b,
        logo_url: await resolveMediaUrl(base44, b.logo_media_id),
        average_rating: b.review_count > 0 ? b.rating_sum / b.review_count : null,
      })));
      return json({ ok: true, businesses: enriched });
    }

    // ============ getBusiness (about/reviews/team) ============
    if (action === "getBusiness") {
      const business = await base44.entities.Business.get(body.business_id).catch(() => null);
      if (!business || business.status === BusinessStatus.REMOVED_BY_MODERATION) return err("RESOURCE_NOT_FOUND", 404);
      const members = await base44.entities.BusinessMembership.filter({ business_id: business.id, status: BusinessMembershipStatus.ACTIVE });
      const team = await Promise.all(members.map(async (m: any) => {
        const u = await base44.asServiceRole.entities.User.get(m.user_id).catch(() => null);
        return { user_id: m.user_id, role: m.role, display_name: u?.display_name || u?.handle || "Member", handle: u?.handle || null, avatar_media_id: u?.avatar_media_id || null };
      }));
      const reviews = await base44.entities.BusinessReview.filter({ business_id: business.id, status: BusinessReviewStatus.PUBLISHED }, "-published_at", 100);
      const enrichedReviews = await Promise.all(reviews.map(async (r: any) => {
        const u = await base44.asServiceRole.entities.User.get(r.reviewer_id).catch(() => null);
        return { ...r, reviewer_name: u?.display_name || u?.handle || "Reviewer", reviewer_handle: u?.handle || null, reviewer_avatar_media_id: u?.avatar_media_id || null };
      }));
      const myMembership = await getActiveMembership(base44, user.id, business.id);
      const myReview = (await base44.entities.BusinessReview.filter({ business_id: business.id, reviewer_id: user.id }))[0] || null;
      const canReview = !myMembership && meetsParticipationTier(user) && (!myReview || myReview.status === BusinessReviewStatus.REMOVED_BY_REVIEWER || myReview.status === BusinessReviewStatus.REMOVED_BY_MODERATION);
      return json({
        ok: true,
        business: {
          ...business,
          logo_url: await resolveMediaUrl(base44, business.logo_media_id),
          cover_url: await resolveMediaUrl(base44, business.cover_media_id),
          average_rating: business.review_count > 0 ? business.rating_sum / business.review_count : null,
        },
        team, reviews: enrichedReviews,
        my_membership: myMembership ? { role: myMembership.role } : null,
        my_review: myReview,
        is_manager: isBizManager(myMembership?.role),
        can_review: canReview,
      });
    }

    // ============ listMyReviews ============
    if (action === "listMyReviews") {
      const mine = await base44.entities.BusinessReview.filter({ reviewer_id: user.id }, "-updated_date", 200);
      const enriched = await Promise.all(mine.map(async (r: any) => {
        const b = await base44.asServiceRole.entities.Business.get(r.business_id).catch(() => null);
        return { ...r, business_name: b?.name || "Business", business_status: b?.status };
      }));
      return json({ ok: true, reviews: enriched });
    }

    // ============ listVerificationQueue (Mod/Admin) ============
    if (action === "listVerificationQueue") {
      if (!isModeratorOrAdmin(user)) return err("PERMISSION_DENIED", 403);
      const pending = await base44.entities.Business.filter({ verification_status: BusinessVerificationStatus.PENDING, status: BusinessStatus.ACTIVE }, "created_date", 200);
      const enriched = await Promise.all(pending.map(async (b: any) => {
        const owners = await base44.entities.BusinessMembership.filter({ business_id: b.id, role: BusinessRole.OWNER, status: BusinessMembershipStatus.ACTIVE });
        const o = owners[0];
        const ownerUser = o ? await base44.asServiceRole.entities.User.get(o.user_id).catch(() => null) : null;
        return { ...b, owner_name: ownerUser?.display_name || ownerUser?.handle || "Unknown", owner_id: o?.user_id || null };
      }));
      return json({ ok: true, businesses: enriched });
    }

    // ============ listManagedBusinesses (for nav / business-organised events) ============
    if (action === "listManagedBusinesses") {
      const mine = await base44.entities.BusinessMembership.filter({ user_id: user.id, status: BusinessMembershipStatus.ACTIVE });
      const businesses = await Promise.all(mine.map(async (m: any) => {
        const b = await base44.asServiceRole.entities.Business.get(m.business_id).catch(() => null);
        if (!b || b.status !== BusinessStatus.ACTIVE) return null;
        return { ...b, my_role: m.role, logo_url: await resolveMediaUrl(base44, b.logo_media_id) };
      }));
      return json({ ok: true, businesses: businesses.filter(Boolean) });
    }

    return err("VALIDATION_FAILED", 422, { action: "unknown" });
  } catch (error) {
    return json({ error: error.message }, 500);
  }
});