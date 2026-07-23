/**
 * Honda Hub — EntitlementService shared module (Phase 10, §2)
 *
 * Resolves a subscriber's effective entitlements: an active EntitlementOverride
 * wins, then the active Subscription's plan, then free-plan config. The free
 * plan is the fallback when no active Subscription row exists — ordinary
 * free-tier users NEVER get a Subscription row created (Phase 10 §1 critical
 * design point).
 *
 * PLAN_ENTITLEMENTS is configuration in code, NOT a database table. Only
 * per-subscriber exceptions are persisted (EntitlementOverride).
 *
 * Uses base44.asServiceRole so resolution is callable from any backend
 * function regardless of the originating user's permissions.
 */

import { EntitlementKey, PlanCode } from "./identity.ts";

export const ENTITLEMENT_KEYS: string[] = Object.values(EntitlementKey);

// Numeric (limit) entitlements vs boolean (feature-flag) entitlements.
export const NUMERIC_ENTITLEMENT_KEYS = new Set<string>([
  EntitlementKey.MAXIMUM_ACTIVE_LISTINGS,
  EntitlementKey.MAXIMUM_GROUPS,
]);
export function isNumericEntitlement(key: string): boolean {
  return NUMERIC_ENTITLEMENT_KEYS.has(key);
}
export function isBoolEntitlement(key: string): boolean {
  return !isNumericEntitlement(key);
}

// Free-plan fallback per subscriber type — absence of an active Subscription
// row means free tier (Phase 10 §1).
const FREE_PLAN_BY_SUBSCRIBER: Record<string, string> = {
  user: PlanCode.FREE_MEMBER,
  business: PlanCode.FREE_BUSINESS,
};

/**
 * PLAN_ENTITLEMENTS — plan_code → entitlement_key → value (bool|number).
 * Configuration, NOT a database table. Placeholder values; the only real
 * persisted exception is EntitlementOverride.
 */
export const PLAN_ENTITLEMENTS: Record<string, Record<string, boolean | number>> = {
  [PlanCode.FREE_MEMBER]: {
    [EntitlementKey.CREATE_LISTING]: true,
    [EntitlementKey.MAXIMUM_ACTIVE_LISTINGS]: 5,
    [EntitlementKey.CREATE_GROUP]: false,
    [EntitlementKey.MAXIMUM_GROUPS]: 0,
    [EntitlementKey.BUSINESS_PROFILE]: false,
    [EntitlementKey.BUSINESS_ANALYTICS]: false,
    [EntitlementKey.PROMOTED_LISTING]: false,
    [EntitlementKey.ADVANCED_SEARCH]: false,
    [EntitlementKey.PREMIUM_MEDIA_LIMITS]: false,
    [EntitlementKey.VERIFIED_BUSINESS_BADGE]: false,
  },
  [PlanCode.PREMIUM_MEMBER]: {
    [EntitlementKey.CREATE_LISTING]: true,
    [EntitlementKey.MAXIMUM_ACTIVE_LISTINGS]: 50,
    [EntitlementKey.CREATE_GROUP]: true,
    [EntitlementKey.MAXIMUM_GROUPS]: 5,
    [EntitlementKey.BUSINESS_PROFILE]: false,
    [EntitlementKey.BUSINESS_ANALYTICS]: false,
    [EntitlementKey.PROMOTED_LISTING]: true,
    [EntitlementKey.ADVANCED_SEARCH]: true,
    [EntitlementKey.PREMIUM_MEDIA_LIMITS]: true,
    [EntitlementKey.VERIFIED_BUSINESS_BADGE]: false,
  },
  [PlanCode.FREE_BUSINESS]: {
    [EntitlementKey.CREATE_LISTING]: true,
    [EntitlementKey.MAXIMUM_ACTIVE_LISTINGS]: 10,
    [EntitlementKey.CREATE_GROUP]: false,
    [EntitlementKey.MAXIMUM_GROUPS]: 0,
    [EntitlementKey.BUSINESS_PROFILE]: true,
    [EntitlementKey.BUSINESS_ANALYTICS]: false,
    [EntitlementKey.PROMOTED_LISTING]: false,
    [EntitlementKey.ADVANCED_SEARCH]: false,
    [EntitlementKey.PREMIUM_MEDIA_LIMITS]: false,
    [EntitlementKey.VERIFIED_BUSINESS_BADGE]: false,
  },
  [PlanCode.VERIFIED_BUSINESS]: {
    [EntitlementKey.CREATE_LISTING]: true,
    [EntitlementKey.MAXIMUM_ACTIVE_LISTINGS]: 25,
    [EntitlementKey.CREATE_GROUP]: true,
    [EntitlementKey.MAXIMUM_GROUPS]: 3,
    [EntitlementKey.BUSINESS_PROFILE]: true,
    [EntitlementKey.BUSINESS_ANALYTICS]: false,
    [EntitlementKey.PROMOTED_LISTING]: true,
    [EntitlementKey.ADVANCED_SEARCH]: true,
    [EntitlementKey.PREMIUM_MEDIA_LIMITS]: true,
    [EntitlementKey.VERIFIED_BUSINESS_BADGE]: true,
  },
  [PlanCode.PREMIUM_BUSINESS]: {
    [EntitlementKey.CREATE_LISTING]: true,
    [EntitlementKey.MAXIMUM_ACTIVE_LISTINGS]: 200,
    [EntitlementKey.CREATE_GROUP]: true,
    [EntitlementKey.MAXIMUM_GROUPS]: 20,
    [EntitlementKey.BUSINESS_PROFILE]: true,
    [EntitlementKey.BUSINESS_ANALYTICS]: true,
    [EntitlementKey.PROMOTED_LISTING]: true,
    [EntitlementKey.ADVANCED_SEARCH]: true,
    [EntitlementKey.PREMIUM_MEDIA_LIMITS]: true,
    [EntitlementKey.VERIFIED_BUSINESS_BADGE]: true,
  },
};

// An override is active if it has no expiry, or its expiry is in the future.
function overrideIsActive(o: any, nowMs: number): boolean {
  if (!o.expires_at) return true;
  return new Date(o.expires_at).getTime() > nowMs;
}

/**
 * resolveEffectiveEntitlements — the single resolution path.
 * Returns { plan_code, entitlements, has_active_subscription }.
 * Resolution order per key: active override → plan default → null.
 */
export async function resolveEffectiveEntitlements(
  base44: any,
  subscriber_type: string,
  subscriber_id: string,
): Promise<{
  plan_code: string;
  entitlements: Record<string, boolean | number | null>;
  has_active_subscription: boolean;
}> {
  // 1. Active subscription (most recent). Absence → free plan.
  const subs = await base44.asServiceRole.entities.Subscription.filter(
    { subscriber_type, subscriber_id, status: "active" },
    "-started_at",
    10,
  );
  const activeSub = subs[0];
  const plan_code = (activeSub && activeSub.plan_code) ||
    FREE_PLAN_BY_SUBSCRIBER[subscriber_type] ||
    PlanCode.FREE_MEMBER;

  // 2. Active overrides for this subscriber.
  const overrides = await base44.asServiceRole.entities.EntitlementOverride.filter(
    { subscriber_type, subscriber_id },
    "-created_date",
    100,
  );
  const now = Date.now();
  const overrideMap: Record<string, boolean | number> = {};
  for (const o of overrides) {
    if (!overrideIsActive(o, now)) continue;
    const v = (o.bool_value !== null && o.bool_value !== undefined)
      ? o.bool_value
      : o.numeric_value;
    overrideMap[o.entitlement_key] = v as any;
  }

  // 3. Merge: override wins over plan default.
  const planDefaults = PLAN_ENTITLEMENTS[plan_code] || {};
  const entitlements: Record<string, boolean | number | null> = {};
  for (const key of ENTITLEMENT_KEYS) {
    if (key in overrideMap) {
      entitlements[key] = overrideMap[key];
    } else if (key in planDefaults) {
      entitlements[key] = planDefaults[key];
    } else {
      entitlements[key] = null;
    }
  }
  return { plan_code, entitlements, has_active_subscription: !!activeSub };
}

export async function hasEntitlement(
  base44: any,
  subscriber_type: string,
  subscriber_id: string,
  key: string,
): Promise<boolean> {
  const { entitlements } = await resolveEffectiveEntitlements(base44, subscriber_type, subscriber_id);
  const v = entitlements[key];
  return v === true || (typeof v === "number" && v > 0);
}

export async function getLimit(
  base44: any,
  subscriber_type: string,
  subscriber_id: string,
  key: string,
): Promise<number | null> {
  const { entitlements } = await resolveEffectiveEntitlements(base44, subscriber_type, subscriber_id);
  const v = entitlements[key];
  return typeof v === "number" ? v : null;
}

export class EntitlementLimitError extends Error {
  code: string;
  limit: number | null;
  current_count: number;
  constructor(code: string, limit: number | null, current_count: number) {
    super(code);
    this.code = code;
    this.limit = limit;
    this.current_count = current_count;
  }
}

/**
 * enforceLimit — throws EntitlementLimitError if the numeric entitlement is
 * not granted (limit <= 0) or the current count has reached the limit.
 * Returns { allowed: true, limit } otherwise.
 */
export async function enforceLimit(
  base44: any,
  subscriber_type: string,
  subscriber_id: string,
  key: string,
  current_count: number,
): Promise<{ allowed: true; limit: number }> {
  const limit = await getLimit(base44, subscriber_type, subscriber_id, key);
  if (limit === null || limit === undefined) {
    // Not a numeric entitlement — no numeric limit to enforce; allow.
    return { allowed: true, limit: -1 };
  }
  if (limit <= 0) {
    throw new EntitlementLimitError("ENTITLEMENT_NOT_GRANTED", limit, current_count);
  }
  if (current_count >= limit) {
    throw new EntitlementLimitError("ENTITLEMENT_LIMIT_EXCEEDED", limit, current_count);
  }
  return { allowed: true, limit };
}