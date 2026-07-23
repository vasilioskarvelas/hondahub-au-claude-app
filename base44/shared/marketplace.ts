/**
 * Honda Hub — MarketplaceService shared module (Phase 08)
 *
 * Registries, validation helpers, moderation-delegate write paths, and the
 * four Marketplace event consumers (ListingCompleted, ListingExpired,
 * MarketplaceConversationStarted, MarketplaceMessageSent).
 *
 * Single-Writer: MarketplaceService (base44/functions/marketplace/entry.ts) is
 * the ONLY writer of MarketplaceListing, MarketplaceConversation,
 * MarketplaceMessage. The content-moderation delegate routes listing +
 * marketplace_message removals/restorations back through this module's
 * helpers (applyModerationActionToListing / applyModerationActionToMessage),
 * never a direct write from ModerationService — mirroring the business_review
 * pattern established in Phase 07.
 *
 * Cross-service seams (all via asServiceRole, documented as the owning
 * service's delegated write for this seam — same pattern as awardSignalToUser
 * writing User.account_tier on behalf of TrustScoreService):
 *  - Vehicle.sale_status sync on markCompleted (VehicleService-delegated).
 *  - TrustScore MARKETPLACE_SUCCESS signal award (TrustScoreService-delegated).
 *  - Notifications + AuditLog (NotificationService / AuditLogService shared).
 */

import { awardSignalToUser } from "./trust-score.ts";
import { SignalType, NotificationType } from "./identity.ts";
import { createNotification } from "./notifications.ts";
import { writeAuditLog } from "./audit-log.ts";
import { AuditActionType } from "./moderation.ts";
import { ModerationActionType } from "./moderation.ts";

// ---- Registries (Phase 08) ----

export const ListingType = Object.freeze({
  FOR_SALE: "for_sale",
  WANTED: "wanted",
});
export const LISTING_TYPE_VALUES = Object.values(ListingType);

export const ListingCategory = Object.freeze({
  VEHICLE: "vehicle",
  PARTS: "parts",
  WHEELS_TYRES: "wheels_tyres",
  ACCESSORIES: "accessories",
  AUDIO: "audio",
  TOOLS: "tools",
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
  REFURBISHED: "refurbished",
  FOR_PARTS: "for_parts",
});
export const LISTING_CONDITION_VALUES = Object.values(ListingCondition);

export const ConversationStatus = Object.freeze({
  ACTIVE: "active",
  ARCHIVED: "archived",
});
export const CONVERSATION_STATUS_VALUES = Object.values(ConversationStatus);

export const MessageStatus = Object.freeze({
  PUBLISHED: "published",
  REMOVED_BY_SENDER: "removed_by_sender",
  REMOVED_BY_MODERATION: "removed_by_moderation",
});

export const AU_STATE_VALUES = Object.freeze(["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]);

// 24-hour renewal rate limit (§18 last_renewed_at).
export const RENEWAL_WINDOW_MS = 24 * 60 * 60 * 1000;
// Default active lifetime on publish / renewal.
export const LISTING_LIFETIME_DAYS = 30;
export const LISTING_LIFETIME_MS = LISTING_LIFETIME_DAYS * 24 * 60 * 60 * 1000;

export const TITLE_MAX = 140;
export const DESCRIPTION_MAX = 4000;
export const MESSAGE_BODY_MAX = 4000;
export const PREVIEW_MAX = 120;

// Terminal statuses — no transition out (§testing: completed + removed_by_moderation terminal).
export const TERMINAL_STATUSES = Object.freeze(new Set([
  ListingStatus.COMPLETED, ListingStatus.REMOVED_BY_MODERATION,
]));

// ---- Contact-sharing pattern detection (§safety gates) ----
// Warn (do NOT hard-block) when a message body contains a phone number, email,
// or off-platform messaging-app mention. False positives on legitimate content
// are common enough that a warning is the right confidence level.

const PHONE_RE = /(?:\+?61[\s-]?)?(?:\b0[23478]\d{8}\b|\b04\d{2}[\s-]?\d{3}[\s-]?\d{3}\b|\b1[38]00[\s-]?\d{3}[\s-]?\d{3}\b|\b\d{10}\b)/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const MESSAGING_APP_RE = /\b(whatsapp|telegram|signal|snapchat|snap\s?chat|kik|discord|wechat|messenger|instagram\s?dm|ig\s?dm|viber|line)\b/i;

export function detectContactSharing(body: string): { detected: boolean; patterns: string[] } {
  if (!body) return { detected: false, patterns: [] };
  const patterns: string[] = [];
  if (PHONE_RE.test(body)) patterns.push("phone_number");
  if (EMAIL_RE.test(body)) patterns.push("email");
  if (MESSAGING_APP_RE.test(body)) patterns.push("messaging_app");
  return { detected: patterns.length > 0, patterns };
}

// ---- Moderation delegate write paths (called by content-moderation.ts) ----

export async function applyModerationActionToListing(
  base44: any,
  listingId: string,
  action_type: string,
): Promise<{ ok: boolean; changed: boolean; error?: string }> {
  try {
    const listing = await base44.asServiceRole.entities.MarketplaceListing.get(listingId);
    if (action_type === ModerationActionType.CONTENT_REMOVED || action_type === ModerationActionType.LISTING_REMOVED) {
      if (listing.status === ListingStatus.REMOVED_BY_MODERATION) return { ok: true, changed: false };
      await base44.asServiceRole.entities.MarketplaceListing.update(listingId, { status: ListingStatus.REMOVED_BY_MODERATION });
      return { ok: true, changed: true };
    }
    if (action_type === ModerationActionType.CONTENT_RESTORED) {
      // Restore to active if it was moderation-removed (cannot restore a completed/expired/removed_by_poster listing).
      if (listing.status !== ListingStatus.REMOVED_BY_MODERATION) return { ok: true, changed: false };
      await base44.asServiceRole.entities.MarketplaceListing.update(listingId, { status: ListingStatus.ACTIVE });
      return { ok: true, changed: true };
    }
    return { ok: true, changed: false };
  } catch {
    return { ok: false, error: "listing not found" };
  }
}

export async function applyModerationActionToMessage(
  base44: any,
  messageId: string,
  action_type: string,
): Promise<{ ok: boolean; changed: boolean; error?: string }> {
  try {
    const message = await base44.asServiceRole.entities.MarketplaceMessage.get(messageId);
    if (action_type === ModerationActionType.CONTENT_REMOVED) {
      if (message.status === MessageStatus.REMOVED_BY_MODERATION) return { ok: true, changed: false };
      await base44.asServiceRole.entities.MarketplaceMessage.update(messageId, { status: MessageStatus.REMOVED_BY_MODERATION });
      return { ok: true, changed: true };
    }
    if (action_type === ModerationActionType.CONTENT_RESTORED) {
      if (message.status !== MessageStatus.REMOVED_BY_MODERATION) return { ok: true, changed: false };
      await base44.asServiceRole.entities.MarketplaceMessage.update(messageId, { status: MessageStatus.PUBLISHED });
      return { ok: true, changed: true };
    }
    return { ok: true, changed: false };
  } catch {
    return { ok: false, error: "message not found" };
  }
}

// ---- Vehicle sale_status sync (VehicleService-delegated write for this seam) ----
// On markCompleted of a vehicle-category for_sale listing with an owned
// primary_vehicle_id, the Vehicle's sale_status is set to "sold". This is the
// sanctioned marketplace→vehicle seam (mirrors awardSignalToUser→User.account_tier).

export async function syncVehicleSaleStatusOnCompletion(
  base44: any,
  listing: any,
): Promise<{ synced: boolean; vehicle_id?: string }> {
  if (!listing) return { synced: false };
  if (listing.listing_type !== ListingType.FOR_SALE) return { synced: false };
  if (listing.category !== ListingCategory.VEHICLE) return { synced: false };
  if (!listing.primary_vehicle_id) return { synced: false };
  try {
    await base44.asServiceRole.entities.Vehicle.update(listing.primary_vehicle_id, { sale_status: "sold" });
    return { synced: true, vehicle_id: listing.primary_vehicle_id };
  } catch {
    return { synced: false };
  }
}

// ---- Event consumers (EVENT_CATALOG.md payloads) ----
// Firing an event = executing its documented consumers (trust signal,
// notification, audit log). There is no separate event-bus entity; the
// consumers are wired directly here, exactly as onBusinessVerified does.

/**
 * ListingCompleted (never ListingSold). Payload includes listing_type so
 * consumers derive "Sold" vs "Fulfilled" display text themselves.
 * Consumers: MARKETPLACE_SUCCESS trust signal to the poster (+ the other
 * party if a conversation is associated), Vehicle sale_status sync, notify
 * the other party, audit log with listing_type in context.
 */
export async function onListingCompleted(
  base44: any,
  opts: { listing: any; actor_id: string; conversation?: any | null },
) {
  const { listing, actor_id, conversation } = opts;
  const otherPartyId = conversation
    ? (conversation.poster_id === actor_id ? conversation.initiator_id : conversation.poster_id)
    : null;

  // 1. MARKETPLACE_SUCCESS trust signal to the poster (idempotent).
  await awardSignalToUser(base44, {
    target_user_id: listing.poster_id,
    signal_type: SignalType.MARKETPLACE_SUCCESS,
    reason: `Listing completed: ${listing.title}`,
    actor: `user:${actor_id}`,
  }).catch(() => null);

  // 2. Vehicle sale_status sync (vehicle-category for_sale only).
  await syncVehicleSaleStatusOnCompletion(base44, listing).catch(() => null);

  // 3. Notify the other party of the completion.
  if (otherPartyId && otherPartyId !== actor_id) {
    await createNotification(base44, {
      recipient_id: otherPartyId,
      notification_type: NotificationType.LISTING_UPDATE,
      actor_id,
      target_type: "listing",
      target_id: listing.id,
    }).catch(() => {});
  }

  // 4. Audit log — listing_type carried in context so consumers derive display text.
  await writeAuditLog(base44, {
    action: AuditActionType.LISTING_STATUS_CHANGED,
    actor_type: "user",
    actor_id,
    target_type: "listing",
    target_id: listing.id,
    context: JSON.stringify({
      from: listing.status,
      to: ListingStatus.COMPLETED,
      listing_type: listing.listing_type,
      conversation_id: conversation?.id || null,
    }),
  }).catch(() => {});

  return { ok: true };
}

/**
 * ListingExpired. Consumers: notify the poster, audit log.
 */
export async function onListingExpired(base44: any, opts: { listing: any }) {
  const { listing } = opts;
  await createNotification(base44, {
    recipient_id: listing.poster_id,
    notification_type: NotificationType.LISTING_UPDATE,
    target_type: "listing",
    target_id: listing.id,
  }).catch(() => {});
  await writeAuditLog(base44, {
    action: AuditActionType.LISTING_STATUS_CHANGED,
    actor_type: "system",
    actor_id: null,
    target_type: "listing",
    target_id: listing.id,
    context: JSON.stringify({ from: ListingStatus.ACTIVE, to: ListingStatus.EXPIRED, listing_type: listing.listing_type }),
  }).catch(() => {});
  return { ok: true };
}

/**
 * MarketplaceConversationStarted. Consumers: notify the listing poster.
 */
export async function onMarketplaceConversationStarted(
  base44: any,
  opts: { conversation: any; listing: any; actor_id: string },
) {
  const { conversation, listing, actor_id } = opts;
  // Notify the poster (the initiator is the actor; the poster is the recipient).
  if (listing.poster_id && listing.poster_id !== actor_id) {
    await createNotification(base44, {
      recipient_id: listing.poster_id,
      notification_type: NotificationType.LISTING_UPDATE,
      actor_id,
      target_type: "listing",
      target_id: listing.id,
    }).catch(() => {});
  }
  return { ok: true };
}

/**
 * MarketplaceMessageSent. Consumers: notify the recipient, audit-log is NOT
 * required per message (high volume) — only the notification fires.
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