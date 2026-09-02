/**
 * Honda Hub — automatic import tests: WooCommerce Store API + generic web
 * extraction.
 *
 *   Run:  deno test base44/shared/auto-import.test.ts
 *
 * The WooCommerce fixture is the real response shape returned by
 * elusiveracing.com.au's public Store API, including its integer-minor-unit
 * pricing, which is the field most likely to be mis-read by 100x.
 */

import { mapWooProduct, wooPriceToCents, wooPageUrl, wooPagination, shopifyPublicPageUrl } from "./woo-import.ts";
import { mapShopifyProduct } from "./store-import.ts";
import {
  parseSitemapUrls, isSitemapIndexEntry, looksLikeProductUrl, parsePriceText,
  extractJsonLdBlocks, findJsonLdProduct, fromJsonLdProduct, fromMetaTags,
  htmlForExtraction, absolutiseUrl, mapExtractedProduct, fromHtmlHeuristics,
} from "./web-extract.ts";

function eq(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(`${msg || "assertion failed"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function deepEq(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg || "assertion failed"}: expected ${b}, got ${a}`);
}

const CONN = { id: "conn_1", business_id: "biz_1" };

// Real shape from elusiveracing.com.au/wp-json/wc/store/products
const WOO_PRODUCT = {
  id: 139050,
  name: "Elusive Racing B16/B18C Stroker Turbo Forged Short Block",
  slug: "elusive-racing-b16-b18c-stroker-turbo-forged-short-block",
  type: "simple",
  permalink: "https://elusiveracing.com.au/product/elusive-racing-b16-b18c-stroker-turbo-forged-short-block/",
  sku: "",
  short_description: "",
  description: "<h2>Built to order</h2><p>Forged short block.</p>",
  prices: {
    price: "850000", regular_price: "850000", sale_price: "850000", price_range: null,
    currency_code: "AUD", currency_minor_unit: 2,
  },
  images: [
    { id: 1, src: "https://elusiveracing.com.au/wp-content/uploads/a.jpg", alt: "" },
    { id: 2, src: "https://elusiveracing.com.au/wp-content/uploads/b.jpg", alt: "" },
  ],
  categories: [{ name: "Built Engines" }, { name: "Wrecking used parts" }],
  brands: [{ name: "Elusive Racing" }],
  is_in_stock: true,
};

// --- WooCommerce pricing -------------------------------------------------------

Deno.test("wooPriceToCents reads minor units correctly", () => {
  eq(wooPriceToCents({ price: "850000", currency_minor_unit: 2 }), 850000, "$8,500.00");
  eq(wooPriceToCents({ price: "12995", currency_minor_unit: 2 }), 12995, "$129.95");
});

Deno.test("wooPriceToCents handles zero-decimal currencies", () => {
  // JPY has no minor unit: 8500 yen must become 850000 cents, not 8500.
  eq(wooPriceToCents({ price: "8500", currency_minor_unit: 0 }), 850000);
});

Deno.test("wooPriceToCents falls back to a variable product's from-price", () => {
  eq(
    wooPriceToCents({ price: "", price_range: { min_amount: "45000", max_amount: "90000" }, currency_minor_unit: 2 }),
    45000,
  );
});

Deno.test("wooPriceToCents rejects missing and malformed prices", () => {
  eq(wooPriceToCents(null), null);
  eq(wooPriceToCents({}), null);
  eq(wooPriceToCents({ price: "", price_range: null }), null);
  eq(wooPriceToCents({ price: "abc", currency_minor_unit: 2 }), null);
  eq(wooPriceToCents({ price: "-5", currency_minor_unit: 2 }), null);
});

// --- WooCommerce mapping -------------------------------------------------------

Deno.test("mapWooProduct maps a real Store API product", () => {
  const m = mapWooProduct(WOO_PRODUCT, CONN)!;
  eq(m.external_id, "139050");
  eq(m.title, "Elusive Racing B16/B18C Stroker Turbo Forged Short Block");
  eq(m.price_cents, 850000);
  eq(m.currency, "AUD");
  eq(m.brand, "Elusive Racing");
  eq(m.category, "engine", "categorised from title/categories");
  eq(m.business_id, "biz_1");
  eq(m.external_url?.startsWith("https://elusiveracing.com.au/product/"), true);
  deepEq(m.photo_urls, [
    "https://elusiveracing.com.au/wp-content/uploads/a.jpg",
    "https://elusiveracing.com.au/wp-content/uploads/b.jpg",
  ]);
  eq(m.description?.includes("Forged short block."), true, "HTML stripped");
  eq(m.sku, null, "an empty SKU string becomes null");
});

Deno.test("mapWooProduct does not fabricate compatibility", () => {
  const m = mapWooProduct(WOO_PRODUCT, CONN)!;
  deepEq(m.compatible_models, []);
  eq(m.compatibility_confidence_score, null);
  eq(m.honda_compatibility_status, "unknown");
});

Deno.test("mapWooProduct skips unusable products", () => {
  eq(mapWooProduct({ id: 1, name: "" }, CONN), null, "no name");
  eq(mapWooProduct({ name: "No id" }, CONN), null, "no id");
});

Deno.test("wooPageUrl and wooPagination", () => {
  eq(wooPageUrl("https://shop.com/", 1), "https://shop.com/wp-json/wc/store/products?per_page=100&page=1");
  eq(wooPageUrl("https://shop.com", 0), "https://shop.com/wp-json/wc/store/products?per_page=100&page=1", "page floors at 1");
  const h = new Headers({ "x-wp-total": "4637", "x-wp-totalpages": "47" });
  deepEq(wooPagination(h), { total: 4637, totalPages: 47 });
  deepEq(wooPagination(new Headers()), { total: null, totalPages: null }, "absent headers are null, not zero");
});

// --- sitemap + URL heuristics --------------------------------------------------

Deno.test("parseSitemapUrls extracts locations", () => {
  const xml = `<urlset><url><loc>https://a.com/product/1/x</loc></url><url><loc>https://a.com/about</loc></url></urlset>`;
  deepEq(parseSitemapUrls(xml), ["https://a.com/product/1/x", "https://a.com/about"]);
  deepEq(parseSitemapUrls(""), []);
});

Deno.test("isSitemapIndexEntry spots nested sitemaps", () => {
  eq(isSitemapIndexEntry("https://a.com/sitemap-products.xml"), true);
  eq(isSitemapIndexEntry("https://a.com/product/1/x"), false);
});

Deno.test("looksLikeProductUrl matches product pages (the A2R shape)", () => {
  eq(looksLikeProductUrl("https://a2rbatteriesandperformance.com.au/product/1548/optima-34-red-top-battery"), true);
  eq(looksLikeProductUrl("https://shop.com/products/brake-kit"), true);
});

Deno.test("looksLikeProductUrl excludes non-product pages", () => {
  for (const u of [
    "https://a.com/cart", "https://a.com/checkout", "https://a.com/account/login",
    "https://a.com/blog/how-to-fit-a-battery", "https://a.com/privacy", "https://a.com/contact",
    "https://a.com/img/product/x.jpg", "https://a.com/", "not-a-url",
  ]) {
    eq(looksLikeProductUrl(u), false, `should exclude ${u}`);
  }
});

// --- price parsing from human text ---------------------------------------------

Deno.test("parsePriceText handles the ways prices are written", () => {
  eq(parsePriceText("$429.95"), 42995);
  eq(parsePriceText("AUD 1,299.00"), 129900);
  eq(parsePriceText("89"), 8900);
  eq(parsePriceText(429.95), 42995, "numeric input");
  eq(parsePriceText("1.299,00"), 129900, "comma decimal separator");
  eq(parsePriceText(""), null);
  eq(parsePriceText("Call for price"), null);
  eq(parsePriceText(null), null);
});

// --- JSON-LD -------------------------------------------------------------------

const JSONLD_PAGE = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product",
"name":"Optima 34 Red Top Battery","sku":"OPT-34RT","description":"AGM battery.",
"brand":{"@type":"Brand","name":"Optima"},"image":["https://a.com/1.jpg"],
"offers":{"@type":"Offer","price":"429.95","priceCurrency":"AUD"}}</script>
</head><body></body></html>`;

Deno.test("extracts a schema.org Product from JSON-LD", () => {
  const p = fromJsonLdProduct(findJsonLdProduct(extractJsonLdBlocks(JSONLD_PAGE)))!;
  eq(p.title, "Optima 34 Red Top Battery");
  eq(p.price_cents, 42995);
  eq(p.sku, "OPT-34RT");
  eq(p.brand, "Optima");
  deepEq(p.photo_urls, ["https://a.com/1.jpg"]);
});

Deno.test("finds a Product nested inside @graph", () => {
  const html = `<script type="application/ld+json">{"@graph":[{"@type":"WebSite"},{"@type":"Product","name":"Coilovers","offers":{"price":"1200"}}]}</script>`;
  const p = fromJsonLdProduct(findJsonLdProduct(extractJsonLdBlocks(html)))!;
  eq(p.title, "Coilovers");
  eq(p.price_cents, 120000);
});

Deno.test("a malformed JSON-LD block does not lose the valid ones", () => {
  const html = `<script type="application/ld+json">{ broken,,, }</script>` + JSONLD_PAGE;
  eq(findJsonLdProduct(extractJsonLdBlocks(html))?.name, "Optima 34 Red Top Battery");
});

Deno.test("returns null when there is no Product", () => {
  const html = `<script type="application/ld+json">{"@type":"Organization","name":"A2R"}</script>`;
  eq(findJsonLdProduct(extractJsonLdBlocks(html)), null);
  eq(fromJsonLdProduct(null), null);
});

// --- meta tags -----------------------------------------------------------------

Deno.test("falls back to OpenGraph tags", () => {
  const html = `<meta property="og:title" content="Brake Rotor"><meta property="og:image" content="https://a.com/r.jpg"><meta property="product:price:amount" content="189.00">`;
  const p = fromMetaTags(html)!;
  eq(p.title, "Brake Rotor");
  eq(p.price_cents, 18900);
  deepEq(p.photo_urls, ["https://a.com/r.jpg"]);
});

Deno.test("meta extraction returns null with no title", () => {
  eq(fromMetaTags(`<meta property="og:image" content="https://a.com/r.jpg">`), null);
});

// --- AI input hygiene ----------------------------------------------------------

Deno.test("htmlForExtraction strips scripts, styles and comments", () => {
  const out = htmlForExtraction(`<style>.a{color:red}</style><script>alert(1)</script><!-- hi --><p>Battery $99</p>`);
  eq(out.includes("alert"), false, "scripts removed");
  eq(out.includes("color:red"), false, "styles removed");
  eq(out.includes("hi"), false, "comments removed");
  eq(out.includes("Battery $99"), true, "content kept");
});

Deno.test("htmlForExtraction respects the budget", () => {
  eq(htmlForExtraction("<p>" + "x".repeat(50000) + "</p>", 500).length <= 500, true);
});

// --- mapping extracted results --------------------------------------------------

Deno.test("mapExtractedProduct marks structured sources as source-confirmed", () => {
  const m = mapExtractedProduct(
    { title: "Optima Battery", description: "AGM", price_cents: 42995, photo_urls: ["https://a.com/1.jpg"] },
    "https://a2r.com.au/product/1548/optima", CONN, "json_ld",
  )!;
  eq(m.field_provenance.title, "source_confirmed");
  eq(m.field_provenance.price_cents, "source_confirmed");
  eq(m.external_id, "https://a2r.com.au/product/1548/optima", "page URL is the stable id");
  eq(m.price_cents, 42995);
});

Deno.test("mapExtractedProduct marks model output as ai_inferred", () => {
  const m = mapExtractedProduct(
    { title: "Optima Battery", price: "$429.95", image_urls: ["/img/1.jpg"] },
    "https://a2r.com.au/product/1548/optima", CONN, "ai",
  )!;
  eq(m.field_provenance.title, "ai_inferred", "a reviewer must be able to see what was interpreted");
  eq(m.field_provenance.price_cents, "ai_inferred");
  eq(m.price_cents, 42995, "price text parsed");
  deepEq(m.photo_urls, ["https://a2r.com.au/img/1.jpg"], "relative image made absolute");
});

Deno.test("mapExtractedProduct requires a title", () => {
  eq(mapExtractedProduct({ title: "" }, "https://a.com/p/1", CONN, "ai"), null);
});

Deno.test("absolutiseUrl resolves and rejects safely", () => {
  eq(absolutiseUrl("/a.jpg", "https://x.com/p/1"), "https://x.com/a.jpg");
  eq(absolutiseUrl("https://cdn.com/a.jpg", "https://x.com/p/1"), "https://cdn.com/a.jpg");
  eq(absolutiseUrl("javascript:alert(1)", "https://x.com/p/1"), null, "non-http scheme rejected");
  eq(absolutiseUrl("", "https://x.com/p/1"), null);
});

// --- Shopify public storefront feed ---------------------------------------------

Deno.test("shopifyPublicPageUrl builds a public feed URL", () => {
  eq(shopifyPublicPageUrl("https://www.spoolup.com.au/", 1), "https://www.spoolup.com.au/products.json?limit=250&page=1");
  eq(shopifyPublicPageUrl("https://shop.com", 3), "https://shop.com/products.json?limit=250&page=3");
  eq(shopifyPublicPageUrl("https://shop.com", 0), "https://shop.com/products.json?limit=250&page=1", "page floors at 1");
});

Deno.test("mapShopifyProduct handles the public feed shape", () => {
  // Real shape from spoolup.com.au/products.json. Note tags is an ARRAY here,
  // where the Admin API sends a comma-joined string, and there is no barcode.
  const publicProduct = {
    id: 10520327815455,
    title: "K20 AND K24 AUTO BELT TENSIONER",
    handle: "k20-and-k24-auto-belt-tensioner",
    body_html: "<p><strong>Dayco Automatic Belt Tensioner &#8211; Honda K-Series K20 &amp; K24</strong></p>",
    vendor: "Dayco",
    product_type: "Engine",
    tags: ["honda", "k-series"],
    variants: [{ sku: "DAY-89642", price: "165.00" }],
    images: [{ src: "https://cdn.shopify.com/s/files/1/x.jpg" }],
  };
  const m = mapShopifyProduct(publicProduct, { id: "c1", business_id: "b1", store_domain: "www.spoolup.com.au" });
  eq(m.external_id, "10520327815455");
  eq(m.title, "K20 AND K24 AUTO BELT TENSIONER");
  eq(m.price_cents, 16500);
  eq(m.sku, "DAY-89642");
  eq(m.brand, "Dayco");
  eq(m.manufacturer_part_number, null, "public feed has no barcode");
  eq(m.description?.includes("Dayco Automatic Belt Tensioner – Honda K-Series K20 & K24"), true, "entities decoded");
  eq(m.category, "engine");
});

// --- reading a bespoke page's own markup ----------------------------------------
// Fixture mirrors a real store: the price lives ONLY in a data-price attribute
// and the photo ONLY in an <img src>. Both are destroyed by stripping tags, so
// an extractor that works from text alone finds neither.

const BESPOKE_PAGE = `<html><head>
<title>Buy Optima 34 Red Top Battery Online | A2R Batteries &amp; Performance </title>
<meta name="description" content="High performance AGM battery, 800 CCA.">
</head><body>
<img src="/images/logo.png">
<h1 class="title">Optima 34 Red Top Battery</h1>
<div class="price-wrap"><span class="price" data-price="440.00"></span></div>
<img class="modal-popup" src="/images/cms/products/1548/products-1548-1.png">
<img src="/images/icons/footer/amex-icon.png">
</body></html>`;

const PAGE_URL = "https://a2rbatteriesandperformance.com.au/product/1548/optima-34-red-top-battery";

// fromHtmlHeuristics returns null for a page with no title; these cases expect a
// result, so assert that rather than silencing the type.
function mustExtract(html: string, url: string): Record<string, any> {
  const r = fromHtmlHeuristics(html, url);
  if (!r) throw new Error("expected an extraction, got null");
  return r;
}

Deno.test("reads a price held only in a data-price attribute", () => {
  eq(mustExtract(BESPOKE_PAGE, PAGE_URL).price_cents, 44000);
});

Deno.test("reads product images and skips site furniture", () => {
  const r = mustExtract(BESPOKE_PAGE, PAGE_URL);
  deepEq(r.photo_urls, ["https://a2rbatteriesandperformance.com.au/images/cms/products/1548/products-1548-1.png"]);
});

Deno.test("prefers the on-page heading and strips site branding from a title", () => {
  eq(mustExtract(BESPOKE_PAGE, PAGE_URL).title, "Optima 34 Red Top Battery");
  // Falling back to <title>, "Buy ... Online | Store" must lose the boilerplate.
  const noH1 = BESPOKE_PAGE.replace(/<h1[\s\S]*?<\/h1>/, "");
  eq(mustExtract(noH1, PAGE_URL).title, "Optima 34 Red Top Battery");
});

Deno.test("takes the description from the meta tag", () => {
  eq(mustExtract(BESPOKE_PAGE, PAGE_URL).description, "High performance AGM battery, 800 CCA.");
});

Deno.test("falls back to a visible currency amount when there is no attribute", () => {
  const visible = `<h1>Brake Kit</h1><span>Now $1,299.00 inc GST</span>`;
  eq(mustExtract(visible, PAGE_URL).price_cents, 129900);
});

Deno.test("returns null when there is no title to work with", () => {
  eq(fromHtmlHeuristics("<html><body><p>nothing</p></body></html>", PAGE_URL), null);
});

Deno.test("results from the page are source-confirmed, not inferred", () => {
  const m = mapExtractedProduct(mustExtract(BESPOKE_PAGE, PAGE_URL), PAGE_URL, CONN, "html")!;
  eq(m.field_provenance.price_cents, "source_confirmed", "read from the page, not interpreted");
  eq(m.price_cents, 44000);
});
