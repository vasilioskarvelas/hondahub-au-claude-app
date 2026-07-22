/**
 * Honda Hub — Moderation shared module (Phase 05)
 *
 * Mirrors the moderation-related registries from src/lib/registries.js so Deno
 * backend functions can validate against them without importing from src/.
 * Also defines Phase-05-specific enums (case status/priority/severity, appeal
 * status, report target subset) that are owned by this phase.
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
export const REPORT_TARGET_TYPES = Object.freeze([
  "user", "vehicle", "post", "comment", "group", "event", "business", "listing", "marketplace_message",
]);

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
  URGENT: "urgent",
});

// Queue ordering weight — urgent sorts first, then by created_date.
export const PRIORITY_RANK: Record<string, number> = {
  [CASE_PRIORITY.URGENT]: 0,
  [CASE_PRIORITY.HIGH]: 1,
  [CASE_PRIORITY.MEDIUM]: 2,
  [CASE_PRIORITY.LOW]: 3,
};

export const CASE_SEVERITY = Object.freeze({
  MINOR: "minor",
  MODERATE: "moderate",
  SERIOUS: "serious",
  CRITICAL: "critical",
});

export const APPEAL_STATUS = Object.freeze({
  NONE: "none",
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
});

export const REPORT_STATUS = Object.freeze({
  OPEN: "open",
  CONSOLIDATED: "consolidated",
  RESOLVED: "resolved",
  DISMISSED: "dismissed",
});

export function isModeratorOrAdmin(user: any): boolean {
  return user?.role === "admin" || user?.account_tier === "moderator";
}

export function isAdmin(user: any): boolean {
  return user?.role === "admin";
}