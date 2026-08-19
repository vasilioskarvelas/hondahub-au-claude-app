/**
 * Honda Hub — Identity shared module (Phase 01)
 * Registries and helpers shared across identity backend functions.
 * Mirrors src/lib/registries.js — backend functions are Deno and cannot import from src/.
 */

export const AccountTier = {
  GUEST: "guest",
  NEW_MEMBER: "new_member",
  TRUSTED_MEMBER: "trusted_member",
  VERIFIED_MEMBER: "verified_member",
  BUSINESS_VERIFIED: "business_verified",
  MODERATOR: "moderator",
  ADMIN: "admin",
};

export const TrustTierThreshold = {
  [AccountTier.GUEST]: 0,
  [AccountTier.NEW_MEMBER]: 0,
  [AccountTier.TRUSTED_MEMBER]: 25, // PLACEHOLDER
  [AccountTier.VERIFIED_MEMBER]: 60, // PLACEHOLDER
  [AccountTier.BUSINESS_VERIFIED]: 75, // PLACEHOLDER
  [AccountTier.MODERATOR]: null, // role-assigned, not score-derived
  [AccountTier.ADMIN]: null, // role-assigned, not score-derived
};

export const SCORE_DERIVED_TIERS = [
  AccountTier.GUEST,
  AccountTier.NEW_MEMBER,
  AccountTier.TRUSTED_MEMBER,
  AccountTier.VERIFIED_MEMBER,
  AccountTier.BUSINESS_VERIFIED,
];

export const NotificationType = {
  NEW_FOLLOWER: "new_follower",
  NEW_COMMENT: "new_comment",
  NEW_LIKE: "new_like",
  MENTION: "mention",
  BUSINESS_TAG: "business_tag",
  EVENT_REMINDER: "event_reminder",
  MODERATION_OUTCOME: "moderation_outcome",
  REPORT_UPDATE: "report_update",
  TRUST_TIER_CHANGE: "trust_tier_change",
  // Phase 08 additions — registry-controlled growth (open list per §11).
  NEW_MARKETPLACE_MESSAGE: "new_marketplace_message",
  LISTING_UPDATE: "listing_update",
  // Phase 09 addition — Garage TimelineEntryPublished → vehicle followers.
  NEW_VEHICLE_UPDATE: "new_vehicle_update",
};

// Phase 10 — PlanCode & EntitlementKey registries (backend mirror of
// src/lib/registries.js; Deno backend functions cannot import from src/).
// PlanCode: controlled registry for Subscription.plan_code (§27, ADR-031).
// SubscriptionPlan is configuration, not a table.
export const PlanCode = {
  FREE_MEMBER: "free_member",
  PREMIUM_MEMBER: "premium_member",
  FREE_BUSINESS: "free_business",
  VERIFIED_BUSINESS: "verified_business",
  PREMIUM_BUSINESS: "premium_business",
};

// EntitlementKey: controlled registry for entitlement definitions (§28,
// ADR-034). Plan→entitlement mappings live in config (PLAN_ENTITLEMENTS in
// base44/shared/entitlement.ts); only per-subscriber exceptions are persisted
// (EntitlementOverride).
export const EntitlementKey = {
  CREATE_LISTING: "create_listing",
  MAXIMUM_ACTIVE_LISTINGS: "maximum_active_listings",
  CREATE_GROUP: "create_group",
  MAXIMUM_GROUPS: "maximum_groups",
  BUSINESS_PROFILE: "business_profile",
  BUSINESS_ANALYTICS: "business_analytics",
  PROMOTED_LISTING: "promoted_listing",
  ADVANCED_SEARCH: "advanced_search",
  PREMIUM_MEDIA_LIMITS: "premium_media_limits",
  VERIFIED_BUSINESS_BADGE: "verified_business_badge",
  CREATE_AUCTION: "create_auction",
};

export const SignalType = {
  EMAIL_VERIFIED: "email_verified",
  PHONE_VERIFIED: "phone_verified",
  GARAGE_COMPLETED: "garage_completed",
  VEHICLE_VERIFIED: "vehicle_verified",
  QUALITY_POST: "quality_post",
  MARKETPLACE_SUCCESS: "marketplace_success",
  REPORT_RECEIVED: "report_received",
  MODERATOR_ACTION: "moderator_action",
  BUSINESS_VERIFIED: "business_verified",
};

// Signal delta values — placeholder additive system per §2 Architect's summary.
export const SIGNAL_DELTAS = {
  [SignalType.EMAIL_VERIFIED]: 10,
  [SignalType.PHONE_VERIFIED]: 5,
  [SignalType.GARAGE_COMPLETED]: 10,
  [SignalType.VEHICLE_VERIFIED]: 15,
  [SignalType.QUALITY_POST]: 2,
  [SignalType.MARKETPLACE_SUCCESS]: 10,
  [SignalType.REPORT_RECEIVED]: -10,
  [SignalType.MODERATOR_ACTION]: -15,
  [SignalType.BUSINESS_VERIFIED]: 20,
};

const TIER_RANK = {
  [AccountTier.GUEST]: 0,
  [AccountTier.NEW_MEMBER]: 1,
  [AccountTier.TRUSTED_MEMBER]: 2,
  [AccountTier.VERIFIED_MEMBER]: 3,
  [AccountTier.BUSINESS_VERIFIED]: 4,
  [AccountTier.MODERATOR]: 5,
  [AccountTier.ADMIN]: 6,
};

// Compute the tier for a given score using config thresholds (placeholder values).
export function computeTier(score) {
  let tier = AccountTier.NEW_MEMBER;
  for (const t of SCORE_DERIVED_TIERS) {
    const threshold = TrustTierThreshold[t];
    if (threshold !== null && score >= threshold) {
      tier = t;
    }
  }
  return tier;
}

// A tier change is user-notified only on a positive change (Blueprint §11 philosophy).
export function isTierPromotion(oldTier, newTier) {
  return (TIER_RANK[newTier] || 0) > (TIER_RANK[oldTier] || 0);
}

// Handle validation rules (DATABASE_SCHEMA §1).
export const RESERVED_HANDLES = ["admin", "honda", "support", "root", "moderator", "administrator", "help", "hub"];
export function isValidHandle(handle) {
  if (!handle || typeof handle !== "string") return false;
  if (handle.length < 3 || handle.length > 20) return false;
  if (!/^[a-zA-Z0-9_]+$/.test(handle)) return false;
  if (RESERVED_HANDLES.includes(handle.toLowerCase())) return false;
  return true;
}