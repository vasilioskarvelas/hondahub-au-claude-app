/**
 * Honda Hub — store-import staging tests (ADR-046 Phase 1).
 *
 *   Run:  deno test base44/shared/store-import.test.ts
 *
 * Covers the pure staging helpers: HTML stripping, price→cents, category
 * inference, Shopify product mapping, the duplicate-detection waterfall
 * (ADR-046 §8) and staged-status routing.
 */

import {
  stripHtml, priceToCents, inferCategory, mapShopifyProduct,
  detectDuplicate, stageStatus, ImportItemStatus, DuplicateMatchMethod,
  HondaCompatibilityStatus, FieldProvenance, COMPATIBILITY_CONFIDENCE_THRESHOLD,
  detectOtherMarque,
} from "./store-import.ts";

function eq(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(`${msg || "assertion failed"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function deepEq(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg || "assertion failed"}: expected ${b}, got ${a}`);
}

const CONNECTION = { id: "conn_1", business_id: "biz_1", store_domain: "a2r-demo.myshopify.com" };

const SHOPIFY_PRODUCT = {
  id: 8123456789,
  title: "Optima 34 Red Top Battery",
  body_html: "<p>High performance <strong>AGM</strong> battery.</p><br>800 CCA",
  handle: "optima-34-red-top-battery",
  product_type: "Batteries",
  vendor: "Optima",
  tags: "battery, agm, performance",
  status: "active",
  images: [{ src: "https://cdn.example/1.jpg" }, { src: "https://cdn.example/2.jpg" }],
  variants: [{ sku: "OPT-34RT", price: "429.95", barcode: "9312345678901" }],
};

// --- primitives ---------------------------------------------------------------

Deno.test("stripHtml removes markup and normalises entities", () => {
  eq(stripHtml("<p>Hello <strong>world</strong></p>"), "Hello world");
  eq(stripHtml("A<br>B"), "A\nB");
  eq(stripHtml("Tom &amp; Jerry &quot;quoted&quot;"), 'Tom & Jerry "quoted"');
  eq(stripHtml(null), "");
});

Deno.test("priceToCents converts decimal strings to integer cents", () => {
  eq(priceToCents("429.95"), 42995);
  eq(priceToCents("0"), 0);
  eq(priceToCents(19.9), 1990);
  // Floating point must not leak: 1.1 * 100 = 110.00000000000001
  eq(priceToCents("1.1"), 110);
  eq(priceToCents(null), null, "null price");
  eq(priceToCents(""), null, "empty price");
  eq(priceToCents("not-a-price"), null, "garbage price");
  eq(priceToCents(-5), null, "negative price");
});

Deno.test("inferCategory matches keywords and falls back to other, never a guess", () => {
  eq(inferCategory("Optima Red Top Battery"), "electronics");
  eq(inferCategory("Front Brake Rotor"), "brakes");
  eq(inferCategory("BC Racing Coilover Kit"), "suspension");
  eq(inferCategory("Garrett Turbo GT2871"), "forced_induction");
  eq(inferCategory("Cat Back Exhaust System"), "performance_part");
  eq(inferCategory("Mystery Widget 9000"), "other", "no keyword match must fall back to other");
  eq(inferCategory(null, undefined), "other", "empty input");
});

// --- mapping ------------------------------------------------------------------

Deno.test("mapShopifyProduct maps a product to StoreImportItem fields", () => {
  const m = mapShopifyProduct(SHOPIFY_PRODUCT, CONNECTION);
  eq(m.connection_id, "conn_1");
  eq(m.business_id, "biz_1");
  eq(m.external_id, "8123456789", "external_id must be a string");
  eq(m.title, "Optima 34 Red Top Battery");
  eq(m.sku, "OPT-34RT");
  eq(m.manufacturer_part_number, "9312345678901");
  eq(m.price_cents, 42995);
  eq(m.currency, "AUD");
  eq(m.brand, "Optima");
  eq(m.category, "electronics");
  eq(m.external_url, "https://a2r-demo.myshopify.com/products/optima-34-red-top-battery");
  deepEq(m.photo_urls, ["https://cdn.example/1.jpg", "https://cdn.example/2.jpg"]);
  eq(m.description?.includes("High performance AGM battery."), true, "description stripped of HTML");
});

Deno.test("mapShopifyProduct does NOT fabricate ADR-043 compatibility", () => {
  const m = mapShopifyProduct(SHOPIFY_PRODUCT, CONNECTION);
  deepEq(m.compatible_models, []);
  deepEq(m.compatible_chassis_codes, []);
  deepEq(m.compatible_engine_families, []);
  eq(m.compatible_year_from, null);
  eq(m.compatible_year_to, null);
  eq(m.compatibility_confidence_score, null, "no AI layer exists — a score would be fabricated");
  eq(m.honda_compatibility_status, HondaCompatibilityStatus.UNKNOWN);
});

Deno.test("mapShopifyProduct records provenance, marking inferred fields as such", () => {
  const m = mapShopifyProduct(SHOPIFY_PRODUCT, CONNECTION);
  eq(m.field_provenance.title, FieldProvenance.SOURCE_CONFIRMED);
  eq(m.field_provenance.price_cents, FieldProvenance.SOURCE_CONFIRMED);
  eq(m.field_provenance.category, FieldProvenance.AI_INFERRED, "category is inferred, not confirmed");
  eq(m.field_provenance.condition, FieldProvenance.AI_INFERRED);
});

Deno.test("mapShopifyProduct survives a sparse product without throwing", () => {
  const m = mapShopifyProduct({ id: 5, title: "Bare Item" }, CONNECTION);
  eq(m.external_id, "5");
  eq(m.title, "Bare Item");
  eq(m.sku, null);
  eq(m.price_cents, null);
  eq(m.external_url, null, "no handle means no canonical url");
  deepEq(m.photo_urls, []);
});

Deno.test("mapShopifyProduct caps photos at 10", () => {
  const many = { ...SHOPIFY_PRODUCT, images: Array.from({ length: 25 }, (_, i) => ({ src: `https://cdn/${i}.jpg` })) };
  eq(mapShopifyProduct(many, CONNECTION).photo_urls.length, 10);
});

// --- duplicate waterfall (ADR-046 §8) ------------------------------------------

Deno.test("detectDuplicate follows the waterfall in priority order", () => {
  const existing = [
    { id: "a", external_id: "111", sku: "SKU-A", manufacturer_part_number: "MPN-A", external_url: "https://s/p/a" },
    { id: "b", external_id: "222", sku: "SKU-B", manufacturer_part_number: "MPN-B", external_url: "https://s/p/b" },
  ];
  deepEq(
    detectDuplicate({ external_id: "222", sku: "SKU-A" }, existing),
    { duplicate_of_item_id: "b", duplicate_match_method: DuplicateMatchMethod.EXTERNAL_ID },
    "external_id outranks sku",
  );
  deepEq(
    detectDuplicate({ external_id: "999", sku: "SKU-A" }, existing),
    { duplicate_of_item_id: "a", duplicate_match_method: DuplicateMatchMethod.SKU },
  );
  deepEq(
    detectDuplicate({ external_id: "999", sku: null, manufacturer_part_number: "MPN-B" }, existing),
    { duplicate_of_item_id: "b", duplicate_match_method: DuplicateMatchMethod.MANUFACTURER_PART_NUMBER },
  );
  deepEq(
    detectDuplicate({ external_id: "999", external_url: "https://s/p/a" }, existing),
    { duplicate_of_item_id: "a", duplicate_match_method: DuplicateMatchMethod.CANONICAL_URL },
  );
});

Deno.test("detectDuplicate is case- and whitespace-insensitive", () => {
  const existing = [{ id: "a", external_id: "111", sku: "sku-a" }];
  deepEq(
    detectDuplicate({ external_id: "999", sku: "  SKU-A  " }, existing),
    { duplicate_of_item_id: "a", duplicate_match_method: DuplicateMatchMethod.SKU },
  );
});

Deno.test("detectDuplicate never matches on empty/null identifiers", () => {
  // Two products that both lack a SKU are not duplicates of each other. Treating
  // null == null here would collapse every SKU-less product into one item.
  const existing = [{ id: "a", external_id: "111", sku: null, manufacturer_part_number: "", external_url: null }];
  eq(detectDuplicate({ external_id: "222", sku: null, manufacturer_part_number: "", external_url: null }, existing), null);
  eq(detectDuplicate({ external_id: "", sku: "", manufacturer_part_number: null }, existing), null);
  eq(detectDuplicate({ external_id: "222" }, []), null, "no existing items");
});

// --- staged status routing -----------------------------------------------------

Deno.test("stageStatus routes duplicates, gaps and unverified compatibility", () => {
  const complete = { title: "X", price_cents: 100, compatibility_confidence_score: COMPATIBILITY_CONFIDENCE_THRESHOLD };
  eq(
    stageStatus(complete, { duplicate_of_item_id: "a" }),
    ImportItemStatus.POSSIBLE_DUPLICATE,
    "a duplicate outranks everything",
  );
  eq(stageStatus(complete, null), ImportItemStatus.READY_FOR_APPROVAL);
  eq(stageStatus({ ...complete, title: "" }, null), ImportItemStatus.NEEDS_ATTENTION, "missing title");
  eq(stageStatus({ ...complete, price_cents: null }, null), ImportItemStatus.NEEDS_ATTENTION, "missing price");
  eq(
    stageStatus({ ...complete, compatibility_confidence_score: COMPATIBILITY_CONFIDENCE_THRESHOLD - 1 }, null),
    ImportItemStatus.NEEDS_ATTENTION,
    "below the confidence threshold",
  );
  eq(
    stageStatus({ ...complete, compatibility_confidence_score: null }, null),
    ImportItemStatus.NEEDS_ATTENTION,
    "no score at all must need attention, not sail through",
  );
});

Deno.test("a freshly mapped Shopify product always needs human attention today", () => {
  // Until the AI compatibility layer exists nothing can be auto-approved, and
  // that must be true by construction rather than by convention.
  const m = mapShopifyProduct(SHOPIFY_PRODUCT, CONNECTION);
  eq(stageStatus(m, null), ImportItemStatus.NEEDS_ATTENTION);
});

// --- HTML entity decoding (found in live WooCommerce data) ---------------------

Deno.test("stripHtml decodes numeric entities", () => {
  // Real title from elusiveracing.com.au. Left raw, "&#8211;" appears verbatim
  // in a product title on the marketplace.
  eq(
    stripHtml("NRG Innovations &#8211; Short Hub BMW E36"),
    "NRG Innovations – Short Hub BMW E36",
  );
  eq(stripHtml("Width &#x2013; 14&#8221;"), "Width – 14”", "hex entities too");
});

Deno.test("stripHtml decodes the named entities WordPress emits", () => {
  eq(stripHtml("Tom &amp; Jerry&rsquo;s &ldquo;parts&rdquo;"), "Tom & Jerry’s “parts”");
  eq(stripHtml("Skunk2&trade; 90&deg; bend"), "Skunk2™ 90° bend");
});

Deno.test("stripHtml leaves unknown entities alone rather than mangling them", () => {
  eq(stripHtml("50 &widget; each"), "50 &widget; each");
});

Deno.test("stripHtml still strips tags and normalises whitespace", () => {
  eq(stripHtml("<p>Front <strong>brake</strong></p>"), "Front brake");
  eq(stripHtml(null), "");
});

// --- Honda-only filtering -------------------------------------------------------

Deno.test("rejects products that clearly belong to another marque", () => {
  // Real titles from a partner's live catalogue — the first page was full of these.
  eq(detectOtherMarque({ title: "NRG Innovations – Short Hub BMW E36" }), "bmw");
  eq(detectOtherMarque({ title: "Nissan Skyline R34 Coilovers" }), "nissan");
  eq(detectOtherMarque({ title: "2JZ-GTE Head Gasket" }), "2jz");
  eq(detectOtherMarque({ title: "Subaru WRX STI Intercooler" }), "subaru");
});

Deno.test("keeps Honda products, including Acura and model shorthand", () => {
  for (const title of [
    "NRG Innovations – Short Hub NSX",
    "Skunk2 Intake Manifold B-Series",
    "Acura RSX Type S Clutch",
    "EK9 Civic Type R Front Lip",
    "K20A Throttle Body",
  ]) {
    eq(detectOtherMarque({ title }), null, `must keep: ${title}`);
  }
});

Deno.test("a part fitting a Honda AND another make is kept", () => {
  // Being wrong towards keeping is cheap — a reviewer skips it. Wrongly
  // rejecting a Honda part costs the business a sale.
  eq(
    detectOtherMarque({ title: "Universal Short Hub", description: "Fits Civic EK and BMW E36" }),
    null,
  );
});

Deno.test("marque tokens must be whole words, not substrings", () => {
  eq(detectOtherMarque({ title: "Product code30 bracket" }), null, "'e30' must not fire inside 'code30'");
  eq(detectOtherMarque({ title: "Item m30 spacer" }), null, "'m3' must not fire inside 'm30'");
  eq(detectOtherMarque({ title: "Fordable ramp" }), null, "'ford' must not fire inside 'Fordable'");
});

Deno.test("a product with no marque signal at all is kept", () => {
  eq(detectOtherMarque({ title: "Generic Oil Filter" }), null);
  eq(detectOtherMarque({ title: "" }), null);
  eq(detectOtherMarque({}), null);
});

Deno.test("the brand field is searched too", () => {
  eq(detectOtherMarque({ title: "Short Hub", brand: "Toyota" }), "toyota");
});
