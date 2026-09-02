/**
 * Honda Hub — WooCommerce catalogue import (ADR-046 Section 3).
 *
 * Uses the WooCommerce **Store API** (`/wp-json/wc/store/products`), which is
 * public and read-only on a default WooCommerce install. That matters a lot for
 * onboarding: the business pastes their website and nothing else — no API key to
 * generate, no CSV to export, no plugin to install.
 *
 * Where a store has the Store API disabled, the classic REST API
 * (`/wp-json/wc/v3/products`) can be used with a read-only consumer key/secret,
 * which is why BusinessStoreConnection carries those fields. That fallback is
 * NOT implemented here yet — `probeWooCommerce` reports which endpoint answered
 * so the caller can say so plainly rather than failing with a blank error.
 *
 * Ownership: the Store API is public, so reading it proves nothing about who
 * owns the shop. Ownership rests entirely on the business being verified by a
 * moderator before it can import anything (see accessibleBusinessIds). Do not
 * mistake "we could fetch it" for "they own it".
 */

import { stripHtml, inferCategory, HondaCompatibilityStatus, FieldProvenance } from "./store-import.ts";

export const WOO_STORE_API_PATH = "/wp-json/wc/store/products";
export const WOO_REST_API_PATH = "/wp-json/wc/v3/products";
/** Store API caps per_page at 100. */
export const WOO_PAGE_SIZE = 100;

/**
 * Store API prices are strings in the currency's MINOR units, with the scale
 * given by `currency_minor_unit` (2 for AUD, 0 for JPY). Normalise to cents so
 * a zero-decimal currency cannot silently arrive 100x too small.
 */
export function wooPriceToCents(prices: any): number | null {
  if (!prices) return null;
  let raw = prices.price;
  // Variable products expose a range instead of a single price; the "from"
  // price is what a shopper is shown, so use the minimum.
  if ((raw === null || raw === undefined || raw === "") && prices.price_range) {
    raw = prices.price_range.min_amount;
  }
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  const minorUnit = Number.isFinite(Number(prices.currency_minor_unit)) ? Number(prices.currency_minor_unit) : 2;
  return Math.round(n * Math.pow(10, 2 - minorUnit));
}

/** Map one Store API product onto StoreImportItem fields. */
export function mapWooProduct(product: any, connection: any): Record<string, any> | null {
  const title = String(product?.name || "").trim().slice(0, 140);
  if (!title || product?.id == null) return null;

  // `description` is the full HTML body; `short_description` is the summary.
  // Prefer the full one and fall back, since many stores fill only one.
  const description = stripHtml(product.description || product.short_description).slice(0, 4000);
  const images = (Array.isArray(product.images) ? product.images : [])
    .map((i: any) => i?.src)
    .filter((s: any) => typeof s === "string" && /^https?:\/\//i.test(s))
    .slice(0, 10);
  const categories = (Array.isArray(product.categories) ? product.categories : [])
    .map((c: any) => c?.name).filter(Boolean).join(" ");
  const brand = (Array.isArray(product.brands) ? product.brands : [])
    .map((b: any) => b?.name).filter(Boolean)[0] || null;

  return {
    connection_id: connection?.id ?? null,
    business_id: connection?.business_id ?? null,
    external_id: String(product.id),
    external_url: typeof product.permalink === "string" ? product.permalink : null,
    sku: product.sku ? String(product.sku) : null,
    manufacturer_part_number: null,
    title,
    description: description || null,
    price_cents: wooPriceToCents(product.prices),
    currency: product?.prices?.currency_code || "AUD",
    condition: "new",
    category: inferCategory(title, categories, description),
    brand: brand ? String(brand).slice(0, 80) : null,
    oem_or_aftermarket: null,
    photo_urls: images,
    source_raw: JSON.stringify({
      id: product.id, slug: product.slug ?? null, type: product.type ?? null,
      sku: product.sku ?? null, categories: categories || null,
      is_in_stock: product.is_in_stock ?? null,
    }).slice(0, 4000),
    // ADR-043 compatibility is not inferred here — see the note in store-import.ts.
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

/** Build the Store API URL for a given page. */
export function wooPageUrl(origin: string, page: number, perPage = WOO_PAGE_SIZE): string {
  const base = String(origin || "").replace(/\/+$/, "");
  return `${base}${WOO_STORE_API_PATH}?per_page=${perPage}&page=${Math.max(1, page)}`;
}

/**
 * Read WooCommerce's pagination headers. `x-wp-total` is the product count and
 * `x-wp-totalpages` the page count; both are absent on some hardened installs,
 * in which case the caller must page until an empty response rather than
 * assuming a single page.
 */
export function wooPagination(headers: { get(name: string): string | null }): { total: number | null; totalPages: number | null } {
  const num = (v: string | null) => {
    // An absent header must stay null. Number(null) is 0, and a 0 here would be
    // read as "this store has no products" and end the sync on its first page.
    if (v === null || v === undefined || String(v).trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  return {
    total: num(headers.get("x-wp-total")),
    totalPages: num(headers.get("x-wp-totalpages")),
  };
}

// ============================================================================
// Shopify public storefront feed
//
// Most Shopify stores expose /products.json publicly — the same feed that powers
// their own storefront. It carries title, body_html, vendor, tags, variants with
// prices and SKUs, and images: everything the import needs.
//
// That matters a lot for onboarding. The Admin API needs a Partner app and an
// OAuth round-trip; this needs nothing at all, so a Shopify partner is connected
// by pasting their website, exactly like WooCommerce. OAuth stays as the
// fallback for stores that have the public feed disabled, and for anything
// needing data the public feed omits.
//
// The payload shape matches the Admin API closely enough that mapShopifyProduct
// handles both. Two differences worth knowing: `tags` is an array here and a
// comma-joined string on the Admin API (the mapper stringifies either), and
// variant `barcode` is admin-only, so manufacturer_part_number stays null.
// ============================================================================

export const SHOPIFY_PUBLIC_PATH = "/products.json";
/** Shopify caps products.json at 250 per page. */
export const SHOPIFY_PUBLIC_PAGE_SIZE = 250;

/** Build the public feed URL for a given 1-based page. */
export function shopifyPublicPageUrl(origin: string, page: number, perPage = SHOPIFY_PUBLIC_PAGE_SIZE): string {
  const base = String(origin || "").replace(/\/+$/, "");
  return `${base}${SHOPIFY_PUBLIC_PATH}?limit=${perPage}&page=${Math.max(1, page)}`;
}
