/**
 * Honda Hub — platform detection tests.
 *
 *   Run:  deno test base44/shared/platform-detect.test.ts
 *
 * The three partner-shaped cases below mirror what the real sites actually
 * served when fingerprinted (Shopify-style CDN markup, a WooCommerce/WordPress
 * store, and a bespoke store with no platform signature at all).
 */

import {
  normaliseWebsite, fingerprintPlatform, recommendImportMethod,
  DetectedPlatform, StoreImportMethod,
} from "./platform-detect.ts";

function eq(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(`${msg || "assertion failed"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// --- website normalisation -----------------------------------------------------

Deno.test("normaliseWebsite accepts what a business would actually type", () => {
  eq(normaliseWebsite("a2rbatteriesandperformance.com.au"), "https://a2rbatteriesandperformance.com.au");
  eq(normaliseWebsite("https://elusiveracing.com.au/shop?page=2"), "https://elusiveracing.com.au");
  eq(normaliseWebsite("  HTTP://Example.COM/  "), "http://example.com");
});

Deno.test("normaliseWebsite rejects what is not a public website", () => {
  eq(normaliseWebsite(""), null, "empty");
  eq(normaliseWebsite(null), null, "null");
  eq(normaliseWebsite("localhost:3000"), null, "no dot in hostname");
  eq(normaliseWebsite("javascript:alert(1)"), null, "non-http scheme");
  eq(normaliseWebsite("not a url at all"), null, "garbage");
});

// --- fingerprinting ------------------------------------------------------------

Deno.test("detects Shopify from CDN markup", () => {
  const fp = fingerprintPlatform(`<script src="https://cdn.shopify.com/s/files/x.js"></script>`);
  eq(fp.platform, DetectedPlatform.SHOPIFY);
  eq(fp.confidence >= 40, true, "CDN hit should be confident");
});

Deno.test("detects Shopify from response headers alone", () => {
  const fp = fingerprintPlatform("<html><body>nothing telling</body></html>", { "X-ShopId": "12345" });
  eq(fp.platform, DetectedPlatform.SHOPIFY, "header is near-conclusive even with bare markup");
});

Deno.test("detects WooCommerce (the Elusive Racing case)", () => {
  const fp = fingerprintPlatform(
    `<link rel="stylesheet" href="/wp-content/plugins/woocommerce/assets/css/woocommerce.css">`,
  );
  eq(fp.platform, DetectedPlatform.WOOCOMMERCE);
  eq(fp.signals.includes("woocommerce markup"), true);
  eq(fp.signals.includes("wordpress"), true);
});

Deno.test("returns unknown for a bespoke site (the A2R case)", () => {
  // Real shape: plain PHP/Apache output, product URLs like /product/1425/slug,
  // and no platform signature anywhere in the markup.
  const fp = fingerprintPlatform(
    `<html><body><a href="/product/1425/deltec-n43-battery">Deltec N43</a><a href="/cart">Cart</a></body></html>`,
    { server: "Apache", "x-powered-by": "PHP/7.1.33" },
  );
  eq(fp.platform, DetectedPlatform.UNKNOWN);
  eq(fp.confidence, 0);
});

Deno.test("a single incidental keyword does not carry a detection", () => {
  // A blog post mentioning a platform must not be fingerprinted as that platform.
  const fp = fingerprintPlatform(`<p>We migrated away from Magento last year.</p>`);
  eq(fp.platform, DetectedPlatform.UNKNOWN, "weak single signal must fall below threshold");
});

Deno.test("competing signals resolve to the strongest", () => {
  // A WooCommerce store embedding a Shopify buy-button must not read as Shopify.
  const fp = fingerprintPlatform(
    `<div class="woocommerce wc-ajax"><script src="/wp-content/x.js"></script>
     <script src="https://cdn.shopify.com/buy-button.js"></script></div>`,
  );
  eq(fp.platform, DetectedPlatform.WOOCOMMERCE);
});

// --- recommendation ------------------------------------------------------------

Deno.test("Shopify routes to OAuth and is available today", () => {
  const r = recommendImportMethod(fingerprintPlatform(`<script src="https://cdn.shopify.com/x.js">`));
  eq(r.method, StoreImportMethod.SHOPIFY_OAUTH);
  eq(r.effort, "automatic");
  eq(r.available_now, true);
  eq(r.coming_soon, null);
});

Deno.test("WooCommerce is recognised but flagged as not yet available", () => {
  const r = recommendImportMethod(fingerprintPlatform(`<div class="woocommerce"><i class="wp-content"></i></div>`));
  eq(r.method, StoreImportMethod.WOOCOMMERCE_API);
  eq(r.available_now, false, "Section 3 is spec'd, not built");
  eq(r.coming_soon, DetectedPlatform.WOOCOMMERCE, "must say 'supported, not ready' — not 'unsupported'");
});

Deno.test("an unknown platform falls back to CSV rather than failing", () => {
  const r = recommendImportMethod(fingerprintPlatform("<html><body>bespoke</body></html>"));
  eq(r.platform, DetectedPlatform.UNKNOWN);
  eq(r.method, StoreImportMethod.CSV_UPLOAD);
  eq(r.effort, "manual");
  eq(r.coming_soon, null, "unknown is not 'coming soon' for a specific platform");
});

Deno.test("a recognised-but-unbuilt platform never claims to be available", () => {
  // Guards the failure mode where a business is routed down a dead end.
  for (const html of [
    `<div class="woocommerce wp-content"></div>`,
    `<script src="https://cdn11.bigcommerce.com/x.js">`,
    `<img src="https://static1.squarespace.com/x.png">`,
  ]) {
    const r = recommendImportMethod(fingerprintPlatform(html));
    if (r.available_now && r.method !== StoreImportMethod.SHOPIFY_OAUTH) {
      throw new Error(`unbuilt route claimed available: ${r.platform} → ${r.method}`);
    }
  }
});
