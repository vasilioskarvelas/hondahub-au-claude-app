/**
 * Honda Hub — CSV product import (ADR-046, universal fallback route).
 *
 * The route that works for every business regardless of platform: they export a
 * spreadsheet from whatever software they use and upload it. No API, no
 * scraping, no per-site fragility.
 *
 * Pure and unit-tested: parsing and column mapping never touch the SDK or the
 * network. The service layer stages the mapped rows.
 */

import { priceToCents, stripHtml, inferCategory, HondaCompatibilityStatus, FieldProvenance } from "./store-import.ts";

/** Upper bound on an uploaded file, enforced before parsing. */
export const CSV_MAX_BYTES = 2_000_000;
/** Upper bound on rows accepted from one upload. */
export const CSV_MAX_ROWS = 2000;

/**
 * RFC 4180 CSV parser.
 *
 * Hand-written rather than regex-split because a naive `split(",")` corrupts
 * exactly the data these files carry: product descriptions containing commas,
 * quoted fields containing newlines, and escaped quotes ("" inside a quoted
 * field). Handles CRLF and LF, and a trailing newline.
 */
export function parseCsv(text: string): string[][] {
  const src = String(text || "").replace(/^﻿/, ""); // strip BOM from Excel exports
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < src.length) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; } // escaped quote
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; } // CRLF: handled by the \n branch
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  // Flush the final field/row unless the file simply ended with a newline.
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Header aliases, lowercased and stripped of non-alphanumerics before matching,
// so "Product Name", "product_name" and "PRODUCT-NAME" all resolve alike.
const COLUMN_ALIASES: Record<string, string[]> = {
  title: ["title", "name", "productname", "product", "itemname", "item", "description1"],
  description: ["description", "body", "bodyhtml", "longdescription", "details", "productdescription"],
  price_cents: ["price", "unitprice", "rrp", "saleprice", "amount", "cost", "retailprice"],
  sku: ["sku", "stockcode", "itemcode", "productcode", "code", "partnumber"],
  manufacturer_part_number: ["mpn", "manufacturerpartnumber", "oemnumber", "barcode", "ean", "gtin", "upc"],
  brand: ["brand", "vendor", "manufacturer", "make"],
  photo_urls: ["image", "imageurl", "imagesrc", "photo", "picture", "imagelink", "images"],
  external_url: ["url", "link", "producturl", "productlink", "permalink"],
  category: ["category", "type", "producttype", "collection", "department"],
  external_id: ["id", "productid", "itemid", "handle", "slug"],
};

function normaliseHeader(h: string): string {
  return String(h || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Map CSV headers onto StoreImportItem fields. Returns the resolved mapping and
 * the headers it could not place, so the UI can show what was ignored rather
 * than silently dropping columns.
 */
export function detectColumns(headers: string[]): { mapping: Record<string, number>; unmapped: string[] } {
  const mapping: Record<string, number> = {};
  const unmapped: string[] = [];
  headers.forEach((raw, index) => {
    const h = normaliseHeader(raw);
    if (!h) return;
    let matched: string | null = null;
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.includes(h)) { matched = field; break; }
    }
    // First column wins: a later duplicate must not silently override it.
    if (matched && mapping[matched] === undefined) mapping[matched] = index;
    else unmapped.push(raw);
  });
  return { mapping, unmapped };
}

/** Split a multi-image cell: comma, pipe or whitespace separated URLs. */
function splitImages(cell: string): string[] {
  return String(cell || "")
    .split(/[|,\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s))
    .slice(0, 10);
}

/**
 * Map one CSV row to StoreImportItem fields.
 *
 * As with the Shopify mapper, ADR-043 compatibility is NOT inferred — a
 * spreadsheet almost never carries reliable Honda fitment data, and a
 * fabricated confidence score on a car part is worse than an absent one.
 * Rows stage with unknown compatibility for a human to complete.
 *
 * Returns null when the row has no usable title, so blank trailing lines and
 * separator rows are skipped rather than staged as empty products.
 */
export function mapCsvRow(
  row: string[],
  mapping: Record<string, number>,
  connection: any,
  rowIndex: number,
): Record<string, any> | null {
  const cell = (field: string): string => {
    const idx = mapping[field];
    return idx === undefined ? "" : String(row[idx] ?? "").trim();
  };

  const title = cell("title").slice(0, 140);
  if (!title) return null;

  const description = stripHtml(cell("description")).slice(0, 4000);
  const sku = cell("sku") || null;
  // Without an id column, fall back to the SKU, then to the row position — every
  // item needs a stable external_id for duplicate detection and re-sync.
  const externalId = cell("external_id") || sku || `row-${rowIndex}`;
  const url = cell("external_url");

  return {
    connection_id: connection?.id ?? null,
    business_id: connection?.business_id ?? null,
    external_id: String(externalId),
    external_url: /^https?:\/\//i.test(url) ? url : null,
    sku,
    manufacturer_part_number: cell("manufacturer_part_number") || null,
    title,
    description: description || null,
    price_cents: priceToCents(cell("price_cents").replace(/[^0-9.\-]/g, "")),
    currency: "AUD",
    condition: "new",
    category: inferCategory(title, cell("category"), description),
    brand: cell("brand").slice(0, 80) || null,
    oem_or_aftermarket: null,
    photo_urls: splitImages(cell("photo_urls")),
    source_raw: JSON.stringify({ row: rowIndex, sku, csv_category: cell("category") || null }).slice(0, 4000),
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
      brand: FieldProvenance.SOURCE_CONFIRMED,
      photo_urls: FieldProvenance.SOURCE_CONFIRMED,
      category: FieldProvenance.AI_INFERRED,
      condition: FieldProvenance.AI_INFERRED,
    },
  };
}

/**
 * Inspect an uploaded CSV without staging anything: how many rows, which columns
 * were understood, which were ignored, and a small preview. Lets a business see
 * whether their export mapped correctly before committing to an import.
 */
export function previewCsv(text: string, previewRows = 5): Record<string, any> {
  const rows = parseCsv(text);
  if (!rows.length) return { ok: false, error: "The file appears to be empty." };
  const headers = rows[0].map((h) => String(h || "").trim());
  const { mapping, unmapped } = detectColumns(headers);
  if (mapping.title === undefined) {
    return {
      ok: false,
      error: "No product name column found. Include a column named Title, Name or Product.",
      headers,
    };
  }
  const dataRows = rows.slice(1).filter((r) => r.some((c) => String(c || "").trim() !== ""));
  return {
    ok: true,
    headers,
    mapped_fields: Object.keys(mapping),
    unmapped_columns: unmapped,
    total_rows: dataRows.length,
    has_price: mapping.price_cents !== undefined,
    preview: dataRows.slice(0, previewRows).map((r, i) => mapCsvRow(r, mapping, {}, i + 1)).filter(Boolean),
  };
}
