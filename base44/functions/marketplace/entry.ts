/**
 * MarketplaceService (Phase 08, Final spec) — owns MarketplaceListing,
 * MarketplaceConversation, MarketplaceMessage. The single writer to those
 * three entities. UserBlock writes go through SafetyService helpers.
 *
 * Reads (never writes): User, Vehicle (ownership + sale_status sync via the
 * VehicleService-delegated markVehicleSoldFromListing helper), TrustScore/
 * TrustScoreEvent (verified-contact check + MARKETPLACE_SUCCESS signal via
 * awardSignalToUser), UserBlock (block-list via SafetyService).
 *
 * Public methods (Section F): createListingDraft, updateListing, publishListing,
 *   reserveListing, markCompleted, renewListing, removeListing,
 *   startConversation, sendMessage, archiveConversation, removeOwnMessage.
 * Read methods (Section F.14): getListing, listListings, getConversation,
 *   listConversations, listMessages. (listMyListings retained for the UI's
 *   "my listings" surface.)
 * System method: expireListings (called by the 15-minute expiry workflow).
 * Block helpers: blockUser, unblockUser (SafetyService block-list CRUD).
 *
 * Hard rules enforced:
 *  - Any tier may draft; Trusted Member+ (meetsCreationTier) publishes straight
 *    to active; below Trusted routes to pending_review (never rejected outright).
 *  - Suspended/banned/restricted accounts cannot publish or message.
 *  - New Member+ with a verified email/phone to start a conversation.
 *  - isBlockedEitherDirection is checked before startConversation (USER_BLOCKED)
 *    AND sendMessage (MESSAGE_ACCESS_REVOKED); existing history stays fully
 *    visible (listMessages never checks block state).
 *  - Contact-sharing patterns WARN the sender (CONTACT_SHARING_WARNING, 200
 *    ok:false) and only send on a confirmed re-call with
 *    confirmed_despite_warning=true — never hard-blocked.
 *  - A vehicle-category for_sale listing requires a primary_vehicle_id the
 *    poster owns (ownership validated, not assumed).
 *  - completed / removed_by_moderation / removed_by_poster are terminal.
 *  - renewListing only from expired; rejects within 24h of last_renewed_at
 *    (LISTING_RENEWAL_TOO_SOON).
 *  - poster_id is the canonical poster field; UI derives Buyer/Seller from
 *    listing_type at render time (never assumes poster=seller).
 */
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { checkRateLimit, rateLimitResponse } from "../../shared/rate-limit.ts";
import {
  LISTING_TYPE_VALUES, LISTING_CATEGORY_VALUES, LISTING_CONDITION_VALUES, PRICE_TYPE_VALUES,
  ListingStatus, ListingType, ListingCategory, ListingCondition, PriceType, MessageStatus,
  RENEWAL_WINDOW_MS, LISTING_LIFETIME_MS, TITLE_MAX, DESCRIPTION_MAX, MESSAGE_BODY_MAX,
  TERMINAL_STATUSES, detectContactSharing,
  validateCategoryAttributes, applicableCategoryFields, CATEGORY_ATTR_FIELDS, OEM_OR_AFTERMARKET_VALUES,
  validateAdditionalSpecifications, computeListingQualityScore,
  validateCompatibilityFields, COMPATIBILITY_FIELDS,
  onListingCompleted, onListingExpired, onMarketplaceConversationStarted, onMarketplaceMessageSent,
  AUCTION_DURATION_DAYS, AUCTION_MIN_BID_INCREMENT_CENTS,
} from "../../shared/marketplace.ts";
import { meetsCreationTier, meetsParticipationTier, accountInGoodStanding } from "../../shared/community.ts";
import { isBlockedEitherDirection, createBlock, removeBlock } from "../../shared/safety.ts";
import { validateReference, ReferenceTypes } from "../../shared/reference-resolver.ts";
import { hasEntitlement } from "../../shared/entitlement.ts";
import { EntitlementKey } from "../../shared/identity.ts";
import { json, err } from "../../shared/http.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

// Validates auction fields for create/update. Returns { ok, fields, error }.
function validateAuctionFields(body: any, price_type: string): { ok: true; fields: any } | { ok: false; error: any } {
  if (price_type !== PriceType.AUCTION) {
    return { ok: true, fields: {
      auction_min_bid_cents: null, auction_reserve_cents: null, auction_duration_days: null,
    } };
  }
  const minBid = Number(body.auction_min_bid_cents);
  if (!Number.isInteger(minBid) || minBid <= 0) {
    return { ok: false, error: { code: "VALIDATION_FAILED", field: "auction_min_bid_cents", message: "required, positive integer cents" } };
  }
  const duration = Number(body.auction_duration_days);
  if (!AUCTION_DURATION_DAYS.includes(duration)) {
    return { ok: false, error: { code: "VALIDATION_FAILED", field: "auction_duration_days", message: "must be 3, 5, or 7" } };
  }
  const fields: any = { auction_min_bid_cents: minBid, auction_duration_days: duration };
  if (body.auction_reserve_cents != null && body.auction_reserve_cents !== "") {
    const reserve = Number(body.auction_reserve_cents);
    if (!Number.isInteger(reserve) || reserve < 0) {
      return { ok: false, error: { code: "VALIDATION_FAILED", field: "auction_reserve_cents", message: "non-negative integer cents" } };
    }
    if (reserve < minBid) {
      return { ok: false, error: { code: "VALIDATION_FAILED", field: "auction_reserve_cents", message: "reserve must be >= starting bid" } };
    }
    fields.auction_reserve_cents = reserve;
  } else {
    fields.auction_reserve_cents = null;
  }
  return { ok: true, fields };
}

const DEFAULT_LIMIT = 20, MAX_LIMIT = 100;
const PUBLIC_VISIBLE_STATUSES = [ListingStatus.ACTIVE, ListingStatus.RESERVED, ListingStatus.COMPLETED];
const CONTACT_WARNING_MSG = "Your message appears to contain contact information. Scammers often try to move conversations off-platform — are you sure you want to send this?";

function rid() {
  try { return crypto.randomUUID(); } catch { return Math.random().toString(36).slice(2); }
}

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

async function validateOwnedVehicle(base44: any, user: any, vehicleId: string): Promise<{ ok: boolean; error?: string }> {
  const ref = await validateReference(base44, { target_type: ReferenceTypes.VEHICLE, target_id: vehicleId, allowedTypes: [ReferenceTypes.VEHICLE] });
  if (!ref.valid) return { ok: false, error: ref.error || "vehicle not found" };
  try {
    const v = await base44.asServiceRole.entities.Vehicle.get(vehicleId);
    if (v.created_by_id !== user.id) return { ok: false, error: "vehicle must belong to you" };
    return { ok: true };
  } catch {
    return { ok: false, error: "vehicle not found" };
  }
}

function isMod(user: any): boolean {
  return !!user && (user.role === "admin" || user.account_tier === "moderator");
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // Rate limiting (abuse mitigation): counts caller's own recent records; see shared/rate-limit.ts
    if (action === "createListingDraft") {
      const rl = await checkRateLimit(base44, user?.id, "MarketplaceListing", [{ limit: 10, windowSec: 3600 }, { limit: 50, windowSec: 86400 }]);
      if (rl.limited) return rateLimitResponse(rl.retryAfter);
    }
    if (action === "startConversation") {
      const rl = await checkRateLimit(base44, user?.id, "MarketplaceConversation", [{ limit: 30, windowSec: 60 }]);
      if (rl.limited) return rateLimitResponse(rl.retryAfter);
    }
    if (action === "sendMessage") {
      const rl = await checkRateLimit(base44, user?.id, "MarketplaceMessage", [{ limit: 30, windowSec: 60 }]);
      if (rl.limited) return rateLimitResponse(rl.retryAfter);
    }

    // ============ createListingDraft (F.1 — any tier, good standing) ============
    if (action === "createListingDraft") {
      if (!user) return err("AUTH_REQUIRED", 401);
      if (!accountInGoodStanding(user)) return err(user.account_status === "banned" ? "ACCOUNT_BANNED" : "ACCOUNT_SUSPENDED", 403);
      const title = (body.title || "").trim();
      if (!title || title.length > TITLE_MAX) return err("VALIDATION_FAILED", 422, { title: "required, max 140 chars" });
      const listing_type = LISTING_TYPE_VALUES.includes(body.listing_type) ? body.listing_type : null;
      if (!listing_type) return err("VALIDATION_FAILED", 422, { listing_type: "invalid" });
      const category = LISTING_CATEGORY_VALUES.includes(body.category) ? body.category : null;
      if (!category) return err("VALIDATION_FAILED", 422, { category: "invalid" });
      const price_type = PRICE_TYPE_VALUES.includes(body.price_type) ? body.price_type : PriceType.FIXED;
      // price_cents required for fixed/negotiable; null for poa/free.
      let price_cents: number | null = null;
      if (body.price_cents !== undefined && body.price_cents !== null) {
        const pc = Number(body.price_cents);
        if (!Number.isInteger(pc) || pc < 0) return err("VALIDATION_FAILED", 422, { price_cents: "must be a non-negative integer (cents)" });
        price_cents = pc;
      }
      if ((price_type === PriceType.FIXED || price_type === PriceType.NEGOTIABLE) && price_cents === null) {
        return err("VALIDATION_FAILED", 422, { price_cents: "required for fixed/negotiable price_type" });
      }
      if ((price_type === PriceType.POA || price_type === PriceType.FREE) && price_cents !== null) {
        return err("VALIDATION_FAILED", 422, { price_cents: "must be null for poa/free price_type" });
      }
      // Auction price_type: requires premium subscription (create_auction entitlement).
      let auctionFields: any = null;
      if (price_type === PriceType.AUCTION) {
        if (price_cents !== null) return err("VALIDATION_FAILED", 422, { price_cents: "must be null for auction price_type" });
        const allowed = await hasEntitlement(base44, "user", user.id, EntitlementKey.CREATE_AUCTION);
        if (!allowed) return err("AUCTION_REQUIRES_PREMIUM", 403, { entitlement: "create_auction" });
        const auctionRes = validateAuctionFields(body, price_type);
        if (!auctionRes.ok) return err(auctionRes.error.code, 422, { field: auctionRes.error.field, message: auctionRes.error.message });
        auctionFields = auctionRes.fields;
      }
      const condition = LISTING_CONDITION_VALUES.includes(body.condition) ? body.condition : ListingCondition.USED;
      const quantity = Number.isInteger(Number(body.quantity)) && Number(body.quantity) > 0 ? Number(body.quantity) : 1;
      const fields: any = {
        title, listing_type, category, poster_id: user.id,
        price_type, price_cents, condition, quantity,
        status: ListingStatus.DRAFT, view_count: 0, conversation_count: 0,
        photo_urls: [], video_urls: [], additional_specifications: [],
      };
      if (auctionFields) Object.assign(fields, auctionFields);
      if (body.description !== undefined) fields.description = (body.description || "").trim().slice(0, DESCRIPTION_MAX) || null;
      if (body.location_general !== undefined) fields.location_general = (body.location_general || "").trim() || null;
      // Compatibility year range — only accepted when category != vehicle.
      if (category !== ListingCategory.VEHICLE) {
        for (const f of ["compatible_year_from", "compatible_year_to"]) {
          if (body[f] !== undefined && body[f] !== null) {
            const y = Number(body[f]);
            if (!Number.isInteger(y) || y < 1900 || y > 2100) return err("VALIDATION_FAILED", 422, { [f]: "invalid year" });
            fields[f] = y;
          }
        }
      }
      // ADR-043: bounded-enum compatibility arrays (validated for all categories;
      // vehicle category rejects non-empty values with CATEGORY_FIELD_MISMATCH).
      const compatRes = validateCompatibilityFields(category, body);
      if (!compatRes.ok) return err(compatRes.error.code, 422, { field: compatRes.error.field, message: compatRes.error.message });
      Object.assign(fields, compatRes.fields);
      // ADR-042 category attributes — validate + reject category-mismatched fields.
      const catAttr = validateCategoryAttributes(category, body, {});
      if (!catAttr.ok) return err(catAttr.error.code, 422, { field: catAttr.error.field, message: catAttr.error.message });
      Object.assign(fields, catAttr.fields);
      // ADR-045: media + additional specifications.
      if (Array.isArray(body.photo_urls)) fields.photo_urls = body.photo_urls.filter((u: any) => typeof u === "string").slice(0, 10);
      if (Array.isArray(body.video_urls)) fields.video_urls = body.video_urls.filter((u: any) => typeof u === "string").slice(0, 3);
      const specRes = validateAdditionalSpecifications(body);
      if (!specRes.ok) return err(specRes.error.code, 422, { field: specRes.error.field, message: specRes.error.message });
      if (specRes.fields !== undefined) fields.additional_specifications = specRes.fields;
      if (body.primary_vehicle_id !== undefined && body.primary_vehicle_id) {
        const ov = await validateOwnedVehicle(base44, user, body.primary_vehicle_id);
        if (!ov.ok) return err("VALIDATION_FAILED", 422, { primary_vehicle_id: ov.error });
        fields.primary_vehicle_id = body.primary_vehicle_id;
      }
      // Vehicle-category for_sale requires an owned primary_vehicle_id.
      if (category === ListingCategory.VEHICLE && listing_type === ListingType.FOR_SALE && !fields.primary_vehicle_id) {
        return err("VALIDATION_FAILED", 422, { primary_vehicle_id: "required for vehicle for_sale listings" });
      }
      const listing = await base44.entities.MarketplaceListing.create(fields);
      return json({ ok: true, listing_id: listing.id, status: ListingStatus.DRAFT, listing });
    }

    // ============ updateListing (F.2 — poster only; non-terminal) ============
    if (action === "updateListing") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const listing = await base44.entities.MarketplaceListing.get(body.listing_id).catch(() => null);
      if (!listing) return err("RESOURCE_NOT_FOUND", 404);
      if (listing.poster_id !== user.id) return err("PERMISSION_DENIED", 403);
      if (TERMINAL_STATUSES.has(listing.status)) {
        return err("INVALID_STATE_TRANSITION", 409, { current: listing.status });
      }
      const upd: any = {};
      if (body.title !== undefined) {
        const t = (body.title || "").trim();
        if (!t || t.length > TITLE_MAX) return err("VALIDATION_FAILED", 422, { title: "required, max 140 chars" });
        upd.title = t;
      }
      if (body.listing_type !== undefined) {
        if (!LISTING_TYPE_VALUES.includes(body.listing_type)) return err("VALIDATION_FAILED", 422, { listing_type: "invalid" });
        upd.listing_type = body.listing_type;
      }
      if (body.category !== undefined) {
        if (!LISTING_CATEGORY_VALUES.includes(body.category)) return err("VALIDATION_FAILED", 422, { category: "invalid" });
        upd.category = body.category;
      }
      if (body.description !== undefined) upd.description = (body.description || "").trim().slice(0, DESCRIPTION_MAX) || null;
      if (body.price_type !== undefined) {
        if (!PRICE_TYPE_VALUES.includes(body.price_type)) return err("VALIDATION_FAILED", 422, { price_type: "invalid" });
        upd.price_type = body.price_type;
      }
      if (body.price_cents !== undefined) {
        if (body.price_cents === null) {
          upd.price_cents = null;
        } else {
          const pc = Number(body.price_cents);
          if (!Number.isInteger(pc) || pc < 0) return err("VALIDATION_FAILED", 422, { price_cents: "must be a non-negative integer (cents)" });
          upd.price_cents = pc;
        }
      }
      // Auction price_type handling on update.
      const effectivePriceType = upd.price_type || listing.price_type;
      if (effectivePriceType === PriceType.AUCTION) {
        const allowed = await hasEntitlement(base44, "user", user.id, EntitlementKey.CREATE_AUCTION);
        if (!allowed) return err("AUCTION_REQUIRES_PREMIUM", 403, { entitlement: "create_auction" });
        const auctionRes = validateAuctionFields(body, effectivePriceType);
        if (!auctionRes.ok) return err(auctionRes.error.code, 422, { field: auctionRes.error.field, message: auctionRes.error.message });
        Object.assign(upd, auctionRes.fields);
        if (upd.price_type === PriceType.AUCTION) upd.price_cents = null;
      } else if (upd.price_type !== undefined) {
        // Switching away from auction: clear auction fields.
        upd.auction_min_bid_cents = null;
        upd.auction_reserve_cents = null;
        upd.auction_duration_days = null;
      }
      if (body.condition !== undefined) {
        if (!LISTING_CONDITION_VALUES.includes(body.condition)) return err("VALIDATION_FAILED", 422, { condition: "invalid" });
        upd.condition = body.condition;
      }
      if (body.quantity !== undefined) {
        const q = Number(body.quantity);
        if (!Number.isInteger(q) || q < 1) return err("VALIDATION_FAILED", 422, { quantity: "must be a positive integer" });
        upd.quantity = q;
      }
      if (body.location_general !== undefined) upd.location_general = (body.location_general || "").trim() || null;
      const effectiveCategory = upd.category || listing.category;
      // Compatibility year range — only accepted when category != vehicle.
      if (effectiveCategory !== ListingCategory.VEHICLE) {
        for (const f of ["compatible_year_from", "compatible_year_to"]) {
          if (body[f] !== undefined && body[f] !== null) {
            const y = Number(body[f]);
            if (!Number.isInteger(y) || y < 1900 || y > 2100) return err("VALIDATION_FAILED", 422, { [f]: "invalid year" });
            upd[f] = y;
          }
        }
      }
      // ADR-043: bounded-enum compatibility arrays (validated for all categories;
      // vehicle category rejects non-empty values with CATEGORY_FIELD_MISMATCH).
      {
        const compatRes = validateCompatibilityFields(effectiveCategory, body);
        if (!compatRes.ok) return err(compatRes.error.code, 422, { field: compatRes.error.field, message: compatRes.error.message });
        Object.assign(upd, compatRes.fields);
      }
      // ADR-042 category attributes — validate against the final category, reject
      // mismatched submitted fields, and null out stale group fields on category change.
      const catAttr = validateCategoryAttributes(effectiveCategory, body, listing);
      if (!catAttr.ok) return err(catAttr.error.code, 422, { field: catAttr.error.field, message: catAttr.error.message });
      Object.assign(upd, catAttr.fields);
      // ADR-045: media + additional specifications.
      if (Array.isArray(body.photo_urls)) upd.photo_urls = body.photo_urls.filter((u: any) => typeof u === "string").slice(0, 10);
      if (Array.isArray(body.video_urls)) upd.video_urls = body.video_urls.filter((u: any) => typeof u === "string").slice(0, 3);
      const specUpd = validateAdditionalSpecifications(body);
      if (!specUpd.ok) return err(specUpd.error.code, 422, { field: specUpd.error.field, message: specUpd.error.message });
      if (specUpd.fields !== undefined) upd.additional_specifications = specUpd.fields;
      const oldAllowed = applicableCategoryFields(listing.category);
      const newAllowed = applicableCategoryFields(effectiveCategory);
      for (const f of CATEGORY_ATTR_FIELDS) {
        if (oldAllowed.has(f) && !newAllowed.has(f) && listing[f] != null) upd[f] = null;
      }
      if (body.primary_vehicle_id !== undefined) {
        if (body.primary_vehicle_id) {
          const ov = await validateOwnedVehicle(base44, user, body.primary_vehicle_id);
          if (!ov.ok) return err("VALIDATION_FAILED", 422, { primary_vehicle_id: ov.error });
          upd.primary_vehicle_id = body.primary_vehicle_id;
        } else {
          upd.primary_vehicle_id = null;
        }
      }
      // Re-check vehicle-category for_sale requirement after a category/type change.
      const finalCategory = upd.category || listing.category;
      const finalType = upd.listing_type || listing.listing_type;
      const finalVehicle = upd.primary_vehicle_id !== undefined ? upd.primary_vehicle_id : listing.primary_vehicle_id;
      if (finalCategory === ListingCategory.VEHICLE && finalType === ListingType.FOR_SALE && !finalVehicle) {
        return err("VALIDATION_FAILED", 422, { primary_vehicle_id: "required for vehicle for_sale listings" });
      }
      const updated = await base44.entities.MarketplaceListing.update(body.listing_id, upd);
      return json({ ok: true, listing_id: body.listing_id, listing: updated });
    }

    // ============ publishListing (F.3 — poster only; tier routes to active vs pending_review) ============
    if (action === "publishListing") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const listing = await base44.entities.MarketplaceListing.get(body.listing_id).catch(() => null);
      if (!listing) return err("RESOURCE_NOT_FOUND", 404);
      if (listing.poster_id !== user.id) return err("PERMISSION_DENIED", 403);
      if (!accountInGoodStanding(user)) return err("MARKETPLACE_TIER_REQUIRED", 403, { reason: "account not in good standing" });
      if (listing.status !== ListingStatus.DRAFT) return err("INVALID_STATE_TRANSITION", 409, { current: listing.status });
      if (listing.category === ListingCategory.VEHICLE && listing.listing_type === ListingType.FOR_SALE && !listing.primary_vehicle_id) {
        return err("VALIDATION_FAILED", 422, { primary_vehicle_id: "required for vehicle for_sale listings" });
      }
      const now = new Date();
      if (meetsCreationTier(user)) {
        const upd: any = {
          status: ListingStatus.ACTIVE,
          published_at: listing.published_at || now.toISOString(),
          expires_at: new Date(now.getTime() + LISTING_LIFETIME_MS).toISOString(),
        };
        // Auction: set auction_ends_at = published_at + duration days.
        if (listing.price_type === PriceType.AUCTION && listing.auction_duration_days) {
          const pubAt = new Date(listing.published_at || now.toISOString());
          upd.auction_ends_at = new Date(pubAt.getTime() + listing.auction_duration_days * DAY_MS).toISOString();
        }
        const updated = await base44.entities.MarketplaceListing.update(body.listing_id, upd);
        return json({ ok: true, listing_id: body.listing_id, status: ListingStatus.ACTIVE, listing: updated });
      }
      // Below Trusted Member (New Member) routes to pending_review — never rejected outright.
      const updated = await base44.entities.MarketplaceListing.update(body.listing_id, { status: ListingStatus.PENDING_REVIEW });
      return json({ ok: true, listing_id: body.listing_id, status: ListingStatus.PENDING_REVIEW, listing: updated });
    }

    // ============ approveListing (E.1 — Mod/Admin only; pending_review → active) ============
    // The only path by which a pending_review listing reaches active (Section E.1).
    // Rejection is a separate path via ModerationService.applyAction → removed_by_moderation.
    if (action === "approveListing") {
      if (!user) return err("AUTH_REQUIRED", 401);
      if (!isMod(user)) return err("PERMISSION_DENIED", 403);
      const listing = await base44.entities.MarketplaceListing.get(body.listing_id).catch(() => null);
      if (!listing) return err("RESOURCE_NOT_FOUND", 404);
      if (listing.status !== ListingStatus.PENDING_REVIEW) return err("INVALID_STATE_TRANSITION", 409, { current: listing.status });
      const now = new Date();
      const updated = await base44.entities.MarketplaceListing.update(body.listing_id, {
        status: ListingStatus.ACTIVE,
        published_at: listing.published_at || now.toISOString(),
        expires_at: new Date(now.getTime() + LISTING_LIFETIME_MS).toISOString(),
      });
      return json({ ok: true, listing_id: body.listing_id, status: ListingStatus.ACTIVE, listing: updated });
    }

    // ============ reserveListing (F.4 — poster only; active ⇄ reserved toggle) ============
    if (action === "reserveListing") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const listing = await base44.entities.MarketplaceListing.get(body.listing_id).catch(() => null);
      if (!listing) return err("RESOURCE_NOT_FOUND", 404);
      if (listing.poster_id !== user.id) return err("PERMISSION_DENIED", 403);
      if (listing.status === ListingStatus.ACTIVE) {
        const updated = await base44.entities.MarketplaceListing.update(body.listing_id, { status: ListingStatus.RESERVED });
        return json({ ok: true, listing_id: body.listing_id, status: ListingStatus.RESERVED, listing: updated });
      }
      if (listing.status === ListingStatus.RESERVED) {
        const updated = await base44.entities.MarketplaceListing.update(body.listing_id, { status: ListingStatus.ACTIVE });
        return json({ ok: true, listing_id: body.listing_id, status: ListingStatus.ACTIVE, listing: updated });
      }
      return err("LISTING_NOT_ACTIVE", 409, { current: listing.status });
    }

    // ============ markCompleted (F.5 — poster only; active/reserved → completed; terminal) ============
    if (action === "markCompleted") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const listing = await base44.entities.MarketplaceListing.get(body.listing_id).catch(() => null);
      if (!listing) return err("RESOURCE_NOT_FOUND", 404);
      if (listing.poster_id !== user.id) return err("PERMISSION_DENIED", 403);
      if (listing.status === ListingStatus.COMPLETED) return err("LISTING_ALREADY_COMPLETED", 409);
      if (listing.status !== ListingStatus.ACTIVE && listing.status !== ListingStatus.RESERVED) {
        return err("INVALID_STATE_TRANSITION", 409, { current: listing.status });
      }
      const updated = await base44.entities.MarketplaceListing.update(body.listing_id, { status: ListingStatus.COMPLETED });
      // ListingCompleted → TrustScore signal + Vehicle sale_status sync (no direct notification, no audit).
      await onListingCompleted(base44, { listing: { ...listing, status: ListingStatus.COMPLETED }, actor_id: user.id });
      return json({ ok: true, listing_id: body.listing_id, status: ListingStatus.COMPLETED, listing: updated });
    }

    // ============ expireListing (F.6 — system only; active/reserved → expired) ============
    if (action === "expireListing") {
      const listing = await base44.asServiceRole.entities.MarketplaceListing.get(body.listing_id).catch(() => null);
      if (!listing) return err("RESOURCE_NOT_FOUND", 404);
      if (listing.status !== ListingStatus.ACTIVE && listing.status !== ListingStatus.RESERVED) {
        return json({ ok: true, changed: false, current: listing.status });
      }
      const updated = await base44.asServiceRole.entities.MarketplaceListing.update(body.listing_id, { status: ListingStatus.EXPIRED });
      await onListingExpired(base44, { listing: { ...listing, status: ListingStatus.EXPIRED } });
      return json({ ok: true, listing_id: body.listing_id, status: ListingStatus.EXPIRED, listing: updated });
    }

    // ============ renewListing (F.7 — poster only; expired → active; 24h rate limit) ============
    if (action === "renewListing") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const listing = await base44.entities.MarketplaceListing.get(body.listing_id).catch(() => null);
      if (!listing) return err("RESOURCE_NOT_FOUND", 404);
      if (listing.poster_id !== user.id) return err("PERMISSION_DENIED", 403);
      if (listing.status !== ListingStatus.EXPIRED) return err("INVALID_STATE_TRANSITION", 409, { current: listing.status });
      const now = Date.now();
      const last = listing.last_renewed_at ? new Date(listing.last_renewed_at).getTime() : 0;
      if (now - last < RENEWAL_WINDOW_MS) return err("LISTING_RENEWAL_TOO_SOON", 429, { last_renewed_at: listing.last_renewed_at });
      const newExpires = new Date(now + LISTING_LIFETIME_MS).toISOString();
      const updated = await base44.entities.MarketplaceListing.update(body.listing_id, {
        status: ListingStatus.ACTIVE, last_renewed_at: new Date(now).toISOString(), expires_at: newExpires,
      });
      return json({ ok: true, listing_id: body.listing_id, status: ListingStatus.ACTIVE, expires_at: newExpires, listing: updated });
    }

    // ============ removeListing (F.8 — poster only; active/reserved/expired → removed_by_poster; terminal) ============
    if (action === "removeListing") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const listing = await base44.entities.MarketplaceListing.get(body.listing_id).catch(() => null);
      if (!listing) return err("RESOURCE_NOT_FOUND", 404);
      if (listing.poster_id !== user.id) return err("PERMISSION_DENIED", 403);
      if (![ListingStatus.ACTIVE, ListingStatus.RESERVED, ListingStatus.EXPIRED].includes(listing.status)) {
        return err("INVALID_STATE_TRANSITION", 409, { current: listing.status });
      }
      const updated = await base44.entities.MarketplaceListing.update(body.listing_id, { status: ListingStatus.REMOVED_BY_POSTER });
      return json({ ok: true, listing_id: body.listing_id, status: ListingStatus.REMOVED_BY_POSTER, listing: updated });
    }

    // ============ placeBid (Auction — place a bid on an active auction listing) ============
    if (action === "placeBid") {
      if (!user) return err("AUTH_REQUIRED", 401);
      if (!accountInGoodStanding(user)) return err(user.account_status === "banned" ? "ACCOUNT_BANNED" : "ACCOUNT_SUSPENDED", 403);
      const listing = await base44.entities.MarketplaceListing.get(body.listing_id).catch(() => null);
      if (!listing) return err("RESOURCE_NOT_FOUND", 404);
      if (listing.price_type !== PriceType.AUCTION) return err("NOT_AN_AUCTION", 400);
      if (listing.poster_id === user.id) return err("CANNOT_BID_ON_OWN_LISTING", 400);
      if (![ListingStatus.ACTIVE, ListingStatus.RESERVED].includes(listing.status)) {
        return err("LISTING_NOT_ACTIVE", 409, { current: listing.status });
      }
      // Auction must not have ended.
      if (listing.auction_ends_at && new Date(listing.auction_ends_at).getTime() <= Date.now()) {
        return err("AUCTION_ENDED", 409, { auction_ends_at: listing.auction_ends_at });
      }
      const bidCents = Number(body.amount_cents);
      if (!Number.isInteger(bidCents) || bidCents <= 0) {
        return err("VALIDATION_FAILED", 422, { amount_cents: "must be a positive integer (cents)" });
      }
      // Minimum bid = current highest + increment, or the starting bid if no bids yet.
      const currentHighest = listing.current_bid_cents || 0;
      const minBid = currentHighest > 0
        ? currentHighest + AUCTION_MIN_BID_INCREMENT_CENTS
        : listing.auction_min_bid_cents;
      if (bidCents < minBid) {
        return err("BID_TOO_LOW", 422, { minimum_cents: minBid, current_cents: currentHighest });
      }
      // Mark the previous winning bid as no longer winning.
      if (listing.current_bidder_id) {
        const prevWinning = await base44.asServiceRole.entities.Bid.filter(
          { listing_id: body.listing_id, is_winning: true }, "-created_date", 5,
        );
        for (const b of prevWinning) {
          await base44.asServiceRole.entities.Bid.update(b.id, { is_winning: false }).catch(() => {});
        }
      }
      const bidderName = user.display_name || user.handle || user.full_name || "Bidder";
      const bid = await base44.entities.Bid.create({
        listing_id: body.listing_id, bidder_id: user.id, bidder_name: bidderName,
        amount_cents: bidCents, is_winning: true,
      });
      await base44.entities.MarketplaceListing.update(body.listing_id, {
        current_bid_cents: bidCents, current_bidder_id: user.id,
      });
      return json({ ok: true, bid_id: bid.id, current_bid_cents: bidCents, bid });
    }

    // ============ listBids (Auction — return bid history for a listing) ============
    if (action === "listBids") {
      const listing = await base44.entities.MarketplaceListing.get(body.listing_id).catch(() => null);
      if (!listing) return err("RESOURCE_NOT_FOUND", 404);
      const bids = await base44.asServiceRole.entities.Bid.filter(
        { listing_id: body.listing_id }, "-amount_cents", 50,
      );
      return json({ ok: true, bids, current_bid_cents: listing.current_bid_cents || null, auction_ends_at: listing.auction_ends_at || null });
    }

    // ============ startConversation (F.9 — New Member+ verified contact; not own listing; not blocked) ============
    if (action === "startConversation") {
      if (!user) return err("AUTH_REQUIRED", 401);
      if (!accountInGoodStanding(user)) return err(user.account_status === "banned" ? "ACCOUNT_BANNED" : "ACCOUNT_SUSPENDED", 403);
      if (!meetsParticipationTier(user)) return err("PERMISSION_DENIED", 403, { required_tier: "new_member" });
      const listing = await base44.entities.MarketplaceListing.get(body.listing_id).catch(() => null);
      // draft / pending_review / removed_* are not visible to a non-owner caller.
      if (!listing || [ListingStatus.DRAFT, ListingStatus.PENDING_REVIEW, ListingStatus.REMOVED_BY_POSTER, ListingStatus.REMOVED_BY_MODERATION].includes(listing.status)) {
        return err("RESOURCE_NOT_FOUND", 404);
      }
      if (listing.poster_id === user.id) return err("CANNOT_MESSAGE_OWN_LISTING", 400);
      // NOTE: the platform's auth flow already enforces email verification (OTP)
      // before a user can log in, so any authenticated New Member+ in good
      // standing is permitted to start a conversation. The previous
      // TrustScoreEvent-based hasVerifiedContact gate had no automatic bridge
      // from email verification and blocked all regular users.
      const blocked = await isBlockedEitherDirection(base44, user.id, listing.poster_id);
      if (blocked) return err("USER_BLOCKED", 403);
      const existing = await base44.entities.MarketplaceConversation.filter({
        listing_id: body.listing_id, initiator_id: user.id,
      });
      if (existing.length > 0) return err("CONVERSATION_ALREADY_EXISTS", 409, { conversation_id: existing[0].id });
      const nowIso = new Date().toISOString();
      const conversation = await base44.entities.MarketplaceConversation.create({
        listing_id: body.listing_id, poster_id: listing.poster_id, initiator_id: user.id,
        last_message_at: nowIso, poster_archived_at: null, initiator_archived_at: null,
        poster_last_read_at: null, initiator_last_read_at: nowIso,
      });
      await base44.asServiceRole.entities.MarketplaceListing.update(body.listing_id, {
        conversation_count: (listing.conversation_count || 0) + 1,
      }).catch(() => {});
      await onMarketplaceConversationStarted(base44, { conversation, listing, actor_id: user.id });
      return json({ ok: true, conversation_id: conversation.id, poster_id: listing.poster_id, initiator_id: user.id, conversation });
    }

    // ============ sendMessage (F.10 — participant; not blocked; contact-pattern warning) ============
    if (action === "sendMessage") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const conversation = await base44.entities.MarketplaceConversation.get(body.conversation_id).catch(() => null);
      if (!conversation) return err("RESOURCE_NOT_FOUND", 404);
      const isPoster = conversation.poster_id === user.id;
      const isInitiator = conversation.initiator_id === user.id;
      if (!isPoster && !isInitiator) return err("PERMISSION_DENIED", 403);
      const otherId = isPoster ? conversation.initiator_id : conversation.poster_id;
      const blocked = await isBlockedEitherDirection(base44, user.id, otherId);
      if (blocked) return err("MESSAGE_ACCESS_REVOKED", 403);
      const text = (body.body || "").trim();
      if (!text) return err("VALIDATION_FAILED", 422, { body: "required" });
      if (text.length > MESSAGE_BODY_MAX) return err("VALIDATION_FAILED", 422, { body: "max 4000 chars" });
      // Contact-sharing pattern warning — warn, do not hard-block. A confirmed
      // resubmission with confirmed_despite_warning=true sends despite the warning.
      const risk = detectContactSharing(text);
      if (risk.detected && !body.confirmed_despite_warning) {
        return Response.json({
          ok: false,
          error: { code: "CONTACT_SHARING_WARNING", message: CONTACT_WARNING_MSG, details: { matched_pattern_type: risk.pattern_type } },
          meta: { request_id: rid() },
        }, { status: 200 });
      }
      const message = await base44.entities.MarketplaceMessage.create({
        conversation_id: body.conversation_id, sender_id: user.id, body: text, status: MessageStatus.SENT,
      });
      const nowIso = new Date().toISOString();
      const readField = isPoster ? "poster_last_read_at" : "initiator_last_read_at";
      await base44.entities.MarketplaceConversation.update(body.conversation_id, {
        last_message_at: nowIso, [readField]: nowIso,
      });
      await onMarketplaceMessageSent(base44, { conversation, message, sender_id: user.id });
      return json({ ok: true, message_id: message.id, conversation_id: body.conversation_id, status: MessageStatus.SENT, message });
    }

    // ============ archiveConversation (F.11 — participant; toggles own archive timestamp) ============
    if (action === "archiveConversation") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const conversation = await base44.entities.MarketplaceConversation.get(body.conversation_id).catch(() => null);
      if (!conversation) return err("RESOURCE_NOT_FOUND", 404);
      const isPoster = conversation.poster_id === user.id;
      const isInitiator = conversation.initiator_id === user.id;
      if (!isPoster && !isInitiator) return err("PERMISSION_DENIED", 403);
      const field = isPoster ? "poster_archived_at" : "initiator_archived_at";
      const archived = !conversation[field];
      const updated = await base44.entities.MarketplaceConversation.update(body.conversation_id, {
        [field]: archived ? new Date().toISOString() : null,
      });
      return json({ ok: true, conversation_id: body.conversation_id, archived, conversation: updated });
    }

    // ============ removeOwnMessage (F.12 — sender only; sent → removed_by_sender; body retained) ============
    if (action === "removeOwnMessage") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const message = await base44.entities.MarketplaceMessage.get(body.message_id).catch(() => null);
      if (!message) return err("RESOURCE_NOT_FOUND", 404);
      if (message.sender_id !== user.id) return err("PERMISSION_DENIED", 403);
      if (message.status !== MessageStatus.SENT) return err("INVALID_STATE_TRANSITION", 409, { current: message.status });
      const updated = await base44.entities.MarketplaceMessage.update(body.message_id, { status: MessageStatus.REMOVED_BY_SENDER });
      return json({ ok: true, message_id: body.message_id, status: MessageStatus.REMOVED_BY_SENDER, message: updated });
    }

    // ============ blockUser / unblockUser (SafetyService block-list CRUD) ============
    if (action === "blockUser") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const blockedId = body.blocked_user_id || body.blocked_id;
      if (!blockedId || blockedId === user.id) return err("VALIDATION_FAILED", 422, { blocked_user_id: "invalid" });
      const block = await createBlock(base44, user.id, blockedId);
      return json({ ok: true, block_id: block.id });
    }
    if (action === "unblockUser") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const blockedId = body.blocked_user_id || body.blocked_id;
      const r = await removeBlock(base44, user.id, blockedId);
      return json({ ok: true, removed: r.removed });
    }

    // ============ expireListings (F.13 — SYSTEM; called by the 15-minute expiry workflow) ============
    if (action === "expireListings") {
      const now = new Date().toISOString();
      const due = await base44.asServiceRole.entities.MarketplaceListing.filter({
        status: { $in: [ListingStatus.ACTIVE, ListingStatus.RESERVED] },
        expires_at: { $lt: now },
      }, "-created_date", 500);
      let expired = 0;
      for (const l of due) {
        try {
          await base44.asServiceRole.entities.MarketplaceListing.update(l.id, { status: ListingStatus.EXPIRED });
          await onListingExpired(base44, { listing: { ...l, status: ListingStatus.EXPIRED } });
          expired++;
        } catch {}
      }
      return json({ ok: true, expired, checked: due.length });
    }

    // ============ getListing (F.14 — owner sees all; others active/reserved/completed only) ============
    if (action === "getListing") {
      const listing = await base44.entities.MarketplaceListing.get(body.listing_id).catch(() => null);
      if (!listing) return err("RESOURCE_NOT_FOUND", 404);
      const isOwner = user && listing.poster_id === user.id;
      if (!isOwner && !isMod(user) && !PUBLIC_VISIBLE_STATUSES.includes(listing.status)) {
        return err("RESOURCE_NOT_VISIBLE", 404);
      }
      const poster = await base44.asServiceRole.entities.User.get(listing.poster_id).catch(() => null);
      // ADR-042 §2: vehicle-category listings pull display data from the linked
      // Vehicle record rather than asking the seller to re-enter it.
      let vehicle = null;
      if (listing.category === ListingCategory.VEHICLE && listing.primary_vehicle_id) {
        const v = await base44.asServiceRole.entities.Vehicle.get(listing.primary_vehicle_id).catch(() => null);
        if (v) vehicle = {
          nickname: v.nickname || null, make: v.make || null, model: v.model || null, year: v.year ?? null,
          chassis_code: v.chassis_code || null, generation: v.generation || null, body_style: v.body_style || null,
          colour: v.colour || null, trim: v.trim || null, engine_code: v.engine_code || null,
          engine_capacity: v.engine_capacity ?? null, transmission: v.transmission || null, drivetrain: v.drivetrain || null,
          fuel_type: v.fuel_type || null, odometer_km: v.odometer_km ?? null, power_kw: v.power_kw ?? null,
          registration_state: v.registration_state || null, build_status: v.build_status || null,
          sale_status: v.sale_status || null, build_description: v.build_description || null, cover_media_id: v.cover_media_id || null,
        };
      }
      // ADR-045: Listing Quality Score — only for the poster, only while draft.
      const quality = (isOwner && listing.status === ListingStatus.DRAFT) ? computeListingQualityScore(listing) : null;
      return json({
        ok: true,
        listing: { ...listing, poster_name: poster?.display_name || poster?.handle || "Poster", poster_handle: poster?.handle || null },
        vehicle,
        ...(quality ? { quality_score: quality.score, quality_checklist: quality.checklist } : {}),
      });
    }

    // ============ listListings (F.14 — public; active/reserved/completed; published_at DESC; cursor) ============
    if (action === "listListings") {
      const filter: any = { status: { $in: PUBLIC_VISIBLE_STATUSES } };
      if (body.listing_type && LISTING_TYPE_VALUES.includes(body.listing_type)) filter.listing_type = body.listing_type;
      if (body.category && LISTING_CATEGORY_VALUES.includes(body.category)) filter.category = body.category;
      if (body.condition && LISTING_CONDITION_VALUES.includes(body.condition)) filter.condition = body.condition;
      // Business storefront: only listings attributed to that business.
      if (body.business_id) filter.business_id = String(body.business_id);
      let listings = await base44.asServiceRole.entities.MarketplaceListing.filter(filter, "-published_at", 500);
      if (body.price_min_cents != null) {
        const min = Number(body.price_min_cents);
        listings = listings.filter((l: any) => l.price_cents != null && l.price_cents >= min);
      }
      if (body.price_max_cents != null) {
        const max = Number(body.price_max_cents);
        listings = listings.filter((l: any) => l.price_cents != null && l.price_cents <= max);
      }
      if (body.location_general) {
        const loc = String(body.location_general).toLowerCase();
        listings = listings.filter((l: any) => (l.location_general || "").toLowerCase().includes(loc));
      }
      // ADR-043: intersection-match filters for bounded-enum compatibility arrays.
      if (Array.isArray(body.compatible_models) && body.compatible_models.length > 0) {
        const requested = body.compatible_models;
        listings = listings.filter((l: any) => Array.isArray(l.compatible_models) && l.compatible_models.some((v: string) => requested.includes(v)));
      }
      if (Array.isArray(body.compatible_chassis_codes) && body.compatible_chassis_codes.length > 0) {
        const requested = body.compatible_chassis_codes;
        listings = listings.filter((l: any) => Array.isArray(l.compatible_chassis_codes) && l.compatible_chassis_codes.some((v: string) => requested.includes(v)));
      }
      if (Array.isArray(body.compatible_engine_families) && body.compatible_engine_families.length > 0) {
        const requested = body.compatible_engine_families;
        listings = listings.filter((l: any) => Array.isArray(l.compatible_engine_families) && l.compatible_engine_families.some((v: string) => requested.includes(v)));
      }
      if (body.compatible_year) {
        const y = Number(body.compatible_year);
        listings = listings.filter((l: any) => {
          const from = l.compatible_year_from, to = l.compatible_year_to;
          if (from && y < from) return false;
          if (to && y > to) return false;
          return true;
        });
      }
      if (body.search) {
        const q = String(body.search).toLowerCase();
        listings = listings.filter((l: any) => (l.title || "").toLowerCase().includes(q) || (l.description || "").toLowerCase().includes(q));
      }
      // ADR-042 §5 new filters (brand / oem_or_aftermarket / shipping / pickup).
      if (body.brand) {
        const b = String(body.brand).toLowerCase();
        listings = listings.filter((l: any) => (l.brand || "").toLowerCase() === b);
      }
      if (body.oem_or_aftermarket && OEM_OR_AFTERMARKET_VALUES.includes(body.oem_or_aftermarket)) {
        listings = listings.filter((l: any) => l.oem_or_aftermarket === body.oem_or_aftermarket);
      }
      if (body.shipping_available === true || body.shipping_available === "true") {
        listings = listings.filter((l: any) => !!l.shipping_available);
      }
      if (body.pickup_available === true || body.pickup_available === "true") {
        listings = listings.filter((l: any) => l.pickup_available !== false);
      }
      // ADR-042 §5 new sort options. Default remains published_at DESC (from the
      // initial fetch). poa/free sort to the end regardless of price direction.
      if (body.sort === "price_asc" || body.sort === "price_desc") {
        const dir = body.sort === "price_asc" ? 1 : -1;
        const priced = (l: any) => (l.price_type === PriceType.FIXED || l.price_type === PriceType.NEGOTIABLE) ? l.price_cents : null;
        listings.sort((a: any, b: any) => {
          const ap = priced(a), bp = priced(b);
          if (ap === null && bp === null) return 0;
          if (ap === null) return 1;
          if (bp === null) return -1;
          return dir * (ap - bp);
        });
      } else if (body.sort === "views") {
        listings.sort((a: any, b: any) => (b.view_count || 0) - (a.view_count || 0));
      }
      const limit = Math.min(Number(body.limit) || DEFAULT_LIMIT, MAX_LIMIT);
      const offset = Number(body.cursor) || 0;
      const page = listings.slice(offset, offset + limit);
      const enriched = await Promise.all(page.map(async (l: any) => {
        const poster = await base44.asServiceRole.entities.User.get(l.poster_id).catch(() => null);
        return { ...l, poster_name: poster?.display_name || poster?.handle || "Poster", poster_handle: poster?.handle || null };
      }));
      return json({ ok: true, listings: enriched, count: listings.length, next_cursor: offset + enriched.length < listings.length ? offset + limit : null });
    }

    // ============ getConversation (F.14 — participant only) ============
    if (action === "getConversation") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const conversation = await base44.entities.MarketplaceConversation.get(body.conversation_id).catch(() => null);
      if (!conversation) return err("RESOURCE_NOT_FOUND", 404);
      if (conversation.poster_id !== user.id && conversation.initiator_id !== user.id) return err("PERMISSION_DENIED", 403);
      const listing = await base44.asServiceRole.entities.MarketplaceListing.get(conversation.listing_id).catch(() => null);
      const otherId = conversation.poster_id === user.id ? conversation.initiator_id : conversation.poster_id;
      const other = await base44.asServiceRole.entities.User.get(otherId).catch(() => null);
      // Role labels derived from listing_type — never hardcoded to a field name.
      const myRole = listing?.listing_type === ListingType.WANTED
        ? (conversation.poster_id === user.id ? "buyer" : "seller")
        : (conversation.poster_id === user.id ? "seller" : "buyer");
      // Read-tracking: mark the caller's read pointer on view (Section E.2).
      const isPoster = conversation.poster_id === user.id;
      const readField = isPoster ? "poster_last_read_at" : "initiator_last_read_at";
      const nowIso = new Date().toISOString();
      const updated = await base44.entities.MarketplaceConversation.update(body.conversation_id, { [readField]: nowIso });
      return json({
        ok: true,
        conversation: updated,
        listing: listing ? { id: listing.id, title: listing.title, listing_type: listing.listing_type, category: listing.category, price_cents: listing.price_cents, price_type: listing.price_type, status: listing.status, photo_urls: listing.photo_urls } : null,
        my_role: myRole,
        other_party: { user_id: otherId, display_name: other?.display_name || other?.handle || "User", handle: other?.handle || null, avatar_media_id: other?.avatar_media_id || null },
      });
    }

    // ============ listConversations (F.14 — current user's inbox; last_message_at DESC; cursor) ============
    if (action === "listConversations") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const includeArchived = !!body.include_archived;
      const asPoster = await base44.entities.MarketplaceConversation.filter({ poster_id: user.id }, "-last_message_at", 200);
      const asInitiator = await base44.entities.MarketplaceConversation.filter({ initiator_id: user.id }, "-last_message_at", 200);
      let all = [...asPoster, ...asInitiator];
      all.sort((a: any, b: any) => (b.last_message_at || "").localeCompare(a.last_message_at || ""));
      if (!includeArchived) {
        all = all.filter((c: any) => {
          const myArchived = c.poster_id === user.id ? c.poster_archived_at : c.initiator_archived_at;
          return !myArchived;
        });
      }
      const limit = Math.min(Number(body.limit) || DEFAULT_LIMIT, MAX_LIMIT);
      const offset = Number(body.cursor) || 0;
      const page = all.slice(offset, offset + limit);
      const enriched = await Promise.all(page.map(async (c: any) => {
        const listing = await base44.asServiceRole.entities.MarketplaceListing.get(c.listing_id).catch(() => null);
        const otherId = c.poster_id === user.id ? c.initiator_id : c.poster_id;
        const other = await base44.asServiceRole.entities.User.get(otherId).catch(() => null);
        const myReadAt = c.poster_id === user.id ? c.poster_last_read_at : c.initiator_last_read_at;
        const myArchived = c.poster_id === user.id ? c.poster_archived_at : c.initiator_archived_at;
        const myRole = listing?.listing_type === ListingType.WANTED
          ? (c.poster_id === user.id ? "buyer" : "seller")
          : (c.poster_id === user.id ? "seller" : "buyer");
        return {
          ...c,
          archived: !!myArchived,
          my_role: myRole,
          listing_title: listing?.title || "(removed)",
          listing_type: listing?.listing_type || null,
          listing_price_cents: listing?.price_cents ?? null,
          listing_price_type: listing?.price_type || null,
          other_party: { user_id: otherId, display_name: other?.display_name || other?.handle || "User", handle: other?.handle || null, avatar_media_id: other?.avatar_media_id || null },
          unread: myReadAt ? (c.last_message_at || "") > (myReadAt || "") : !!c.last_message_at,
        };
      }));
      return json({ ok: true, conversations: enriched, count: all.length, next_cursor: offset + enriched.length < all.length ? offset + limit : null });
    }

    // ============ listMessages (F.14 — participant; created_at ASC; cursor) ============
    if (action === "listMessages") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const conversation = await base44.entities.MarketplaceConversation.get(body.conversation_id).catch(() => null);
      if (!conversation) return err("RESOURCE_NOT_FOUND", 404);
      if (conversation.poster_id !== user.id && conversation.initiator_id !== user.id) return err("PERMISSION_DENIED", 403);
      const messages = await base44.asServiceRole.entities.MarketplaceMessage.filter({ conversation_id: body.conversation_id }, "created_date", 500);
      const limit = Math.min(Number(body.limit) || DEFAULT_LIMIT, MAX_LIMIT);
      const offset = Number(body.cursor) || 0;
      const page = messages.slice(offset, offset + limit);
      const enriched = await Promise.all(page.map(async (m: any) => {
        const sender = await base44.asServiceRole.entities.User.get(m.sender_id).catch(() => null);
        return { ...m, sender_name: sender?.display_name || sender?.handle || "User", sender_handle: sender?.handle || null };
      }));
      return json({ ok: true, messages: enriched, count: messages.length, next_cursor: offset + enriched.length < messages.length ? offset + limit : null });
    }

    // ============ listMyListings (poster's own; all statuses — UI "my listings" surface) ============
    if (action === "listMyListings") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const listings = await base44.entities.MarketplaceListing.filter({ poster_id: user.id }, "-created_date", 200);
      return json({ ok: true, listings });
    }

    return err("VALIDATION_FAILED", 422, { action: "unknown" });
  } catch (error) {
    return json({ ok: false, error: { code: "VALIDATION_FAILED", message: error.message }, meta: { request_id: rid() } }, 500);
  }
});