/**
 * Honda Hub — MarketplaceService shared module (Phase 08, Final spec)
 *
 * Registries, validation helpers, moderation-delegate write paths, the
 * VehicleService-delegated sale_status seam, and the four Marketplace event
 * consumers (ListingCompleted, ListingExpired, MarketplaceConversationStarted,
 * MarketplaceMessageSent).
 *
 * Single-Writer: MarketplaceService (base44/functions/marketplace/entry.ts) is
 * the ONLY writer of MarketplaceListing, MarketplaceConversation,
 * MarketplaceMessage. ModerationService routes listing + marketplace_message
 * removals/restorations back through applyModerationActionToListing /
 * applyModerationActionToMessage (the owning-service delegates), never a
 * direct write — mirroring the business_review pattern (Phase 07).
 *
 * Cross-service seams (all via asServiceRole, documented as the owning
 * service's delegated write for this seam — same pattern as awardSignalToUser
 * writing User.account_tier on behalf of TrustScoreService):
 *  - Vehicle.sale_status sync on markCompleted (markVehicleSoldFromListing,
 *    VehicleService-delegated; idempotent when already sold).
 *  - TrustScore MARKETPLACE_SUCCESS signal award (TrustScoreService-delegated).
 *  - Notifications (NotificationService shared).
 *
 * Per the final spec, MarketplaceService emits NO audit log and NO direct
 * notification for ListingCompleted (routine content activity); ListingExpired
 * notifies the poster; ConversationStarted notifies the poster; MessageSent
 * notifies the recipient. Audit logging only happens on moderator-driven
 * removals, via ModerationService.applyAction (Phase 05).
 */

import { awardSignalToUser } from "./trust-score.ts";
import { SignalType, NotificationType } from "./identity.ts";
import { createNotification } from "./notifications.ts";
import { ModerationActionType } from "./moderation.ts";

// ---- Registries (Section C — exhaustive) ----

export const ListingType = Object.freeze({
  FOR_SALE: "for_sale",
  WANTED: "wanted",
});
export const LISTING_TYPE_VALUES = Object.values(ListingType);

export const ListingCategory = Object.freeze({
  VEHICLE: "vehicle",
  ENGINE: "engine",
  TRANSMISSION: "transmission",
  FORCED_INDUCTION: "forced_induction",
  WHEELS_TYRES: "wheels_tyres",
  SUSPENSION: "suspension",
  BRAKES: "brakes",
  ELECTRONICS: "electronics",
  INTERIOR: "interior",
  EXTERIOR: "exterior",
  PERFORMANCE_PART: "performance_part",
  TOOLS_EQUIPMENT: "tools_equipment",
  OTHER: "other",
});
export const LISTING_CATEGORY_VALUES = Object.values(ListingCategory);

export const ListingStatus = Object.freeze({
  DRAFT: "draft",
  PENDING_REVIEW: "pending_review",
  ACTIVE: "active",
  RESERVED: "reserved",
  COMPLETED: "completed",
  EXPIRED: "expired",
  REMOVED_BY_POSTER: "removed_by_poster",
  REMOVED_BY_MODERATION: "removed_by_moderation",
});
export const LISTING_STATUS_VALUES = Object.values(ListingStatus);

export const ListingCondition = Object.freeze({
  NEW: "new",
  USED: "used",
  FOR_PARTS_OR_REPAIR: "for_parts_or_repair",
});
export const LISTING_CONDITION_VALUES = Object.values(ListingCondition);

export const PriceType = Object.freeze({
  FIXED: "fixed",
  NEGOTIABLE: "negotiable",
  POA: "poa",
  FREE: "free",
});
export const PRICE_TYPE_VALUES = Object.values(PriceType);

export const MessageStatus = Object.freeze({
  SENT: "sent",
  REMOVED_BY_SENDER: "removed_by_sender",
  REMOVED_BY_MODERATION: "removed_by_moderation",
});

// 24-hour renewal rate limit (ADR-025).
export const RENEWAL_WINDOW_MS = 24 * 60 * 60 * 1000;
// Default active lifetime on publish / renewal = 30 days.
export const LISTING_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export const TITLE_MAX = 140;
export const DESCRIPTION_MAX = 4000;
export const MESSAGE_BODY_MAX = 4000;

// Terminal states — zero outbound transitions (Section E.1).
// completed + removed_by_moderation + removed_by_poster are all terminal.
export const TERMINAL_STATUSES = Object.freeze(new Set([
  ListingStatus.COMPLETED,
  ListingStatus.REMOVED_BY_MODERATION,
  ListingStatus.REMOVED_BY_POSTER,
]));

// ---- Contact-sharing pattern detection (Section I.3) ----
// Warn (do NOT hard-block) when a message body contains a phone number, email,
// or off-platform messaging-app mention. A detected match returns the first
// matched pattern type; the caller emits CONTACT_SHARING_WARNING (ok:false,
// 200) and only sends on a confirmed resubmission with
// confirmed_despite_warning=true.

const PHONE_RE = /(?:\+?61[\s-]?)?(?:\b0[23478]\d{8}\b|\b04\d{2}[\s-]?\d{3}[\s-]?\d{3}\b|\b1[38]00[\s-]?\d{3}[\s-]?\d{3}\b|\b\d{10}\b)/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const MESSAGING_APP_RE = /\b(whatsapp|telegram|signal|snapchat|snap\s?chat|kik|discord|wechat|messenger|instagram\s?dm|ig\s?dm|viber|line)\b/i;

export function detectContactSharing(body: string): { detected: boolean; pattern_type: string | null; patterns: string[] } {
  if (!body) return { detected: false, pattern_type: null, patterns: [] };
  const patterns: string[] = [];
  if (PHONE_RE.test(body)) patterns.push("phone");
  if (EMAIL_RE.test(body)) patterns.push("email");
  if (MESSAGING_APP_RE.test(body)) patterns.push("messaging_app");
  return { detected: patterns.length > 0, pattern_type: patterns[0] || null, patterns };
}

// ---- Moderation delegate write paths (Section I.2) ----
// Internal-only, called by ModerationService via content-moderation.ts.
// Signature: { target_id, moderation_action_id, new_status } → { target_id, status, changed }.

export async function applyModerationActionToListing(
  base44: any,
  args: { target_id: string; moderation_action_id?: string; new_status: string },
): Promise<{ target_id: string; status: string; changed: boolean }> {
  const { target_id, new_status } = args;
  try {
    const listing = await base44.asServiceRole.entities.MarketplaceListing.get(target_id);
    if (listing.status === new_status) return { target_id, status: new_status, changed: false };
    await base44.asServiceRole.entities.MarketplaceListing.update(target_id, { status: new_status });
    return { target_id, status: new_status, changed: true };
  } catch {
    return { target_id, status: new_status, changed: false };
  }
}

export async function applyModerationActionToMessage(
  base44: any,
  args: { target_id: string; moderation_action_id?: string; new_status: string },
): Promise<{ target_id: string; status: string; changed: boolean }> {
  const { target_id, new_status } = args;
  try {
    const message = await base44.asServiceRole.entities.MarketplaceMessage.get(target_id);
    if (message.status === new_status) return { target_id, status: new_status, changed: false };
    await base44.asServiceRole.entities.MarketplaceMessage.update(target_id, { status: new_status });
    return { target_id, status: new_status, changed: true };
  } catch {
    return { target_id, status: new_status, changed: false };
  }
}

// ---- VehicleService-delegated sale_status seam (Section I.1) ----
// MarketplaceService calls this, never a direct Vehicle write. Idempotent:
// if sale_status is already "sold", succeeds without error and returns the
// current state, regardless of source.

export async function markVehicleSoldFromListing(
  base44: any,
  args: { vehicle_id: string; source_listing_id: string },
): Promise<{ vehicle_id: string; sale_status: string }> {
  const { vehicle_id } = args;
  try {
    const v = await base44.asServiceRole.entities.Vehicle.get(vehicle_id);
    if (v.sale_status === "sold") return { vehicle_id, sale_status: "sold" };
    await base44.asServiceRole.entities.Vehicle.update(vehicle_id, { sale_status: "sold" });
    return { vehicle_id, sale_status: "sold" };
  } catch {
    return { vehicle_id, sale_status: "sold" };
  }
}

// ---- Event consumers (Section G — exact payloads) ----
// Firing an event = executing its documented consumers. No event-bus entity;
// consumers are wired directly (same as onBusinessVerified).

/**
 * ListingCompleted (Section G.1). Consumers: TrustScoreService (award
 * marketplace_success signal, idempotent); VehicleService (sync
 * Vehicle.sale_status → sold, only if primary_vehicle_id is set).
 * No direct notification. No audit entry (routine content activity).
 */
export async function onListingCompleted(
  base44: any,
  opts: { listing: any; actor_id: string },
) {
  const { listing, actor_id } = opts;
  await awardSignalToUser(base44, {
    target_user_id: listing.poster_id,
    signal_type: SignalType.MARKETPLACE_SUCCESS,
    reason: `Listing completed: ${listing.title}`,
    actor: `user:${actor_id}`,
  }).catch(() => null);
  if (listing.primary_vehicle_id && listing.listing_type === ListingType.FOR_SALE && listing.category === ListingCategory.VEHICLE) {
    await markVehicleSoldFromListing(base44, {
      vehicle_id: listing.primary_vehicle_id,
      source_listing_id: listing.id,
    }).catch(() => null);
  }
  return { ok: true };
}

/**
 * ListingExpired (Section G.2). Consumer: NotificationService (notify poster).
 * No audit entry.
 */
export async function onListingExpired(base44: any, opts: { listing: any }) {
  const { listing } = opts;
  await createNotification(base44, {
    recipient_id: listing.poster_id,
    notification_type: NotificationType.LISTING_UPDATE,
    target_type: "listing",
    target_id: listing.id,
  }).catch(() => {});
  return { ok: true };
}

/**
 * MarketplaceConversationStarted (Section G.3). Consumer: NotificationService
 * (notify the listing poster).
 */
export async function onMarketplaceConversationStarted(
  base44: any,
  opts: { conversation: any; listing: any; actor_id: string },
) {
  const { conversation, listing, actor_id } = opts;
  if (listing.poster_id && listing.poster_id !== actor_id) {
    await createNotification(base44, {
      recipient_id: listing.poster_id,
      notification_type: NotificationType.LISTING_UPDATE,
      actor_id,
      target_type: "listing",
      target_id: listing.id,
    }).catch(() => {});
  }
  return { ok: true, conversation };
}

/**
 * MarketplaceMessageSent (Section G.4). Consumers: MarketplaceService itself
 * (last_message_at update — performed in the function); NotificationService
 * (notify recipient); ModerationService (async scam-pattern scan — hook only).
 */
export async function onMarketplaceMessageSent(
  base44: any,
  opts: { conversation: any; message: any; sender_id: string },
) {
  const { conversation, message, sender_id } = opts;
  const recipientId = conversation.poster_id === sender_id ? conversation.initiator_id : conversation.poster_id;
  if (recipientId && recipientId !== sender_id) {
    await createNotification(base44, {
      recipient_id: recipientId,
      notification_type: NotificationType.NEW_MARKETPLACE_MESSAGE,
      actor_id: sender_id,
      target_type: "marketplace_message",
      target_id: message.id,
    }).catch(() => {});
  }
  return { ok: true };
}