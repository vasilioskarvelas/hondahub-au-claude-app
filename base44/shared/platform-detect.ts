/**
 * Honda Hub — store platform detection (ADR-046, business self-serve onboarding).
 *
 * A business pastes their website; we fingerprint it and tell them the fastest
 * import route available for that platform, rather than making them know or care
 * what their site runs on.
 *
 * Fingerprinting is a PURE function of (html, headers, url) so it is unit
 * testable; the service layer does the fetching.
 *
 * Honest limits, so nobody reads more into a result than it carries:
 *  - Detection is a heuristic over markup and headers. A heavily customised or
 *    headless storefront can hide its platform entirely, which is why `unknown`
 *    is a first-class result routed to a working fallback, not an error.
 *  - Detecting a platform says nothing about whether the site's API is enabled,
 *    reachable, or that the business holds credentials for it. It only tells the
 *    business which route to attempt.
 */

export const StoreImportMethod = Object.freeze({
  SHOPIFY_OAUTH: "shopify_oauth",
  WOOCOMMERCE_API: "woocommerce_api",
  WEBSITE_SCAN: "website_scan",
  CSV_UPLOAD: "csv_upload",
});

export const DetectedPlatform = Object.freeze({
  SHOPIFY: "shopify",
  WOOCOMMERCE: "woocommerce",
  BIGCOMMERCE: "bigcommerce",
  SQUARESPACE: "squarespace",
  WIX: "wix",
  MAGENTO: "magento",
  UNKNOWN: "unknown",
});

/** How automatic each route is, for honest presentation in the UI. */
const ROUTE = {
  [DetectedPlatform.SHOPIFY]: {
    method: StoreImportMethod.SHOPIFY_OAUTH,
    effort: "automatic",
    headline: "Fully automatic",
    detail: "Sign in to Shopify once to authorise access, then your whole catalogue imports on its own.",
    supported: true,
  },
  [DetectedPlatform.WOOCOMMERCE]: {
    method: StoreImportMethod.WOOCOMMERCE_API,
    effort: "automatic",
    headline: "Fully automatic",
    detail: "We can read your product catalogue straight from your store. Nothing to install or set up.",
    supported: true,
  },
};

/**
 * Everything else falls back to reading the website itself: product pages are
 * discovered from the sitemap and read one by one. It works on bespoke stores
 * with no API, but it is slower and less exact than a real product feed, so it
 * is described as such rather than promised as equivalent.
 */
const FALLBACK = {
  method: StoreImportMethod.WEBSITE_SCAN,
  effort: "automatic_slow",
  headline: "Automatic, reads your website",
  detail: "Your store doesn't use a platform we can read directly, so we'll go through your website page by page and pull out your products. This takes longer and may need a few corrections.",
  supported: true,
};

/** Normalise a user-entered website into a bare https origin, or null. */
export function normaliseWebsite(raw: unknown): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // A hostname with no dot (e.g. "localhost") is not a public store.
  if (!url.hostname.includes(".")) return null;
  return `${url.protocol}//${url.hostname}`;
}

type Fingerprint = { platform: string; confidence: number; signals: string[] };

/**
 * Identify the platform from fetched markup and headers.
 * Confidence is a coarse 0–100: a header or CDN hit is strong, a stray keyword
 * in markup is weak. It is a sorting aid for the UI, not a probability.
 */
export function fingerprintPlatform(html: string, headers: Record<string, string> = {}, url = ""): Fingerprint {
  const h = String(html || "").toLowerCase();
  const hdr: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers || {})) hdr[k.toLowerCase()] = String(v || "").toLowerCase();
  const u = String(url || "").toLowerCase();
  const signals: string[] = [];

  // --- Shopify: CDN and shop-id header are near-conclusive.
  let shopify = 0;
  if (hdr["x-shopid"] || hdr["x-shopify-stage"]) { shopify += 60; signals.push("shopify header"); }
  if (h.includes("cdn.shopify.com")) { shopify += 40; signals.push("shopify cdn"); }
  if (h.includes("myshopify.com") || u.includes("myshopify.com")) { shopify += 30; signals.push("myshopify domain"); }
  if (h.includes("shopify.theme") || h.includes("window.shopify")) { shopify += 25; signals.push("shopify runtime"); }

  // --- WooCommerce: a WordPress plugin, so look for both.
  let woo = 0;
  if (h.includes("woocommerce")) { woo += 45; signals.push("woocommerce markup"); }
  if (h.includes("wp-content") || h.includes("wp-json")) { woo += 25; signals.push("wordpress"); }
  if (h.includes("wc-ajax") || h.includes("wc_add_to_cart")) { woo += 30; signals.push("woocommerce runtime"); }

  // For the remaining platforms, only asset/CDN hosts are treated as strong.
  // A bare brand name scores weakly on its own: prose like "we migrated away
  // from Magento" must not fingerprint a site as running it.
  let bigcommerce = 0;
  if (h.includes("cdn11.bigcommerce")) { bigcommerce += 70; signals.push("bigcommerce cdn"); }
  else if (h.includes("bigcommerce.com")) { bigcommerce += 25; signals.push("bigcommerce mention"); }

  let squarespace = 0;
  if (h.includes("static1.squarespace")) { squarespace += 70; signals.push("squarespace cdn"); }
  else if (h.includes("squarespace.com")) { squarespace += 25; signals.push("squarespace mention"); }

  let wix = 0;
  if (h.includes("wixstatic.com")) { wix += 70; signals.push("wix cdn"); }
  else if (h.includes("wix.com")) { wix += 25; signals.push("wix mention"); }

  let magento = 0;
  if (h.includes("mage/cookies") || h.includes("mage-cache")) { magento += 60; signals.push("magento runtime"); }
  if (h.includes("/static/version")) { magento += 30; signals.push("magento static path"); }
  if (h.includes("magento")) { magento += 25; signals.push("magento mention"); }

  const scores: [string, number][] = [
    [DetectedPlatform.SHOPIFY, shopify],
    [DetectedPlatform.WOOCOMMERCE, woo],
    [DetectedPlatform.BIGCOMMERCE, bigcommerce],
    [DetectedPlatform.SQUARESPACE, squarespace],
    [DetectedPlatform.WIX, wix],
    [DetectedPlatform.MAGENTO, magento],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  const [platform, score] = scores[0];
  // Below this, a single incidental keyword could carry the result; treat as unknown.
  if (score < 40) return { platform: DetectedPlatform.UNKNOWN, confidence: 0, signals: [] };
  return { platform, confidence: Math.min(100, score), signals };
}

/**
 * Turn a fingerprint into the recommendation shown to the business, including
 * whether that route actually works today. A detected-but-unbuilt platform must
 * say so plainly rather than offering a route that will dead-end.
 */
export function recommendImportMethod(fp: Fingerprint): Record<string, any> {
  const route = (ROUTE as any)[fp.platform] || FALLBACK;
  return {
    platform: fp.platform,
    confidence: fp.confidence,
    signals: fp.signals,
    method: route.method,
    effort: route.effort,
    headline: route.headline,
    detail: route.detail,
    available_now: route.supported === true,
    // Set when the platform is recognised but its importer is not built yet, so
    // the UI can say "we support this, it is not ready" rather than "unsupported".
    coming_soon: route.supported === false && fp.platform !== DetectedPlatform.UNKNOWN
      ? fp.platform
      : null,
  };
}
