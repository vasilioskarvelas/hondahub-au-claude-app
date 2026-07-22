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