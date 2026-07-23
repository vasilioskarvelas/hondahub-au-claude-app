import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import {
  resolveEffectiveEntitlements,
  hasEntitlement,
  getLimit,
  enforceLimit,
  ENTITLEMENT_KEYS,
  isNumericEntitlement,
  EntitlementLimitError,
} from "../../shared/entitlement.ts";

/**
 * EntitlementService (Phase 10, §2) — scaffolding only, no live billing.
 *
 * Actions:
 *  - resolveEffectiveEntitlements  (self or Admin)
 *  - hasEntitlement                 (self or Admin)
 *  - getLimit                       (self or Admin)
 *  - enforceLimit                   (self or Admin)
 *  - override.create                (Admin only)
 *  - override.list                  (Admin only)
 *  - override.remove                (Admin only)
 *
 * No path creates a Subscription row — ordinary free-tier users resolve to the
 * free plan by absence (Phase 10 §1). No checkout/payment/refund logic exists.
 */

const SUBSCRIBER_TYPES = ["user", "business"];

function subscriberCanAccess(
  user: any,
  subscriber_type: string,
  subscriber_id: string,
): boolean {
  if (user.role === "admin") return true;
  if (subscriber_type === "user" && subscriber_id === user.id) return true;
  // business resolution is Admin-only in scaffolding (membership check deferred).
  return false;
}

function fail(code: string, status: number, details?: any): Response {
  return Response.json(
    { ok: false, error: { code, ...(details ? { details } : {}) } },
    { status },
  );
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return fail("AUTH_REQUIRED", 401);
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // ---- resolveEffectiveEntitlements ----
    if (action === "resolveEffectiveEntitlements") {
      const { subscriber_type, subscriber_id } = body;
      if (!SUBSCRIBER_TYPES.includes(subscriber_type) || !subscriber_id) {
        return fail("VALIDATION_FAILED", 422, { subscriber: "invalid" });
      }
      if (!subscriberCanAccess(user, subscriber_type, subscriber_id)) return fail("PERMISSION_DENIED", 403);
      const result = await resolveEffectiveEntitlements(base44, subscriber_type, subscriber_id);
      return Response.json({ ok: true, ...result });
    }

    // ---- hasEntitlement ----
    if (action === "hasEntitlement") {
      const { subscriber_type, subscriber_id, key } = body;
      if (!subscriberCanAccess(user, subscriber_type, subscriber_id)) return fail("PERMISSION_DENIED", 403);
      if (!ENTITLEMENT_KEYS.includes(key)) return fail("VALIDATION_FAILED", 422, { key: "invalid" });
      const granted = await hasEntitlement(base44, subscriber_type, subscriber_id, key);
      return Response.json({ ok: true, granted });
    }

    // ---- getLimit ----
    if (action === "getLimit") {
      const { subscriber_type, subscriber_id, key } = body;
      if (!subscriberCanAccess(user, subscriber_type, subscriber_id)) return fail("PERMISSION_DENIED", 403);
      if (!ENTITLEMENT_KEYS.includes(key)) return fail("VALIDATION_FAILED", 422, { key: "invalid" });
      const limit = await getLimit(base44, subscriber_type, subscriber_id, key);
      return Response.json({ ok: true, limit });
    }

    // ---- enforceLimit ----
    if (action === "enforceLimit") {
      const { subscriber_type, subscriber_id, key, current_count } = body;
      if (!subscriberCanAccess(user, subscriber_type, subscriber_id)) return fail("PERMISSION_DENIED", 403);
      if (!ENTITLEMENT_KEYS.includes(key)) return fail("VALIDATION_FAILED", 422, { key: "invalid" });
      try {
        const result = await enforceLimit(base44, subscriber_type, subscriber_id, key, Number(current_count) || 0);
        return Response.json({ ok: true, ...result });
      } catch (e) {
        if (e instanceof EntitlementLimitError) {
          return Response.json(
            { ok: false, error: { code: e.code, limit: e.limit, current_count: e.current_count } },
            { status: 403 },
          );
        }
        throw e;
      }
    }

    // ---- override.create (Admin only) ----
    if (action === "override.create") {
      if (user.role !== "admin") return fail("PERMISSION_DENIED", 403);
      const { subscriber_type, subscriber_id, entitlement_key, reason, expires_at } = body;
      if (!SUBSCRIBER_TYPES.includes(subscriber_type)) return fail("VALIDATION_FAILED", 422, { subscriber_type: "invalid" });
      if (!subscriber_id) return fail("VALIDATION_FAILED", 422, { subscriber_id: "required" });
      if (!ENTITLEMENT_KEYS.includes(entitlement_key)) return fail("VALIDATION_FAILED", 422, { entitlement_key: "invalid" });
      if (!reason || !String(reason).trim()) return fail("VALIDATION_FAILED", 422, { reason: "required" });

      // Exactly one of bool_value/numeric_value, matching the entitlement type.
      let bool_value: boolean | null = null;
      let numeric_value: number | null = null;
      if (isNumericEntitlement(entitlement_key)) {
        if (typeof body.numeric_value !== "number" || body.numeric_value < 0) {
          return fail("VALIDATION_FAILED", 422, { numeric_value: "non-negative number required for this entitlement" });
        }
        numeric_value = body.numeric_value;
      } else {
        if (typeof body.bool_value !== "boolean") {
          return fail("VALIDATION_FAILED", 422, { bool_value: "boolean required for this entitlement" });
        }
        bool_value = body.bool_value;
      }

      const created = await base44.entities.EntitlementOverride.create({
        subscriber_type,
        subscriber_id,
        entitlement_key,
        bool_value,
        numeric_value,
        reason: String(reason).trim(),
        expires_at: expires_at || null,
      });
      return Response.json({ ok: true, override: created });
    }

    // ---- override.list (Admin only) ----
    if (action === "override.list") {
      if (user.role !== "admin") return fail("PERMISSION_DENIED", 403);
      const overrides = await base44.asServiceRole.entities.EntitlementOverride.list("-created_date", 200);
      return Response.json({ ok: true, overrides });
    }

    // ---- override.remove (Admin only) ----
    if (action === "override.remove") {
      if (user.role !== "admin") return fail("PERMISSION_DENIED", 403);
      const { override_id } = body;
      if (!override_id) return fail("VALIDATION_FAILED", 422, { override_id: "required" });
      await base44.entities.EntitlementOverride.delete(override_id);
      return Response.json({ ok: true });
    }

    return fail("VALIDATION_FAILED", 422, { action: "unknown" });
  } catch (error) {
    return Response.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: error.message } },
      { status: 500 },
    );
  }
});