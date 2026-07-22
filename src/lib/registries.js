/**
 * Honda Hub — Controlled Configuration Registries (Phase 00)
 *
 * Single source of truth for every validated string constant used across the
 * platform. Every polymorphic type, notification type, audit action, moderation
 * action, plan code, entitlement key, and trust-tier threshold is defined here
 * and referenced by name elsewhere — never as an arbitrary free-text string.
 *
 * Source of truth: 01_ARCHITECTURE/DATABASE_SCHEMA.md, PLATFORM_CONVENTIONS.md,
 * and the ADRs that established each registry (ADR-011 Media, ADR-015
 * ReferenceTypes, ADR-031 PlanCode, ADR-034 EntitlementKey, etc.).
 *
 * These are versioned code constants — NOT database tables. Adding a new value
 * to any registry is a code change reviewed like any other; it is never a
 * database migration and never an arbitrary user-supplied string accepted at
 * runtime. Every service/backend function that persists one of these values
 * validates it against the relevant export below before writing.
 *
 * Phase 00 status: registries exist and are referenced by name. No consumer
 * is wired yet — consumption begins in Phase 01 (Identity) and later phases.
 */

/**
 * ReferenceTypes — the platform-wide registry of every entity type a
 * polymorphic (type, id) reference can point at (ADR-015). Each polymorphic
 * field declares its own allow-list SUBSET of this registry; ReferenceResolverService
 * enforces that allow-list at write time.
 */
export const ReferenceTypes = Object.freeze({
  USER: "user",
  VEHICLE: "vehicle",
  POST: "post",
  COMMENT: "comment",
  GROUP: "group",
  EVENT: "event",
  BUSINESS: "business",
  LISTING: "listing",
  REPORT: "report",
  MODERATION_CASE: "moderation_case",
  MARKETPLACE_MESSAGE: "marketplace_message",
  BUSINESS_REVIEW: "business_review",
});

/**
 * NotificationType — controlled registry for Notification.notification_type
 * (DATABASE_SCHEMA §11). Open to registry-controlled growth: every value used
 * must be added here first, never accepted as an arbitrary string.
 */
export const NotificationType = Object.freeze({
  NEW_FOLLOWER: "new_follower",
  NEW_COMMENT: "new_comment",
  NEW_LIKE: "new_like",
  MENTION: "mention",
  BUSINESS_TAG: "business_tag",
  EVENT_REMINDER: "event_reminder",
  MODERATION_OUTCOME: "moderation_outcome",
  REPORT_UPDATE: "report_update",
  TRUST_TIER_CHANGE: "trust_tier_change",
});

/**
 * AuditActionType — controlled registry for AuditLog.action (§25). An open,
 * registry-controlled list: start with the values below and add new values
 * only as later phases require them. Never a free-text string.
 */
export const AuditActionType = Object.freeze({
  VEHICLE_VERIFICATION_APPROVED: "vehicle_verification_approved",
  BUSINESS_STATUS_CHANGED: "business_status_changed",
  LISTING_REMOVED_BY_MODERATION: "listing_removed_by_moderation",
  TRUST_TIER_OVERRIDDEN: "trust_tier_overridden",
  FINANCIAL_CHANGE_APPROVED: "financial_change_approved",
});

/**
 * ModerationActionType — controlled registry for ModerationAction.action_type
 * (§24). `content_restored` was added when BusinessReview moderation was
 * designed, to represent moderator/appeal-driven restoration explicitly
 * rather than overloading `no_action`.
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

/**
 * PlanCode — controlled registry for Subscription.plan_code (§27, ADR-031).
 * Placeholder identities ONLY — no price, billing interval, or feature-set
 * data is attached to any of these at MVP. SubscriptionPlan is deliberately
 * configuration, not a database entity, until a real plan/provider exists.
 */
export const PlanCode = Object.freeze({
  FREE_MEMBER: "free_member",
  PREMIUM_MEMBER: "premium_member",
  FREE_BUSINESS: "free_business",
  VERIFIED_BUSINESS: "verified_business",
  PREMIUM_BUSINESS: "premium_business",
});

/**
 * EntitlementKey — controlled registry for entitlement definitions (§28,
 * ADR-034). Definitions and plan-to-entitlement mappings live in config
 * (PLAN_ENTITLEMENTS, not yet built); only per-subscriber exceptions are
 * persisted (EntitlementOverride, built in Phase 10).
 */
export const EntitlementKey = Object.freeze({
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
});

/**
 * AccountTier — the locked platform-wide tier enum (Blueprint §10,
 * DATABASE_SCHEMA §1/§2, ADR-040). TrustScore.current_tier and
 * User.account_tier both use these values; TrustScore is the source of truth
 * and User is the read cache. Moderator and Admin are role-assigned, not
 * score-derived, but are listed here for completeness per the Phase 00 spec.
 */
export const AccountTier = Object.freeze({
  GUEST: "guest",
  NEW_MEMBER: "new_member",
  TRUSTED_MEMBER: "trusted_member",
  VERIFIED_MEMBER: "verified_member",
  BUSINESS_VERIFIED: "business_verified",
  MODERATOR: "moderator",
  ADMIN: "admin",
});

/**
 * TrustTierThreshold — configurable score thresholds mapping a TrustScore
 * numeric value to an AccountTier (§2). Thresholds live in configuration, not
 * hardcoded in application logic, so tuning is a config change, not a deploy.
 *
 * ⚠ PLACEHOLDER VALUES — NOT FINAL. These are seed values to make the
 * registry referenceable in Phase 00; real thresholds are a product/business
 * decision to finalize before Phase 01 can be meaningfully tested. Flagged
 * explicitly as placeholder per the Phase 00 build spec. The scoring scale
 * itself (0–100 additive points) is also a placeholder pending the simple
 * additive system recommended in §2's Architect's summary.
 *
 * Moderator and Admin carry no threshold — they are assigned roles, not
 * score-derived tiers; null here makes that explicit.
 */
export const TrustTierThreshold = Object.freeze({
  [AccountTier.GUEST]: 0,
  [AccountTier.NEW_MEMBER]: 0,
  [AccountTier.TRUSTED_MEMBER]: 25, // PLACEHOLDER
  [AccountTier.VERIFIED_MEMBER]: 60, // PLACEHOLDER
  [AccountTier.BUSINESS_VERIFIED]: 75, // PLACEHOLDER
  [AccountTier.MODERATOR]: null, // role-assigned, not score-derived
  [AccountTier.ADMIN]: null, // role-assigned, not score-derived
});

/**
 * Convenience: the ordered list of score-derived tiers (excludes role-assigned
 * Moderator/Admin) for TrustScoreService.recalculateTier().
 */
export const SCORE_DERIVED_TIERS = Object.freeze([
  AccountTier.GUEST,
  AccountTier.NEW_MEMBER,
  AccountTier.TRUSTED_MEMBER,
  AccountTier.VERIFIED_MEMBER,
  AccountTier.BUSINESS_VERIFIED,
]);

/**
 * Registry index — a map of registry name -> frozen constant, so a consumer
 * can reference "which registry does this value belong to" programmatically
 * and so a future admin/validation tool can iterate every registry in one
 * place. Phase 00: referenced by name in at least this stub.
 */
export const REGISTRIES = Object.freeze({
  ReferenceTypes,
  NotificationType,
  AuditActionType,
  ModerationActionType,
  PlanCode,
  EntitlementKey,
  AccountTier,
  TrustTierThreshold,
});