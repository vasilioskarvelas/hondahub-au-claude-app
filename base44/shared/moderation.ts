/**
 * Honda Hub — Moderation shared module (Phase 05)
 *
 * Mirrors the moderation-related registries from src/lib/registries.js so Deno
 * backend functions can validate against them without importing from src/.
 * Also defines Phase-05-specific enums (case status/priority/severity, appeal
 * status, report category, actor type, report target subset) owned by this
 * phase. All values match the locked Phase 05 Architecture Pack exactly.
 */

export const ModerationActionType = Object.freeze({
  WARNING: "warning",
  CONTENT_REMOVED: "content_removed",
  LISTING_REMOVED: "listing_removed",
  ACCOUNT_RESTRICTED: "account_restricted",
  ACCOUNT_SUSPENDED: "account_suspended",
  ACCOUNT_BANNED: "account_banned",
  NO_ACTION: "no_action",
  CONTENT_RESTORED: "content_restored",
  OTHER: "other",
});

export const AuditActionType = Object.freeze({
  VEHICLE_VERIFICATION_APPROVED: "vehicle_verification_approved",
  BUSINESS_STATUS_CHANGED: "business_status_changed",
  LISTING_REMOVED_BY_MODERATION: "listing_removed_by_moderation",
  TRUST_TIER_OVERRIDDEN: "trust_tier_overridden",
  FINANCIAL_CHANGE_APPROVED: "financial_change_approved",
});

// Report target subset of ReferenceTypes (DATABASE_SCHEMA §22).
// REPORT and MODERATION_CASE are intentionally excluded — they are not reportable.
export const REPORT_TARGET_TYPES = Object.freeze([
  "user", "vehicle", "post", "comment", "group", "event", "business", "listing", "marketplace_message",
]);

// Fixed report category enum (§2.1).
export const REPORT_CATEGORY = Object.freeze({
  SPAM: "spam",
  SCAM: "scam",
  HARASSMENT: "harassment",
  HATE_SPEECH: "hate_speech",
  ILLEGAL: "illegal",
  COPYRIGHT: "copyright",
  FAKE_LISTING: "fake_listing",
  DANGEROUS_BEHAVIOUR: "dangerous_behaviour",
  OTHER: "other",
});
export const REPORT_CATEGORY_VALUES = Object.values(REPORT_CATEGORY);

export const CASE_STATUS = Object.freeze({
  OPEN: "open",
  ASSIGNED: "assigned",
  IN_REVIEW: "in_review",
  RESOLVED_UPHELD: "resolved_upheld",
  RESOLVED_DISMISSED: "resolved_dismissed",
  ESCALATED: "escalated",
});

export const CASE_PRIORITY = Object.freeze({
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
});

// Queue ordering weight — critical sorts first, then by created_date ASC.
export const PRIORITY_RANK: Record<string, number> = {
  [CASE_PRIORITY.CRITICAL]: 0,
  [CASE_PRIORITY.HIGH]: 1,
  [CASE_PRIORITY.MEDIUM]: 2,
  [CASE_PRIORITY.LOW]: 3,
};

export const CASE_SEVERITY = Object.freeze({
  MINOR: "minor",
  MODERATE: "moderate",
  SEVERE: "severe",
});

export const APPEAL_STATUS = Object.freeze({
  NONE: "none",
  REQUESTED: "requested",
  UNDER_REVIEW: "under_review",
  UPHELD: "upheld",
  OVERTURNED: "overturned",
});

export const REPORT_STATUS = Object.freeze({
  OPEN: "open",
  CONSOLIDATED: "consolidated",
  RESOLVED: "resolved",
  DISMISSED: "dismissed",
});

// AuditLog.actor_type values (§2.5).
export const ACTOR_TYPE = Object.freeze({
  USER: "user",
  MODERATOR: "moderator",
  ADMIN: "admin",
  SYSTEM: "system",
});

export function isModeratorOrAdmin(user: any): boolean {
  return user?.role === "admin" || user?.account_tier === "moderator";
}

export function isAdmin(user: any): boolean {
  return user?.role === "admin";
}

// Build the `actor` string for a ModerationAction row (system | moderator:<id> | admin:<id>).
export function actorString(user: any): string {
  if (!user) return ACTOR_TYPE.SYSTEM;
  return isAdmin(user) ? `admin:${user.id}` : `moderator:${user.id}`;
}