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

// ---- ADR-045: Additional Specifications (bounded, display-only) ----

export const ADDITIONAL_SPEC_MAX_ENTRIES = 10;
export const SPEC_LABEL_MAX = 40;
export const SPEC_VALUE_MAX = 100;

/**
 * ADR-045 §1 — validates the bounded, display-only additional_specifications
 * list. Returns { ok, fields } where fields is the cleaned array (or undefined
 * when the key was not submitted). Empty entries (both label and value blank)
 * are silently dropped; an entry with one populated and the other empty is a
 * hard VALIDATION_FAILED rejection. Never searchable / filterable.
 */
export function validateAdditionalSpecifications(payload: any): { ok: true; fields: any[] | undefined } | { ok: false; error: { code: string; field: string; message: string } } {
  if (payload.additional_specifications === undefined) return { ok: true, fields: undefined };
  const raw = payload.additional_specifications;
  if (raw === null) return { ok: true, fields: [] };
  if (!Array.isArray(raw)) return { ok: false, error: { code: "VALIDATION_FAILED", field: "additional_specifications", message: "must be an array" } };
  if (raw.length > ADDITIONAL_SPEC_MAX_ENTRIES) return { ok: false, error: { code: "VALIDATION_FAILED", field: "additional_specifications", message: `max ${ADDITIONAL_SPEC_MAX_ENTRIES} entries` } };
  const cleaned: any[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") return { ok: false, error: { code: "VALIDATION_FAILED", field: "additional_specifications", message: "invalid entry" } };
    const label = (e.label ?? "").toString().trim();
    const value = (e.value ?? "").toString().trim();
    if (!label && !value) continue;
    if (!label || !value) return { ok: false, error: { code: "VALIDATION_FAILED", field: "additional_specifications", message: "label and value are both required" } };
    if (label.length > SPEC_LABEL_MAX) return { ok: false, error: { code: "VALIDATION_FAILED", field: "additional_specifications", message: `label max ${SPEC_LABEL_MAX} chars` } };
    if (value.length > SPEC_VALUE_MAX) return { ok: false, error: { code: "VALIDATION_FAILED", field: "additional_specifications", message: `value max ${SPEC_VALUE_MAX} chars` } };
    cleaned.push({ label, value });
  }
  return { ok: true, fields: cleaned };
}

function hasNonEmptyArray(a: any): boolean { return Array.isArray(a) && a.length > 0; }

/**
 * ADR-045 §2 — Listing Quality Score, computed at read time (never stored).
 * Returns { score (0–100), checklist (ordered { key, label, ok }) }.
 * For vehicle listings the Compatibility component is omitted and the score is
 * scaled from the remaining 80 points. Compatibility is satisfied by an active
 * seller selection — the ADR-043 plural arrays if present, else the ADR-042
 * singular compatible_model/compatible_chassis_code (the defaulting
 * compatible_make="Honda" does not represent an active choice).
 */
export function computeListingQualityScore(listing: any): { score: number; checklist: { key: string; label: string; ok: boolean }[] } {
  const photos = Array.isArray(listing.photo_urls) ? listing.photo_urls.length : 0;
  const photosPoints = photos >= 8 ? 40 : photos >= 4 ? 30 : photos >= 2 ? 20 : photos >= 1 ? 10 : 0;
  const descLen = (listing.description || "").length;
  const descPoints = descLen >= 150 ? 20 : descLen >= 50 ? 10 : 0;
  const hasVideo = hasNonEmptyArray(listing.video_urls);
  const videoPoints = hasVideo ? 20 : 0;
  const isVehicle = listing.category === ListingCategory.VEHICLE;
  const photoOk = photosPoints === 40;
  const descOk = descPoints === 20;
  const videoOk = videoPoints === 20;
  if (isVehicle) {
    const score = Math.round(((photosPoints + descPoints + videoPoints) / 80) * 100);
    return { score, checklist: [
      { key: "photos", label: "8 or more photos", ok: photoOk },
      { key: "description", label: "Detailed description (150+ characters)", ok: descOk },
      { key: "video", label: "Video added", ok: videoOk },
    ] };
  }
  const compatActive =
    hasNonEmptyArray(listing.compatible_models) ||
    hasNonEmptyArray(listing.compatible_chassis_codes) ||
    hasNonEmptyArray(listing.compatible_engine_families);
  const compatPoints = compatActive ? 20 : 0;
  const score = photosPoints + descPoints + compatPoints + videoPoints;
  return { score, checklist: [
    { key: "photos", label: "8 or more photos", ok: photoOk },
    { key: "compatibility", label: "Compatibility selected", ok: compatPoints === 20 },
    { key: "description", label: "Detailed description (150+ characters)", ok: descOk },
    { key: "video", label: "Video added", ok: videoOk },
  ] };
}

// ---- ADR-042 category attributes (exhaustive) ----
// Generic group applies to every category except vehicle. The three specific
// groups (wheels, drivetrain, electronics) apply only to their named category.
// Every field here is nullable/optional unless a required-when rule states
// otherwise. A field submitted for a category it does not apply to is a hard
// CATEGORY_FIELD_MISMATCH rejection (Section 4), never silently nulled.

export const OemOrAftermarket = Object.freeze({ OEM: "oem", AFTERMARKET: "aftermarket", NOT_APPLICABLE: "not_applicable" });
export const OEM_OR_AFTERMARKET_VALUES = Object.values(OemOrAftermarket);

// ADR-043 — Bounded enum arrays for compatibility matching.
export const COMPATIBLE_MODEL_VALUES = ["civic", "integra", "accord", "crv", "s2000", "nsx", "other"];
export const COMPATIBLE_CHASSIS_CODE_VALUES = ["eg", "ek", "dc2", "dc5", "ep3", "fn2", "cl7", "cl9", "fd2", "fk8", "fl5", "other"];
export const COMPATIBLE_ENGINE_FAMILY_VALUES = ["d_series", "b_series", "k_series", "j_series", "f_series", "h_series", "other"];
export const COMPATIBILITY_FIELDS = ["compatible_models", "compatible_chassis_codes", "compatible_engine_families"];

/**
 * ADR-043 — Validates the three bounded-enum compatibility arrays.
 * For vehicle listings, any non-empty submitted value is rejected with
 * CATEGORY_FIELD_MISMATCH (per ADR-042's established pattern).
 * Returns { ok, fields } where fields contains the cleaned, deduplicated arrays.
 */
export function validateCompatibilityFields(category: string, payload: any): { ok: true; fields: any } | { ok: false; error: { code: string; field: string; message: string } } {
  const fields: any = {};
  const isVehicle = category === ListingCategory.VEHICLE;
  const configs = [
    { key: "compatible_models", allowed: COMPATIBLE_MODEL_VALUES },
    { key: "compatible_chassis_codes", allowed: COMPATIBLE_CHASSIS_CODE_VALUES },
    { key: "compatible_engine_families", allowed: COMPATIBLE_ENGINE_FAMILY_VALUES },
  ];
  for (const { key, allowed } of configs) {
    if (payload[key] === undefined) continue;
    if (isVehicle) {
      if (payload[key] !== null && (!Array.isArray(payload[key]) || payload[key].length > 0)) {
        return { ok: false, error: { code: "CATEGORY_FIELD_MISMATCH", field: key, message: "Compatibility fields do not apply to vehicle listings." } };
      }
      fields[key] = [];
      continue;
    }
    if (payload[key] === null) { fields[key] = []; continue; }
    if (!Array.isArray(payload[key])) return { ok: false, error: { code: "VALIDATION_FAILED", field: key, message: "must be an array" } };
    const cleaned: string[] = [];
    for (const v of payload[key]) {
      if (!allowed.includes(v)) return { ok: false, error: { code: "VALIDATION_FAILED", field: key, message: `invalid value: ${v}` } };
      if (!cleaned.includes(v)) cleaned.push(v);
    }
    fields[key] = cleaned;
  }
  return { ok: true, fields };
}
export const TestedBeforeListing = Object.freeze({
  COMPRESSION_TESTED: "compression_tested",
  LEAK_DOWN_TESTED: "leak_down_tested",
  RUNNING_WHEN_REMOVED: "running_when_removed",
  UNTESTED: "untested",
});
export const TESTED_BEFORE_LISTING_VALUES = Object.values(TestedBeforeListing);
export const LockStatus = Object.freeze({ LOCKED: "locked", UNLOCKED: "unlocked", NOT_APPLICABLE: "not_applicable" });
export const LOCK_STATUS_VALUES = Object.values(LockStatus);

const BRAND_MAX = 100;
const DRIVETRAIN_CATEGORIES = [ListingCategory.ENGINE, ListingCategory.TRANSMISSION, ListingCategory.FORCED_INDUCTION];
const OEM_REQUIRED_CATEGORIES = [
  ListingCategory.ENGINE, ListingCategory.TRANSMISSION, ListingCategory.FORCED_INDUCTION,
  ListingCategory.WHEELS_TYRES, ListingCategory.SUSPENSION, ListingCategory.BRAKES,
  ListingCategory.ELECTRONICS, ListingCategory.PERFORMANCE_PART,
];
const GENERIC_ATTR_FIELDS = ["brand", "oem_or_aftermarket", "shipping_available", "pickup_available", "shipping_cost_cents"];
const WHEELS_FIELDS = ["wheel_diameter_inches", "wheel_width_inches", "wheel_offset_mm", "wheel_pcd", "wheel_quantity", "tyres_included", "tyre_tread_percentage"];
const DRIVETRAIN_FIELDS = ["component_kilometres", "tested_before_listing", "warranty_included"];
const ELECTRONICS_FIELDS = ["lock_status", "tuned"];
export const CATEGORY_ATTR_FIELDS = Object.freeze([...GENERIC_ATTR_FIELDS, ...WHEELS_FIELDS, ...DRIVETRAIN_FIELDS, ...ELECTRONICS_FIELDS]);

/** Fields that may be non-null for a given category (union of applicable groups). */
export function applicableCategoryFields(category: string): Set<string> {
  const s = new Set<string>();
  if (category === ListingCategory.VEHICLE) return s;
  GENERIC_ATTR_FIELDS.forEach((f) => s.add(f));
  if (category === ListingCategory.WHEELS_TYRES) WHEELS_FIELDS.forEach((f) => s.add(f));
  if (DRIVETRAIN_CATEGORIES.includes(category)) DRIVETRAIN_FIELDS.forEach((f) => s.add(f));
  if (category === ListingCategory.ELECTRONICS) ELECTRONICS_FIELDS.forEach((f) => s.add(f));
  return s;
}

/**
 * Validates ADR-042 category attributes against the listing's final category.
 * Returns { ok: true, fields } with only the applicable, validated values to
 * merge into the create/update payload, or { ok: false, error } where error is
 * { code, field, message }. `existing` carries the prior listing row (empty on
 * create) so cross-field rules resolve against the effective value.
 */
export function validateCategoryAttributes(category: string, payload: any, existing: any = {}): { ok: true; fields: any } | { ok: false; error: { code: string; field: string; message: string } } {
  const allowed = applicableCategoryFields(category);
  const fields: any = {};

  // 1. Section 4 hard rule — reject any submitted category-specific field that
  //    does not apply to the listing's category.
  for (const key of CATEGORY_ATTR_FIELDS) {
    if (payload[key] !== undefined && !allowed.has(key)) {
      return { ok: false, error: { code: "CATEGORY_FIELD_MISMATCH", field: key, message: "This field doesn't apply to the selected category." } };
    }
  }
  if (category === ListingCategory.VEHICLE) return { ok: true, fields };

  // 2. Generic fields (apply to every non-vehicle category).
  if (payload.brand !== undefined) {
    const b = (payload.brand || "").trim();
    if (b.length > BRAND_MAX) return { ok: false, error: { code: "VALIDATION_FAILED", field: "brand", message: `max ${BRAND_MAX} chars` } };
    fields.brand = b || null;
  }
  if (OEM_REQUIRED_CATEGORIES.includes(category)) {
    const finalOem = payload.oem_or_aftermarket !== undefined ? payload.oem_or_aftermarket : existing.oem_or_aftermarket;
    if (finalOem === null || finalOem === undefined || finalOem === "" || !OEM_OR_AFTERMARKET_VALUES.includes(finalOem)) {
      return { ok: false, error: { code: "VALIDATION_FAILED", field: "oem_or_aftermarket", message: "required for this category" } };
    }
    if (payload.oem_or_aftermarket !== undefined) fields.oem_or_aftermarket = payload.oem_or_aftermarket;
  } else if (payload.oem_or_aftermarket !== undefined) {
    const v = payload.oem_or_aftermarket;
    if (v === null || v === "") fields.oem_or_aftermarket = null;
    else if (OEM_OR_AFTERMARKET_VALUES.includes(v)) fields.oem_or_aftermarket = v;
    else return { ok: false, error: { code: "VALIDATION_FAILED", field: "oem_or_aftermarket", message: "invalid" } };
  }
  if (payload.shipping_available !== undefined) fields.shipping_available = !!payload.shipping_available;
  if (payload.pickup_available !== undefined) fields.pickup_available = !!payload.pickup_available;
  const effShipping = payload.shipping_available !== undefined ? !!payload.shipping_available : !!existing.shipping_available;
  if (payload.shipping_cost_cents !== undefined) {
    if (payload.shipping_cost_cents === null) {
      if (effShipping) return { ok: false, error: { code: "VALIDATION_FAILED", field: "shipping_cost_cents", message: "required when shipping_available is true" } };
      fields.shipping_cost_cents = null;
    } else {
      const sc = Number(payload.shipping_cost_cents);
      if (!Number.isInteger(sc) || sc < 0) return { ok: false, error: { code: "VALIDATION_FAILED", field: "shipping_cost_cents", message: "non-negative integer (cents)" } };
      if (!effShipping) return { ok: false, error: { code: "VALIDATION_FAILED", field: "shipping_cost_cents", message: "must be null when shipping_available is false" } };
      fields.shipping_cost_cents = sc;
    }
  }

  // 3. Wheels & tyres group.
  if (category === ListingCategory.WHEELS_TYRES) {
    if (payload.wheel_diameter_inches !== undefined) {
      if (payload.wheel_diameter_inches === null) fields.wheel_diameter_inches = null;
      else { const n = Number(payload.wheel_diameter_inches); if (!Number.isInteger(n) || n < 10 || n > 24) return { ok: false, error: { code: "VALIDATION_FAILED", field: "wheel_diameter_inches", message: "10–24" } }; fields.wheel_diameter_inches = n; }
    }
    if (payload.wheel_width_inches !== undefined) {
      if (payload.wheel_width_inches === null) fields.wheel_width_inches = null;
      else { const n = Number(payload.wheel_width_inches); if (Number.isNaN(n) || n < 3 || n > 15) return { ok: false, error: { code: "VALIDATION_FAILED", field: "wheel_width_inches", message: "3.0–15.0" } }; fields.wheel_width_inches = n; }
    }
    if (payload.wheel_offset_mm !== undefined) {
      if (payload.wheel_offset_mm === null) fields.wheel_offset_mm = null;
      else { const n = Number(payload.wheel_offset_mm); if (!Number.isInteger(n) || n < -50 || n > 80) return { ok: false, error: { code: "VALIDATION_FAILED", field: "wheel_offset_mm", message: "-50 to 80" } }; fields.wheel_offset_mm = n; }
    }
    if (payload.wheel_pcd !== undefined) fields.wheel_pcd = (payload.wheel_pcd || "").trim() || null;
    if (payload.wheel_quantity !== undefined) {
      if (payload.wheel_quantity === null) fields.wheel_quantity = null;
      else { const n = Number(payload.wheel_quantity); if (!Number.isInteger(n) || n < 1 || n > 5) return { ok: false, error: { code: "VALIDATION_FAILED", field: "wheel_quantity", message: "1–5" } }; fields.wheel_quantity = n; }
    }
    if (payload.tyres_included !== undefined) fields.tyres_included = !!payload.tyres_included;
    const effTyres = payload.tyres_included !== undefined ? !!payload.tyres_included : !!existing.tyres_included;
    if (payload.tyre_tread_percentage !== undefined) {
      if (payload.tyre_tread_percentage === null) {
        if (effTyres) return { ok: false, error: { code: "VALIDATION_FAILED", field: "tyre_tread_percentage", message: "required when tyres_included is true" } };
        fields.tyre_tread_percentage = null;
      } else {
        const n = Number(payload.tyre_tread_percentage);
        if (!Number.isInteger(n) || n < 0 || n > 100) return { ok: false, error: { code: "VALIDATION_FAILED", field: "tyre_tread_percentage", message: "0–100" } };
        if (!effTyres) return { ok: false, error: { code: "VALIDATION_FAILED", field: "tyre_tread_percentage", message: "must be null when tyres_included is false" } };
        fields.tyre_tread_percentage = n;
      }
    }
  }

  // 4. Drivetrain group.
  if (DRIVETRAIN_CATEGORIES.includes(category)) {
    if (payload.component_kilometres !== undefined) {
      if (payload.component_kilometres === null) fields.component_kilometres = null;
      else { const n = Number(payload.component_kilometres); if (!Number.isInteger(n) || n < 0) return { ok: false, error: { code: "VALIDATION_FAILED", field: "component_kilometres", message: "non-negative integer" } }; fields.component_kilometres = n; }
    }
    if (payload.tested_before_listing !== undefined) {
      const v = payload.tested_before_listing;
      if (v === null || v === "") fields.tested_before_listing = null;
      else if (TESTED_BEFORE_LISTING_VALUES.includes(v)) fields.tested_before_listing = v;
      else return { ok: false, error: { code: "VALIDATION_FAILED", field: "tested_before_listing", message: "invalid" } };
    }
    if (payload.warranty_included !== undefined) fields.warranty_included = !!payload.warranty_included;
  }

  // 5. Electronics group.
  if (category === ListingCategory.ELECTRONICS) {
    if (payload.lock_status !== undefined) {
      const v = payload.lock_status;
      if (v === null || v === "") fields.lock_status = null;
      else if (LOCK_STATUS_VALUES.includes(v)) fields.lock_status = v;
      else return { ok: false, error: { code: "VALIDATION_FAILED", field: "lock_status", message: "invalid" } };
    }
    if (payload.tuned !== undefined) fields.tuned = !!payload.tuned;
  }

  return { ok: true, fields };
}

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