/**
 * Honda Hub — Business Store Import shared module (ADR-046 Phase 1).
 *
 * Registries + the Phase 1 feature-flag gate, shared by StoreConnectorService
 * and the admin UI. Phase 1 is ADMIN-ONLY: the feature flag is
 * `requireStoreImportAdmin` — frontend nav hiding is supplemental only and
 * never the security boundary.
 *
 * Sync state lives on BusinessStoreConnection (Decision 2); JobStatus stays the
 * append-only terminal execution log. The import creation path (Section 8)
 * derives the poster server-side from BusinessStoreConnection → Business →
 * active owner BusinessMembership — never from the request body (Decision 1).
 */
import { err } from "./http.ts";

export const StorePlatform = Object.freeze({
  SHOPIFY: "shopify",
  WOOCOMMERCE: "woocommerce",
});
export const STORE_PLATFORM_VALUES = Object.values(StorePlatform);

export const ConnectionStatus = Object.freeze({
  UNVERIFIED: "unverified",
  VERIFIED: "verified",
  DISCONNECTED: "disconnected",
});
export const CONNECTION_STATUS_VALUES = Object.values(ConnectionStatus);

export const SyncStatus = Object.freeze({
  IDLE: "idle",
  SYNCING: "syncing",
  PAUSED: "paused",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
  FAILED: "failed",
});
export const SYNC_STATUS_VALUES = Object.values(SyncStatus);

export const ImportItemStatus = Object.freeze({
  PENDING: "pending",
  EXTRACTING: "extracting",
  READY_FOR_APPROVAL: "ready_for_approval",
  NEEDS_ATTENTION: "needs_attention",
  POSSIBLE_DUPLICATE: "possible_duplicate",
  APPROVED: "approved",
  REJECTED: "rejected",
  FAILED: "failed",
});
export const IMPORT_ITEM_STATUS_VALUES = Object.values(ImportItemStatus);

export const FieldProvenance = Object.freeze({
  SOURCE_CONFIRMED: "source_confirmed",
  AI_INFERRED: "ai_inferred",
  BUSINESS_CONFIRMED: "business_confirmed",
  BUSINESS_EDITED: "business_edited",
});
export const FIELD_PROVENANCE_VALUES = Object.values(FieldProvenance);

export const HondaCompatibilityStatus = Object.freeze({
  COMPATIBLE: "compatible",
  LIKELY_COMPATIBLE: "likely_compatible",
  UNKNOWN: "unknown",
  INCOMPATIBLE: "incompatible",
});
export const HONDA_COMPATIBILITY_STATUS_VALUES = Object.values(HondaCompatibilityStatus);

export const DuplicateMatchMethod = Object.freeze({
  EXTERNAL_ID: "external_id",
  SKU: "sku",
  MANUFACTURER_PART_NUMBER: "manufacturer_part_number",
  CANONICAL_URL: "canonical_url",
  AI_SIMILARITY: "ai_similarity",
});
export const DUPLICATE_MATCH_METHOD_VALUES = Object.values(DuplicateMatchMethod);

// ADR-046 §7: compatibility confidence threshold (0–100). Configurable; 85 is
// the Phase 1 default. >= threshold → compatible; below → needs attention.
export const COMPATIBILITY_CONFIDENCE_THRESHOLD = 85;

// ADR-046 §11: per-sync safety caps (enforced at the fetch layer, Section 4).
export const SYNC_MAX_PRODUCTS = 500;
export const SYNC_FETCH_TIMEOUT_MS = 15000;
export const SYNC_MAX_REDIRECTS = 3;
export const SYNC_BATCH_SIZE = 25;

/**
 * requireStoreImportAdmin — the Phase 1 feature-flag gate. Returns null when
 * the caller is an admin (the feature flag), or an error Response otherwise.
 * Every StoreConnectorService action MUST call this first. This is the
 * security boundary; RLS (admin-only on both entities) is defense in depth.
 */
export function requireStoreImportAdmin(user: any): Response | null {
  if (!user) return err("AUTH_REQUIRED", 401);
  if (user.role !== "admin") return err("PERMISSION_DENIED", 403, { reason: "admin only" });
  return null;
}
// ============================================================================
// Product staging — pure helpers (ADR-046 §6–§8)
//
// Kept free of SDK/network calls so they are unit-testable; the service layer
// (functions/store-import) does the fetching and persistence.
// ============================================================================

const TITLE_MAX = 140;
const DESCRIPTION_MAX = 4000;
const PHOTO_URLS_MAX = 10;
const SOURCE_RAW_MAX = 4000;

/** Strip HTML tags and collapse whitespace from a source description. */
export function stripHtml(html: unknown): string {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Shopify prices are decimal strings ("129.95"). Convert to integer cents (ADR-018). */
export function priceToCents(price: unknown): number | null {
  if (price === null || price === undefined || price === "") return null;
  const n = Number(price);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

// Keyword → MarketplaceListing category. Deliberately conservative: anything
// that does not match a specific bucket falls to `other` rather than guessing,
// because a wrong category is worse than an unset one an admin can fix.
const CATEGORY_KEYWORDS: [string, string[]][] = [
  ["forced_induction", ["turbo", "supercharger", "intercooler", "blow off", "wastegate", "manifold boost"]],
  ["brakes", ["brake", "rotor", "caliper", "brake pad", "disc pad"]],
  ["suspension", ["coilover", "suspension", "strut", "sway bar", "control arm", "bush", "shock absorber"]],
  ["wheels_tyres", ["wheel", "rim", "tyre", "tire", "hubcap"]],
  ["electronics", ["battery", "alternator", "starter motor", "ecu", "sensor", "wiring", "spark plug", "ignition coil", "fuse", "globe", "headlight"]],
  ["engine", ["engine", "piston", "camshaft", "gasket", "oil pump", "timing belt", "cylinder head", "radiator"]],
  ["transmission", ["transmission", "gearbox", "clutch", "flywheel", "differential", "shifter"]],
  ["interior", ["seat", "steering wheel", "gauge", "harness", "floor mat", "dash"]],
  ["exterior", ["bumper", "spoiler", "body kit", "bonnet", "guard", "mirror", "grille"]],
  ["tools_equipment", ["tool", "jack", "charger", "tester", "spanner", "socket set"]],
  ["performance_part", ["exhaust", "intake", "performance", "cat back", "header", "extractor"]],
];

/**
 * Best-effort category inference from the product title/type/tags. Returns
 * `other` when nothing matches — never a guess. The result is always recorded
 * as ai_inferred provenance so a reviewer knows it was not source-confirmed.
 */
export function inferCategory(...text: unknown[]): string {
  const hay = text.map((t) => String(t || "")).join(" ").toLowerCase();
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => hay.includes(k))) return category;
  }
  return "other";
}

/**
 * Map one Shopify product (Admin API shape) to StoreImportItem fields.
 *
 * Compatibility (ADR-043 arrays, confidence score, honda_compatibility_status)
 * is deliberately NOT inferred here. ADR-046 §7 specifies AI extraction for
 * those; until that exists, emitting a fabricated score would be worse than
 * emitting none. Items are staged with empty arrays, `unknown` status and a null
 * confidence score, which routes them to needs_attention for a human to fill in.
 */
export function mapShopifyProduct(product: any, connection: any): Record<string, any> {
  const variant = Array.isArray(product?.variants) && product.variants.length ? product.variants[0] : {};
  const title = String(product?.title || "").trim().slice(0, TITLE_MAX);
  const description = stripHtml(product?.body_html).slice(0, DESCRIPTION_MAX);
  const photos = (Array.isArray(product?.images) ? product.images : [])
    .map((i: any) => i?.src)
    .filter((s: any) => typeof s === "string" && s)
    .slice(0, PHOTO_URLS_MAX);
  const handle = product?.handle ? String(product.handle) : null;
  const externalUrl = handle && connection?.store_domain ? `https://${connection.store_domain}/products/${handle}` : null;

  // Only the fields we actually use downstream, capped — never the full payload.
  const sourceRaw = JSON.stringify({
    id: product?.id ?? null,
    handle,
    product_type: product?.product_type ?? null,
    vendor: product?.vendor ?? null,
    tags: product?.tags ?? null,
    status: product?.status ?? null,
    variant_sku: variant?.sku ?? null,
    variant_price: variant?.price ?? null,
    variant_barcode: variant?.barcode ?? null,
  }).slice(0, SOURCE_RAW_MAX);

  return {
    connection_id: connection?.id ?? null,
    business_id: connection?.business_id ?? null,
    external_id: product?.id != null ? String(product.id) : "",
    external_url: externalUrl,
    sku: variant?.sku ? String(variant.sku) : null,
    manufacturer_part_number: variant?.barcode ? String(variant.barcode) : null,
    title,
    description: description || null,
    price_cents: priceToCents(variant?.price),
    currency: "AUD",
    condition: "new", // A connected retail store sells new stock; a reviewer can change it.
    category: inferCategory(title, product?.product_type, product?.tags),
    brand: product?.vendor ? String(product.vendor).slice(0, 80) : null,
    oem_or_aftermarket: null,
    photo_urls: photos,
    source_raw: sourceRaw,
    // ADR-043 compatibility — not inferred; see the note above.
    compatible_models: [],
    compatible_chassis_codes: [],
    compatible_engine_families: [],
    compatible_year_from: null,
    compatible_year_to: null,
    compatibility_confidence_score: null,
    honda_compatibility_status: HondaCompatibilityStatus.UNKNOWN,
    field_provenance: {
      title: FieldProvenance.SOURCE_CONFIRMED,
      description: FieldProvenance.SOURCE_CONFIRMED,
      price_cents: FieldProvenance.SOURCE_CONFIRMED,
      sku: FieldProvenance.SOURCE_CONFIRMED,
      photo_urls: FieldProvenance.SOURCE_CONFIRMED,
      brand: FieldProvenance.SOURCE_CONFIRMED,
      category: FieldProvenance.AI_INFERRED,
      condition: FieldProvenance.AI_INFERRED,
    },
  };
}

/** Normalise a value for duplicate comparison: trimmed, lowercased, or null. */
function dupKey(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase();
  return s || null;
}

/**
 * Duplicate-detection waterfall (ADR-046 §8), highest confidence first:
 * external_id → sku → manufacturer_part_number → canonical_url.
 *
 * `ai_similarity` is the specified final fallback and is NOT implemented here —
 * it needs the same AI layer as compatibility extraction. Its absence means
 * some near-duplicates with differing identifiers will not be caught; that is a
 * missed detection (a reviewer sees two similar items), never a false match.
 */
export function detectDuplicate(
  candidate: Record<string, any>,
  existing: Record<string, any>[],
): { duplicate_of_item_id: string; duplicate_match_method: string } | null {
  const waterfall: [string, string][] = [
    ["external_id", DuplicateMatchMethod.EXTERNAL_ID],
    ["sku", DuplicateMatchMethod.SKU],
    ["manufacturer_part_number", DuplicateMatchMethod.MANUFACTURER_PART_NUMBER],
    ["external_url", DuplicateMatchMethod.CANONICAL_URL],
  ];
  for (const [field, method] of waterfall) {
    const key = dupKey(candidate[field]);
    if (!key) continue;
    const hit = existing.find((e) => e && e.id && dupKey(e[field]) === key);
    if (hit) return { duplicate_of_item_id: hit.id, duplicate_match_method: method };
  }
  return null;
}

/**
 * Decide the staged status for a freshly mapped item. A duplicate outranks
 * everything; otherwise anything missing what a listing requires — or lacking
 * confirmed Honda compatibility — needs a human before it can be approved.
 */
export function stageStatus(
  item: Record<string, any>,
  duplicate: { duplicate_of_item_id: string } | null,
): string {
  if (duplicate) return ImportItemStatus.POSSIBLE_DUPLICATE;
  if (!item.title || item.price_cents === null) return ImportItemStatus.NEEDS_ATTENTION;
  const score = item.compatibility_confidence_score;
  if (typeof score !== "number" || score < COMPATIBILITY_CONFIDENCE_THRESHOLD) {
    return ImportItemStatus.NEEDS_ATTENTION;
  }
  return ImportItemStatus.READY_FOR_APPROVAL;
}

// ============================================================================
// Business self-serve access control
//
// Phase 1 was admin-only. Business partners now manage their OWN store import:
// connect a site, run a sync, and approve their own products.
//
// RLS on BusinessStoreConnection and StoreImportItem deliberately stays
// admin-only. Loosening it would expose every business's connection rows —
// including credential fields — to direct entity access from any member of any
// business. Instead the backend keeps using the service role and enforces
// membership here, which is the ADR-036 backend-functions-only pattern: the
// function gate is the boundary, RLS is defence in depth behind it.
// ============================================================================

/** Businesses this user may manage imports for. Admins get every business. */
export async function accessibleBusinessIds(base44: any, user: any): Promise<string[] | "all"> {
  if (!user) return [];
  if (user.role === "admin") return "all";
  const memberships = await base44.asServiceRole.entities.BusinessMembership.filter({
    user_id: user.id, status: "active",
  });
  return memberships.map((m: any) => m.business_id).filter(Boolean);
}

/**
 * Gate for every store-import action. Returns an error Response to return
 * directly, or null when the caller may act on `businessId`.
 *
 * `businessId` omitted means "any business this user belongs to" — used by list
 * actions, which then scope their own results.
 *
 * A user who is not a member gets PERMISSION_DENIED, never RESOURCE_NOT_FOUND
 * with detail, so this cannot be used to probe which business ids exist.
 */
export async function requireBusinessStoreAccess(
  base44: any,
  user: any,
  businessId?: string | null,
): Promise<Response | null> {
  if (!user) return err("AUTH_REQUIRED", 401);
  if (user.account_status === "banned" || user.account_status === "suspended") {
    return err("PERMISSION_DENIED", 403, { reason: "account not in good standing" });
  }
  const allowed = await accessibleBusinessIds(base44, user);
  if (allowed === "all") return null;
  if (!allowed.length) return err("PERMISSION_DENIED", 403, { reason: "not a member of any business" });
  if (businessId && !allowed.includes(businessId)) {
    return err("PERMISSION_DENIED", 403, { reason: "not a member of this business" });
  }
  return null;
}

/** True when this user may act on the given business. */
export function canAccessBusiness(allowed: string[] | "all", businessId: string): boolean {
  return allowed === "all" || allowed.includes(businessId);
}
