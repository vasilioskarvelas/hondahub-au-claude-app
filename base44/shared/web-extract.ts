/**
 * Honda Hub — generic website product extraction (ADR-046, no-API fallback).
 *
 * For stores on bespoke software with no product API. Products are discovered
 * from sitemap.xml, then each page is read in a deliberate order of preference:
 *
 *   1. JSON-LD schema.org/Product  — structured, authored by the site, exact
 *   2. OpenGraph / meta tags       — semi-structured, usually right
 *   3. AI extraction from markup   — last resort, and the only step that guesses
 *
 * That order matters. Where a site publishes structured data we should read it
 * rather than ask a model to re-derive it from HTML: it is faster, free, and
 * cannot hallucinate a price. AI is for pages that expose nothing else, and
 * anything it produces is marked ai_inferred so a reviewer knows to check it.
 *
 * Everything here is pure — parsing, URL heuristics, prompt construction and
 * result normalisation. Fetching and the LLM call live in the service layer.
 */

import { stripHtml, inferCategory, HondaCompatibilityStatus, FieldProvenance } from "./store-import.ts";

/** Cap on product pages fetched in one run, to bound cost and time. */
export const EXTRACT_MAX_PAGES = 300;
/** How much of a page is handed to the model. Product data lives near the top. */
export const EXTRACT_HTML_BUDGET = 12000;

/** Pull every <loc> out of a sitemap or sitemap index. */
export function parseSitemapUrls(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(xml || ""))) !== null) {
    const u = m[1].trim();
    if (/^https?:\/\//i.test(u)) out.push(u);
  }
  return out;
}

/** True when a sitemap entry points at a nested sitemap rather than a page. */
export function isSitemapIndexEntry(url: string): boolean {
  return /\.xml(\.gz)?(\?|$)/i.test(String(url || ""));
}

/**
 * Heuristic for product pages. Deliberately conservative on exclusions: a URL
 * under /product/ is a product, while cart, account and policy pages are not.
 * A site that names its product pages something unusual will simply yield fewer
 * matches, which is a visible under-import rather than silent junk.
 */
export function looksLikeProductUrl(url: string): boolean {
  const u = String(url || "").toLowerCase();
  if (!/^https?:\/\//.test(u)) return false;
  if (/\/(cart|checkout|account|login|register|wishlist|compare|search|blog|news|privacy|terms|contact|about|shipping|returns|faq)(\/|$|\?)/.test(u)) return false;
  if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|css|js|xml)(\?|$)/.test(u)) return false;
  return /\/(product|products|shop|item|p)\/[^/]+/.test(u);
}

/** Parse a price written for humans: "$1,299.00", "AUD 89.95", "429.95". */
export function parsePriceText(text: unknown): number | null {
  if (text === null || text === undefined) return null;
  if (typeof text === "number") {
    return Number.isFinite(text) && text >= 0 ? Math.round(text * 100) : null;
  }
  const s = String(text).trim();
  if (!s) return null;
  // Keep digits, separators and a leading sign; drop currency words and symbols.
  const cleaned = s.replace(/[^0-9.,\-]/g, "");
  if (!cleaned || !/[0-9]/.test(cleaned)) return null;
  // "1,299.00" -> thousands comma; "1299,00" -> decimal comma.
  let normalised = cleaned;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma > lastDot) normalised = cleaned.replace(/\./g, "").replace(",", ".");
  else normalised = cleaned.replace(/,/g, "");
  const n = Number(normalised);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Extract every JSON-LD block, tolerating malformed ones. */
export function extractJsonLdBlocks(html: string): any[] {
  const out: any[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(html || ""))) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      // A single malformed block must not lose the others.
    }
  }
  return out;
}

function typeIncludes(node: any, want: string): boolean {
  const t = node?.["@type"];
  if (!t) return false;
  return Array.isArray(t) ? t.some((v) => String(v).toLowerCase() === want) : String(t).toLowerCase() === want;
}

/** Find a schema.org Product anywhere in the JSON-LD, including @graph and arrays. */
export function findJsonLdProduct(blocks: any[]): any | null {
  const queue = [...blocks];
  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== "object") continue;
    if (Array.isArray(node)) { queue.push(...node); continue; }
    if (typeIncludes(node, "product")) return node;
    if (Array.isArray(node["@graph"])) queue.push(...node["@graph"]);
  }
  return null;
}

/** Normalise a schema.org Product into our fields. */
export function fromJsonLdProduct(node: any): Record<string, any> | null {
  if (!node) return null;
  const name = String(node.name || "").trim();
  if (!name) return null;
  let offers = node.offers;
  if (Array.isArray(offers)) offers = offers[0];
  const images = (Array.isArray(node.image) ? node.image : node.image ? [node.image] : [])
    .map((i: any) => (typeof i === "string" ? i : i?.url))
    .filter((s: any) => typeof s === "string" && /^https?:\/\//i.test(s))
    .slice(0, 10);
  return {
    title: name.slice(0, 140),
    description: stripHtml(node.description).slice(0, 4000) || null,
    price_cents: parsePriceText(offers?.price ?? offers?.lowPrice ?? null),
    sku: node.sku ? String(node.sku) : null,
    manufacturer_part_number: node.mpn ? String(node.mpn) : null,
    brand: typeof node.brand === "string" ? node.brand : node.brand?.name || null,
    photo_urls: images,
    source: "json_ld",
  };
}

/** Read OpenGraph / product meta tags. */
export function fromMetaTags(html: string): Record<string, any> | null {
  const h = String(html || "");
  const meta = (prop: string): string | null => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, "i");
    const tag = h.match(re)?.[0];
    if (!tag) return null;
    return tag.match(/content=["']([^"']*)["']/i)?.[1]?.trim() || null;
  };
  const title = meta("og:title") || meta("twitter:title");
  if (!title) return null;
  const image = meta("og:image");
  return {
    title: title.slice(0, 140),
    description: stripHtml(meta("og:description") || meta("description")).slice(0, 4000) || null,
    price_cents: parsePriceText(meta("product:price:amount") || meta("og:price:amount")),
    sku: null,
    manufacturer_part_number: null,
    brand: meta("product:brand") || null,
    photo_urls: image && /^https?:\/\//i.test(image) ? [image] : [],
    source: "meta_tags",
  };
}

/**
 * Reduce a page to the markup worth sending to a model: strip scripts, styles,
 * SVG and comments, then take a budgeted slice. Keeps token cost bounded and
 * removes the parts that never carry product data.
 */
export function htmlForExtraction(html: string, budget = EXTRACT_HTML_BUDGET): string {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, budget);
}

/** JSON schema constraining the model's reply, so the result is parseable. */
export const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    price: { type: "string", description: "Price as shown, e.g. \"$429.95\". Empty string if none is displayed." },
    sku: { type: "string" },
    brand: { type: "string" },
    image_urls: { type: "array", items: { type: "string" } },
    is_product_page: { type: "boolean", description: "False if this page does not show a single purchasable product." },
  },
  required: ["title", "is_product_page"],
};

export function buildExtractionPrompt(url: string, html: string): string {
  return [
    "Extract product details from this e-commerce page.",
    "",
    "Rules:",
    "- Copy values exactly as shown. Do not invent, translate or tidy them.",
    "- If a field is not present on the page, return an empty string or empty array. Never guess.",
    "- price: the current selling price as displayed. If several are shown, take the one a buyer pays now.",
    "- image_urls: absolute URLs of the product's own photos. Exclude logos, icons and banners.",
    "- is_product_page: false for category, search, cart or article pages.",
    "",
    `URL: ${url}`,
    "",
    "PAGE:",
    htmlForExtraction(html),
  ].join("\n");
}

/** Resolve a possibly-relative image URL against the page it came from. */
export function absolutiseUrl(candidate: unknown, pageUrl: string): string | null {
  const s = String(candidate || "").trim();
  if (!s) return null;
  try {
    const u = new URL(s, pageUrl);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Turn an extraction result (from any of the three sources) into
 * StoreImportItem fields.
 *
 * Provenance is set from the source: JSON-LD and meta tags are
 * source_confirmed, because the site published those values itself. Anything a
 * model produced is ai_inferred, so a reviewer can see at a glance which
 * numbers were read and which were interpreted.
 */
export function mapExtractedProduct(
  data: Record<string, any>,
  pageUrl: string,
  connection: any,
  source: string,
): Record<string, any> | null {
  const title = String(data?.title || "").trim().slice(0, 140);
  if (!title) return null;
  const fromModel = source === "ai";
  const provenance = fromModel ? FieldProvenance.AI_INFERRED : FieldProvenance.SOURCE_CONFIRMED;
  const images = (Array.isArray(data.photo_urls) ? data.photo_urls : Array.isArray(data.image_urls) ? data.image_urls : [])
    .map((i: any) => absolutiseUrl(i, pageUrl))
    .filter((s: any): s is string => !!s)
    .slice(0, 10);
  const description = stripHtml(data.description).slice(0, 4000);

  return {
    connection_id: connection?.id ?? null,
    business_id: connection?.business_id ?? null,
    // The page URL is the only stable identifier a bespoke site reliably offers.
    external_id: pageUrl,
    external_url: pageUrl,
    sku: data.sku ? String(data.sku).trim() || null : null,
    manufacturer_part_number: data.manufacturer_part_number ? String(data.manufacturer_part_number) : null,
    title,
    description: description || null,
    price_cents: typeof data.price_cents === "number" ? data.price_cents : parsePriceText(data.price),
    currency: "AUD",
    condition: "new",
    category: inferCategory(title, description),
    brand: data.brand ? String(data.brand).slice(0, 80) : null,
    oem_or_aftermarket: null,
    photo_urls: images,
    source_raw: JSON.stringify({ extracted_via: source, url: pageUrl }).slice(0, 4000),
    compatible_models: [],
    compatible_chassis_codes: [],
    compatible_engine_families: [],
    compatible_year_from: null,
    compatible_year_to: null,
    compatibility_confidence_score: null,
    honda_compatibility_status: HondaCompatibilityStatus.UNKNOWN,
    field_provenance: {
      title: provenance,
      description: provenance,
      price_cents: provenance,
      photo_urls: provenance,
      brand: provenance,
      category: FieldProvenance.AI_INFERRED,
      condition: FieldProvenance.AI_INFERRED,
    },
  };
}
