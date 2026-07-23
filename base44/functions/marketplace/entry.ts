/**
 * MarketplaceService (Phase 08) — owns MarketplaceListing, MarketplaceConversation,
 * MarketplaceMessage. The single writer to those three entities.
 *
 * Reads (never writes): User, Vehicle (ownership + sale_status sync via the
 * delegated shared helper), TrustScore/TrustScoreEvent (MARKETPLACE_SUCCESS
 * signal via awardSignalToUser), UserBlock (block-list via SafetyService).
 *
 * Public methods (§8.2): createListingDraft, updateListing, publishListing,
 *   reserveListing, markCompleted, expireListing, renewListing, removeListing,
 *   startConversation, sendMessage, archiveConversation, removeOwnMessage.
 * Read methods (§8.3): getListing, listListings, getConversation,
 *   listConversations, getMessages, markConversationRead, listMyListings.
 * System method: expireListings (called by the listing-expiry workflow).
 * Block helpers: blockUser, unblockUser (SafetyService block-list CRUD).
 *
 * Hard rules enforced:
 *  - Any tier may draft; Trusted Member+ (meetsCreationTier) to publish.
 *  - New Member+ with a verified email/phone to message a poster.
 *  - isBlockedEitherDirection is checked before startConversation AND
 *    sendMessage — a block rejects new conversations/messages, but existing
 *    history stays fully visible (getMessages never checks block state).
 *  - Contact-sharing patterns in a message body WARN the sender (return
 *    MESSAGE_CONTACT_PATTERN_DETECTED) and only send on a confirmed re-call
 *    with acknowledge_risk=true — never hard-blocked (false-positive tolerant).
 *  - A vehicle-category for_sale listing requires a primary_vehicle_id the
 *    poster owns (ownership validated, not assumed).
 *  - completed + removed_by_moderation are terminal (no transition out).
 *  - renewListing rejects within 24h of last_renewed_at (LISTING_RENEWAL_TOO_SOON).
 *  - poster_id is the canonical poster field; UI derives Buyer/Seller from
 *    listing_type at render time (never assumes poster=seller).
 */
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import {
  LISTING_TYPE_VALUES, LISTING_CATEGORY_VALUES, LISTING_CONDITION_VALUES,
  CONVERSATION_STATUS_VALUES, ListingStatus, ListingType, ListingCategory, ConversationStatus, MessageStatus,
  RENEWAL_WINDOW_MS, LISTING_LIFETIME_MS, TITLE_MAX, DESCRIPTION_MAX, MESSAGE_BODY_MAX, PREVIEW_MAX,
  TERMINAL_STATUSES, detectContactSharing,
  onListingCompleted, onListingExpired, onMarketplaceConversationStarted, onMarketplaceMessageSent,
} from "../../shared/marketplace.ts";
import { meetsCreationTier, meetsParticipationTier, accountInGoodStanding } from "../../shared/community.ts";
import { isBlockedEitherDirection, createBlock, removeBlock } from "../../shared/safety.ts";
import { validateReference, ReferenceTypes } from "../../shared/reference-resolver.ts";
import { createNotification } from "../../shared/notifications.ts";
import { NotificationType, SignalType } from "../../shared/identity.ts";
import { writeAuditLog } from "../../shared/audit-log.ts";
import { AuditActionType } from "../../shared/moderation.ts";
import { json, err } from "../../shared/http.ts";

const AU_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
const DEFAULT_LIMIT = 20, MAX_LIMIT = 100;

async function hasVerifiedContact(base44: any, userId: string): Promise<boolean> {
  try {
    const ts = await base44.asServiceRole.entities.TrustScore.filter({ user_id: userId });
    if (ts.length === 0) return false;
    const events = await base44.asServiceRole.entities.TrustScoreEvent.filter({ trust_score_id: ts[0].id });
    return events.some((e: any) => e.signal_type === SignalType.EMAIL_VERIFIED || e.signal_type === SignalType.PHONE_VERIFIED);
  } catch {
    return false;
  }
}

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

    // ============ createListingDraft (any tier, good standing) ============
    if (action === "createListingDraft") {
      if (!user) return err("AUTH_REQUIRED", 401);
      if (!accountInGoodStanding(user)) return err(user.account_status === "banned" ? "ACCOUNT_BANNED" : "ACCOUNT_SUSPENDED", 403);
      const title = (body.title || "").trim();
      if (!title || title.length > TITLE_MAX) return err("VALIDATION_FAILED", 422, { title: "required, max 140 chars" });
      const listing_type = body.listing_type;
      if (!LISTING_TYPE_VALUES.includes(listing_type)) return err("VALIDATION_FAILED", 422, { listing_type: "invalid" });
      const category = body.category;
      if (!LISTING_CATEGORY_VALUES.includes(category)) return err("VALIDATION_FAILED", 422, { category: "invalid" });
      const fields: any = { title, listing_type, category, poster_id: user.id };
      if (body.description !== undefined) fields.description = (body.description || "").trim().slice(0, DESCRIPTION_MAX) || null;
      if (body.price !== undefined) {
        const p = Number(body.price);
        if (!Number.isFinite(p) || p < 0) return err("VALIDATION_FAILED", 422, { price: "must be a non-negative number" });
        fields.price = p;
      }
      if (body.condition !== undefined) {
        if (!LISTING_CONDITION_VALUES.includes(body.condition)) return err("VALIDATION_FAILED", 422, { condition: "invalid" });
        fields.condition = body.condition;
      }
      if (category !== ListingCategory.VEHICLE) {
        for (const f of ["compatible_make", "compatible_model", "compatible_chassis_code"]) {
          if (body[f] !== undefined) fields[f] = (body[f] || "").trim() || null;
        }
        for (const f of ["compatible_year_from", "compatible_year_to"]) {
          if (body[f] !== undefined) {
            const y = Number(body[f]);
            if (!Number.isInteger(y) || y < 1900 || y > 2100) return err("VALIDATION_FAILED", 422, { [f]: "invalid year" });
            fields[f] = y;
          }
        }
      }
      if (body.location_general !== undefined) fields.location_general = (body.location_general || "").trim() || null;
      if (body.location_state !== undefined) {
        if (!AU_STATES.includes(body.location_state)) return err("VALIDATION_FAILED", 422, { location_state: "invalid" });
        fields.location_state = body.location_state;
      }
      for (const f of ["postage_available", "pickup", "swap_accepted"]) {
        if (body[f] !== undefined) fields[f] = !!body[f];
      }
      if (body.photo_urls !== undefined) {
        if (!Array.isArray(body.photo_urls)) return err("VALIDATION_FAILED", 422, { photo_urls: "must be an array" });
        fields.photo_urls = body.photo_urls;
      }
      // Vehicle-category for_sale requires an owned primary_vehicle_id.
      if (category === ListingCategory.VEHICLE && listing_type === ListingType.FOR_SALE) {
        if (!body.primary_vehicle_id) return err("VALIDATION_FAILED", 422, { primary_vehicle_id: "required for vehicle for_sale listings" });
        const ov = await validateOwnedVehicle(base44, user, body.primary_vehicle_id);
        if (!ov.ok) return err("VALIDATION_FAILED", 422, { primary_vehicle_id: ov.error });
        fields.primary_vehicle_id = body.primary_vehicle_id;
      }
      const listing = await base44.entities.MarketplaceListing.create({
        ...fields, status: ListingStatus.DRAFT, view_count: 0, conversation_count: 0,
      });
      return json({ ok: true, listing_id: listing.id, status: ListingStatus.DRAFT, listing });
    }

    // ============ updateListing (poster only; non-terminal) ============
    if (action === "updateListing") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const listing = await base44.entities.MarketplaceListing.get(body.listing_id).catch(() => null);
      if (!listing) return err("RESOURCE_NOT_FOUND", 404);
      if (listing.poster_id !== user.id) return err("PERMISSION_DENIED", 403);
      if (TERMINAL_STATUSES.has(listing.status) || listing.status === ListingStatus.REMOVED_BY_POSTER || listing.status === ListingStatus.EXPIRED) {
        return err("INVALID_STATE_TRANSITION", 409, { current: listing.status });
      }
      const upd: any = {};
      if (body.title !== undefined) {
        const t = (body.title || "").trim();
        if (!t || t.length > TITLE_MAX) return err("VALIDATION_FAILED", 422, { title: "required, max 140 chars" });
        upd.title = t;
      }
      if (body.category !== undefined) {
        if (!LISTING_CATEGORY_VALUES.includes(body.category)) return err("VALIDATION_FAILED", 422, { category: "invalid" });
        upd.category = body.category;
      }
      if (body.description !== undefined) upd.description = (body.description || "").trim().slice(0, DESCRIPTION_MAX) || null;
      if (body.price !== undefined) {
        const p = Number(body.price);
        if (!Number.isFinite(p) || p < 0) return err("VALIDATION_FAILED", 422, { price: "invalid" });
        upd.price = p;
      }
      if (body.condition !== undefined) {
        if (!LISTING_CONDITION_VALUES.includes(body.condition)) return err("VALIDATION_FAILED", 422, { condition: "invalid" });
        upd.condition = body.condition;
      }
      const effectiveCategory = upd.category || listing.category;
      if (effectiveCategory !== ListingCategory.VEHICLE) {
        for (const f of ["compatible_make", "compatible_model", "compatible_chassis_code"]) {
          if (body[f] !== undefined) upd[f] = (body[f] || "").trim() || null;
        }
        for (const f of ["compatible_year_from", "compatible_year_to"]) {
          if (body[f] !== undefined) {
            const y = Number(body[f]);
            if (!Number.isInteger(y) || y < 1900 || y > 2100) return err("VALIDATION_FAILED", 422, { [f]: "invalid year" });
            upd[f] = y;
          }
        }
      }
      if (body.location_general !== undefined) upd.location_general = (body.location_general || "").trim() || null;
      if (body.location_state !== undefined) {
        if (!AU_STATES.includes(body.location_state)) return err("VALIDATION_FAILED", 422, { location_state: "invalid" });
        upd.location_state = body.location_state;
      }
      for (const f of ["postage_available", "pickup", "swap_accepted"]) {
        if (body[f] !== undefined) upd[f] = !!body[f];
      }
      if (body.photo_urls !== undefined) {
        if (!Array.isArray(body.photo_urls)) return err("VALIDATION_FAILED", 422, { photo_urls: "must be an array" });
        upd.photo_urls = body.photo_urls;
      }
      if (body.primary_vehicle_id !== undefined) {
        if (effectiveCategory === ListingCategory.VEHICLE && listing.listing_type === ListingType.FOR_SALE) {
          if (!body.primary_vehicle_id) return err("VALIDATION_FAILED", 422, { primary_vehicle_id: "required for vehicle for_sale listings" });
          const ov = await validateOwnedVehicle(base44, user, body.primary_vehicle_id);
          if (!ov.ok) return err("VALIDATION_FAILED", 422, { primary_vehicle_id: ov.error });
          upd.primary_vehicle_id = body.primary_vehicle_id;
        } else {
          upd.primary_vehicle_id = null;
        }
      }
      const updated = await base44.entities.MarketplaceListing.update(body.listing_id, upd);
      return json({ ok: true, listing_id: body.listing_id, listing: updated });
    }

    // ============ publishListing (poster only; Trusted Member+) ============
    if (action === "publishListing") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const listing = await base44.entities.MarketplaceListing.get(body.listing_id).catch(() => null);
      if (!listing) return err("RESOURCE_NOT_FOUND", 404);
      if (listing.poster_id !== user.id) return err("PERMISSION_DENIED", 403);
      if (!meetsCreationTier(user)) return err("LISTING_TIER_REQUIRED", 403, { required_tier: "trusted_member" });
      if (listing.status !== ListingStatus.DRAFT && listing.status !== ListingStatus.PENDING_REVIEW) {
        return err("INVALID_STATE_TRANSITION", 409, { current: listing.status });
      }
      if (listing.category === ListingCategory.VEHICLE && listing.listing_type === ListingType.FOR_SALE && !listing.primary_vehicle_id) {
        return err("VALIDATION_FAILED", 422, { primary_vehicle_id: "required for vehicle for_sale listings" });
      }
      const now = new Date();
      const updated = await base44.entities.MarketplaceListing.update(body.listing_id, {
        status: ListingStatus.ACTIVE,
        published_at: listing.published_at || now.toISOString(),
        expires_at: new Date(now.getTime() + LISTING_LIFETIME_MS).toISOString(),
      });
      await writeAuditLog(base44, {
        action: AuditActionType.LISTING_STATUS_CHANGED, actor_type: "user", actor_id: user.id,
        target_type: "listing", target_id: body.listing_id,
        context: JSON.stringify({ from: listing.status, to: ListingStatus.ACTIVE, listing_type: listing.listing_type }),
      }).catch(() => {});
      return json({ ok: true, listing_id: body.listing_id, status: ListingStatus.ACTIVE, listing: updated });
    }

    // ============ reserveListing (poster only; active/reserved) ============
    if (action === "reserveListing") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const listing = await base44.entities.MarketplaceListing.get(body.listing_id).catch(() => null);
      if (!listing) return err("RESOURCE_NOT_FOUND", 404);
      if (listing.poster_id !== user.id) return err("PERMISSION_DENIED", 403);
      if (listing.status !== ListingStatus.ACTIVE && listing.status !== ListingStatus.RESERVED) {
        return err("INVALID_STATE_TRANSITION", 409, { current: listing.status });
      }
      const reserved_by_id = body.reserved_by_id || null;
      const updated = await base44.entities.MarketplaceListing.update(body.listing_id, {
        status: ListingStatus.RESERVED, reserved_by_id,
      });
      await writeAuditLog(base44, {
        action: AuditActionType.LISTING_STATUS_CHANGED, actor_type: "user", actor_id: user.id,
        target_type: "listing", target_id: body.listing_id,
        context: JSON.stringify({ from: listing.status, to: ListingStatus.RESERVED, reserved_by_id }),
      }).catch(() => {});
      return json({ ok: true, listing_id: body.listing_id, status: ListingStatus.RESERVED, listing: updated });
    }

    // ============ markCompleted (poster only; active/reserved → completed; terminal) ============
    if (action === "markCompleted") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const listing = await base44.entities.MarketplaceListing.get(body.listing_id).catch(() => null);
      if (!listing) return err("RESOURCE_NOT_FOUND", 404);
      if (listing.poster_id !== user.id) return err("PERMISSION_DENIED", 403);
      if (listing.status !== ListingStatus.ACTIVE && listing.status !== ListingStatus.RESERVED) {
        return err("INVALID_STATE_TRANSITION", 409, { current: listing.status });
      }
      const conversation = body.conversation_id
        ? await base44.asServiceRole.entities.MarketplaceConversation.get(body.conversation_id).catch(() => null)
        : null;
      const updated = await base44.entities.MarketplaceListing.update(body.listing_id, {
        status: ListingStatus.COMPLETED, completed_at: new Date().toISOString(),
      });
      // ListingCompleted event consumers (signal + vehicle sync + notify + audit; listing_type in payload).
      await onListingCompleted(base44, { listing: { ...listing, status: ListingStatus.COMPLETED }, actor_id: user.id, conversation });
      return json({ ok: true, listing_id: body.listing_id, status: ListingStatus.COMPLETED, listing: updated });
    }

    // ============ expireListing (system/mod; active/reserved → expired) ============
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

    // ============ renewListing (poster only; 24h rate limit) ============
    if (action === "renewListing") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const listing = await base44.entities.MarketplaceListing.get(body.listing_id).catch(() => null);
      if (!listing) return err("RESOURCE_NOT_FOUND", 404);
      if (listing.poster_id !== user.id) return err("PERMISSION_DENIED", 403);
      if (listing.status !== ListingStatus.ACTIVE && listing.status !== ListingStatus.RESERVED) {
        return err("INVALID_STATE_TRANSITION", 409, { current: listing.status });
      }
      const now = Date.now();
      const last = listing.last_renewed_at ? new Date(listing.last_renewed_at).getTime() : 0;
      if (now - last < RENEWAL_WINDOW_MS) return err("LISTING_RENEWAL_TOO_SOON", 409, { last_renewed_at: listing.last_renewed_at });
      const baseExpires = listing.expires_at ? new Date(listing.expires_at).getTime() : now;
      const newExpires = Math.max(baseExpires, now) + LISTING_LIFETIME_MS;
      const updated = await base44.entities.MarketplaceListing.update(body.listing_id, {
        expires_at: new Date(newExpires).toISOString(), last_renewed_at: new Date(now).toISOString(),
      });
      return json({ ok: true, listing_id: body.listing_id, expires_at: updated.expires_at, last_renewed_at: updated.last_renewed_at });
    }

    // ============ removeListing (poster → removed_by_poster) ============
    if (action === "removeListing") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const listing = await base44.entities.MarketplaceListing.get(body.listing_id).catch(() => null);
      if (!listing) return err("RESOURCE_NOT_FOUND", 404);
      if (listing.poster_id !== user.id) return err("PERMISSION_DENIED", 403);
      if (TERMINAL_STATUSES.has(listing.status)) return err("INVALID_STATE_TRANSITION", 409, { current: listing.status, reason: "terminal" });
      if (listing.status === ListingStatus.REMOVED_BY_POSTER) return json({ ok: true, status: ListingStatus.REMOVED_BY_POSTER });
      const updated = await base44.entities.MarketplaceListing.update(body.listing_id, { status: ListingStatus.REMOVED_BY_POSTER });
      await writeAuditLog(base44, {
        action: AuditActionType.LISTING_STATUS_CHANGED, actor_type: "user", actor_id: user.id,
        target_type: "listing", target_id: body.listing_id,
        context: JSON.stringify({ from: listing.status, to: ListingStatus.REMOVED_BY_POSTER }),
      }).catch(() => {});
      return json({ ok: true, listing_id: body.listing_id, status: ListingStatus.REMOVED_BY_POSTER, listing: updated });
    }

    // ============ startConversation (initiator: New Member+ verified contact; not own listing; not blocked) ============
    if (action === "startConversation") {
      if (!user) return err("AUTH_REQUIRED", 401);
      if (!accountInGoodStanding(user)) return err(user.account_status === "banned" ? "ACCOUNT_BANNED" : "ACCOUNT_SUSPENDED", 403);
      if (!meetsParticipationTier(user)) return err("PERMISSION_DENIED", 403, { required_tier: "new_member" });
      const listing = await base44.entities.MarketplaceListing.get(body.listing_id).catch(() => null);
      if (!listing || listing.status === ListingStatus.REMOVED_BY_MODERATION) return err("RESOURCE_NOT_FOUND", 404);
      if (listing.status === ListingStatus.DRAFT) return err("LISTING_NOT_AVAILABLE", 409, { current: listing.status });
      if (listing.poster_id === user.id) return err("CANNOT_MESSAGE_OWN_LISTING", 403);
      if (!(await hasVerifiedContact(base44, user.id))) {
        return err("VERIFIED_CONTACT_REQUIRED", 422, { contact: "a verified email or phone is required to message a poster" });
      }
      const blocked = await isBlockedEitherDirection(base44, user.id, listing.poster_id);
      if (blocked) return err("MESSAGE_ACCESS_REVOKED", 403, { reason: "blocked" });
      const existing = await base44.entities.MarketplaceConversation.filter({
        listing_id: body.listing_id, initiator_id: user.id, status: ConversationStatus.ACTIVE,
      });
      if (existing.length > 0) return err("CONVERSATION_ALREADY_EXISTS", 409, { conversation_id: existing[0].id });
      const conversation = await base44.entities.MarketplaceConversation.create({
        listing_id: body.listing_id, poster_id: listing.poster_id, initiator_id: user.id,
        status: ConversationStatus.ACTIVE, last_message_at: new Date().toISOString(),
        poster_last_read_at: null, initiator_last_read_at: new Date().toISOString(),
      });
      await base44.asServiceRole.entities.MarketplaceListing.update(body.listing_id, {
        conversation_count: (listing.conversation_count || 0) + 1,
      }).catch(() => {});
      // MarketplaceConversationStarted → notify the poster.
      await onMarketplaceConversationStarted(base44, { conversation, listing, actor_id: user.id });
      return json({ ok: true, conversation_id: conversation.id, conversation });
    }

    // ============ sendMessage (participant; not blocked; contact-pattern warning) ============
    if (action === "sendMessage") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const conversation = await base44.entities.MarketplaceConversation.get(body.conversation_id).catch(() => null);
      if (!conversation) return err("RESOURCE_NOT_FOUND", 404);
      const isPoster = conversation.poster_id === user.id;
      const isInitiator = conversation.initiator_id === user.id;
      if (!isPoster && !isInitiator) return err("PERMISSION_DENIED", 403);
      if (conversation.status !== ConversationStatus.ACTIVE) return err("INVALID_STATE_TRANSITION", 409, { current: conversation.status });
      const otherId = isPoster ? conversation.initiator_id : conversation.poster_id;
      const blocked = await isBlockedEitherDirection(base44, user.id, otherId);
      if (blocked) return err("MESSAGE_ACCESS_REVOKED", 403, { reason: "blocked" });
      const text = (body.body || "").trim();
      if (!text) return err("VALIDATION_FAILED", 422, { body: "required" });
      if (text.length > MESSAGE_BODY_MAX) return err("VALIDATION_FAILED", 422, { body: "max 4000 chars" });
      // Contact-sharing pattern warning — warn, do not hard-block. A confirmed
      // re-call with acknowledge_risk=true sends despite the warning.
      const risk = detectContactSharing(text);
      if (risk.detected && !body.acknowledge_risk) {
        return err("MESSAGE_CONTACT_PATTERN_DETECTED", 422, { patterns: risk.patterns });
      }
      const message = await base44.entities.MarketplaceMessage.create({
        conversation_id: body.conversation_id, sender_id: user.id, body: text, status: MessageStatus.PUBLISHED,
      });
      const nowIso = new Date().toISOString();
      const preview = text.length > PREVIEW_MAX ? text.slice(0, PREVIEW_MAX) : text;
      const readField = isPoster ? "poster_last_read_at" : "initiator_last_read_at";
      await base44.entities.MarketplaceConversation.update(body.conversation_id, {
        last_message_at: nowIso, last_message_preview: preview, [readField]: nowIso,
      });
      // MarketplaceMessageSent → notify the recipient.
      await onMarketplaceMessageSent(base44, { conversation, message, sender_id: user.id });
      return json({ ok: true, message_id: message.id, message, risk_warning: risk.detected ? risk.patterns : null });
    }

    // ============ archiveConversation (participant; active → archived) ============
    if (action === "archiveConversation") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const conversation = await base44.entities.MarketplaceConversation.get(body.conversation_id).catch(() => null);
      if (!conversation) return err("RESOURCE_NOT_FOUND", 404);
      if (conversation.poster_id !== user.id && conversation.initiator_id !== user.id) return err("PERMISSION_DENIED", 403);
      if (conversation.status !== ConversationStatus.ACTIVE) return json({ ok: true, status: conversation.status });
      const updated = await base44.entities.MarketplaceConversation.update(body.conversation_id, { status: ConversationStatus.ARCHIVED });
      return json({ ok: true, conversation_id: body.conversation_id, status: ConversationStatus.ARCHIVED, conversation: updated });
    }

    // ============ removeOwnMessage (sender only; published → removed_by_sender; no edit) ============
    if (action === "removeOwnMessage") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const message = await base44.entities.MarketplaceMessage.get(body.message_id).catch(() => null);
      if (!message) return err("RESOURCE_NOT_FOUND", 404);
      if (message.sender_id !== user.id) return err("PERMISSION_DENIED", 403);
      if (message.status !== MessageStatus.PUBLISHED) return json({ ok: true, status: message.status });
      const updated = await base44.entities.MarketplaceMessage.update(body.message_id, { status: MessageStatus.REMOVED_BY_SENDER });
      return json({ ok: true, message_id: body.message_id, status: MessageStatus.REMOVED_BY_SENDER, message: updated });
    }

    // ============ markConversationRead (participant) ============
    if (action === "markConversationRead") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const conversation = await base44.entities.MarketplaceConversation.get(body.conversation_id).catch(() => null);
      if (!conversation) return err("RESOURCE_NOT_FOUND", 404);
      const isPoster = conversation.poster_id === user.id;
      const isInitiator = conversation.initiator_id === user.id;
      if (!isPoster && !isInitiator) return err("PERMISSION_DENIED", 403);
      const readField = isPoster ? "poster_last_read_at" : "initiator_last_read_at";
      const updated = await base44.entities.MarketplaceConversation.update(body.conversation_id, { [readField]: new Date().toISOString() });
      return json({ ok: true, conversation_id: body.conversation_id, conversation: updated });
    }

    // ============ blockUser / unblockUser (SafetyService block-list CRUD) ============
    if (action === "blockUser") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const blockedId = body.blocked_id;
      if (!blockedId || blockedId === user.id) return err("VALIDATION_FAILED", 422, { blocked_id: "invalid" });
      const block = await createBlock(base44, user.id, blockedId);
      return json({ ok: true, block_id: block.id });
    }
    if (action === "unblockUser") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const r = await removeBlock(base44, user.id, body.blocked_id);
      return json({ ok: true, removed: r.removed });
    }

    // ============ expireListings (SYSTEM — called by the expiry workflow) ============
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

    // ============ getListing (public for active/reserved/completed/expired; private otherwise) ============
    if (action === "getListing") {
      const listing = await base44.entities.MarketplaceListing.get(body.listing_id).catch(() => null);
      if (!listing) return err("RESOURCE_NOT_FOUND", 404);
      const publicVisible = [ListingStatus.ACTIVE, ListingStatus.RESERVED, ListingStatus.COMPLETED, ListingStatus.EXPIRED].includes(listing.status);
      const isOwner = user && listing.poster_id === user.id;
      const isMod = user && (user.role === "admin" || user.account_tier === "moderator");
      if (!publicVisible && !isOwner && !isMod) return err("RESOURCE_NOT_FOUND", 404);
      const poster = await base44.asServiceRole.entities.User.get(listing.poster_id).catch(() => null);
      return json({
        ok: true,
        listing: { ...listing, poster_name: poster?.display_name || poster?.handle || "Poster", poster_handle: poster?.handle || null },
      });
    }

    // ============ listListings (public; active only, with filters) ============
    if (action === "listListings") {
      const filter: any = { status: ListingStatus.ACTIVE };
      if (body.listing_type && LISTING_TYPE_VALUES.includes(body.listing_type)) filter.listing_type = body.listing_type;
      if (body.category && LISTING_CATEGORY_VALUES.includes(body.category)) filter.category = body.category;
      if (body.location_state && AU_STATES.includes(body.location_state)) filter.location_state = body.location_state;
      let listings = await base44.asServiceRole.entities.MarketplaceListing.filter(filter, "-created_date", 500);
      if (body.compatible_make) {
        const m = String(body.compatible_make).toLowerCase();
        listings = listings.filter((l: any) => (l.compatible_make || "").toLowerCase().includes(m) || (l.compatible_model || "").toLowerCase().includes(m));
      }
      if (body.compatible_chassis_code) {
        const c = String(body.compatible_chassis_code).toLowerCase();
        listings = listings.filter((l: any) => (l.compatible_chassis_code || "").toLowerCase().includes(c));
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
      const limit = Math.min(Number(body.limit) || DEFAULT_LIMIT, MAX_LIMIT);
      const offset = Number(body.offset) || 0;
      const page = listings.slice(offset, offset + limit);
      const enriched = await Promise.all(page.map(async (l: any) => {
        const poster = await base44.asServiceRole.entities.User.get(l.poster_id).catch(() => null);
        return { ...l, poster_name: poster?.display_name || poster?.handle || "Poster", poster_handle: poster?.handle || null };
      }));
      return json({ ok: true, listings: enriched, count: listings.length, next_offset: offset + enriched.length < listings.length ? offset + limit : null });
    }

    // ============ getConversation (participant only) ============
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
      return json({
        ok: true,
        conversation,
        listing: listing ? { id: listing.id, title: listing.title, listing_type: listing.listing_type, category: listing.category, price: listing.price, status: listing.status, photo_urls: listing.photo_urls } : null,
        my_role: myRole,
        other_party: { user_id: otherId, display_name: other?.display_name || other?.handle || "User", handle: other?.handle || null },
      });
    }

    // ============ listConversations (current user's inbox) ============
    if (action === "listConversations") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const asPoster = await base44.entities.MarketplaceConversation.filter({ poster_id: user.id }, "-last_message_at", 200);
      const asInitiator = await base44.entities.MarketplaceConversation.filter({ initiator_id: user.id }, "-last_message_at", 200);
      let all = [...asPoster, ...asInitiator];
      all.sort((a: any, b: any) => (b.last_message_at || "").localeCompare(a.last_message_at || ""));
      if (body.status && CONVERSATION_STATUS_VALUES.includes(body.status)) {
        all = all.filter((c: any) => c.status === body.status);
      }
      const limit = Math.min(Number(body.limit) || DEFAULT_LIMIT, MAX_LIMIT);
      const offset = Number(body.offset) || 0;
      const page = all.slice(offset, offset + limit);
      const enriched = await Promise.all(page.map(async (c: any) => {
        const listing = await base44.asServiceRole.entities.MarketplaceListing.get(c.listing_id).catch(() => null);
        const otherId = c.poster_id === user.id ? c.initiator_id : c.poster_id;
        const other = await base44.asServiceRole.entities.User.get(otherId).catch(() => null);
        const myReadAt = c.poster_id === user.id ? c.poster_last_read_at : c.initiator_last_read_at;
        return {
          ...c,
          listing_title: listing?.title || "(removed)",
          listing_type: listing?.listing_type || null,
          listing_price: listing?.price || null,
          other_party: { user_id: otherId, display_name: other?.display_name || other?.handle || "User", handle: other?.handle || null },
          unread: myReadAt ? (c.last_message_at || "") > (myReadAt || "") : !!c.last_message_at,
        };
      }));
      return json({ ok: true, conversations: enriched, count: all.length, next_offset: offset + enriched.length < all.length ? offset + limit : null });
    }

    // ============ getMessages (participant; history always visible even if blocked) ============
    if (action === "getMessages") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const conversation = await base44.entities.MarketplaceConversation.get(body.conversation_id).catch(() => null);
      if (!conversation) return err("RESOURCE_NOT_FOUND", 404);
      if (conversation.poster_id !== user.id && conversation.initiator_id !== user.id) return err("PERMISSION_DENIED", 403);
      const messages = await base44.asServiceRole.entities.MarketplaceMessage.filter({ conversation_id: body.conversation_id }, "created_date", 500);
      const enriched = await Promise.all(messages.map(async (m: any) => {
        const sender = await base44.asServiceRole.entities.User.get(m.sender_id).catch(() => null);
        return { ...m, sender_name: sender?.display_name || sender?.handle || "User", sender_handle: sender?.handle || null };
      }));
      return json({ ok: true, messages: enriched });
    }

    // ============ listMyListings (poster's own; all statuses) ============
    if (action === "listMyListings") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const listings = await base44.entities.MarketplaceListing.filter({ poster_id: user.id }, "-created_date", 200);
      return json({ ok: true, listings });
    }

    return err("VALIDATION_FAILED", 422, { action: "unknown" });
  } catch (error) {
    return json({ error: error.message }, 500);
  }
});