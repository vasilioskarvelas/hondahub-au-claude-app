/**
 * Honda Hub — CSV import tests.
 *
 *   Run:  deno test base44/shared/csv-import.test.ts
 *
 * Weighted towards the parser, because a CSV parser that mishandles quoting
 * corrupts exactly the data product catalogues carry: descriptions with commas,
 * quoted fields spanning newlines, and escaped quotes in part names.
 */

import { parseCsv, detectColumns, mapCsvRow, previewCsv } from "./csv-import.ts";

function eq(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(`${msg || "assertion failed"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function deepEq(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg || "assertion failed"}: expected ${b}, got ${a}`);
}

// --- parser --------------------------------------------------------------------

Deno.test("parseCsv handles a plain file", () => {
  deepEq(parseCsv("a,b,c\n1,2,3"), [["a", "b", "c"], ["1", "2", "3"]]);
});

Deno.test("parseCsv keeps commas inside quoted fields", () => {
  // The classic corruption: a description containing a comma.
  deepEq(
    parseCsv('title,description\n"Brake Kit","Front, rear and handbrake"'),
    [["title", "description"], ["Brake Kit", "Front, rear and handbrake"]],
  );
});

Deno.test("parseCsv handles escaped quotes and embedded newlines", () => {
  deepEq(
    parseCsv('name,note\n"14"" Wheel","line one\nline two"'),
    [["name", "note"], ['14" Wheel', "line one\nline two"]],
  );
});

Deno.test("parseCsv handles CRLF and a trailing newline", () => {
  deepEq(parseCsv("a,b\r\n1,2\r\n"), [["a", "b"], ["1", "2"]]);
});

Deno.test("parseCsv strips the Excel BOM", () => {
  deepEq(parseCsv("﻿title,price\nBattery,99"), [["title", "price"], ["Battery", "99"]]);
});

Deno.test("parseCsv preserves empty cells rather than collapsing columns", () => {
  deepEq(parseCsv("a,b,c\n1,,3"), [["a", "b", "c"], ["1", "", "3"]]);
});

// --- column detection ----------------------------------------------------------

Deno.test("detectColumns maps common header spellings", () => {
  const { mapping } = detectColumns(["Product Name", "Description", "Price", "SKU", "Brand", "Image URL"]);
  eq(mapping.title, 0);
  eq(mapping.description, 1);
  eq(mapping.price_cents, 2);
  eq(mapping.sku, 3);
  eq(mapping.brand, 4);
  eq(mapping.photo_urls, 5);
});

Deno.test("detectColumns is insensitive to case, spaces and punctuation", () => {
  const { mapping } = detectColumns(["product_name", "RETAIL PRICE", "Stock-Code"]);
  eq(mapping.title, 0);
  eq(mapping.price_cents, 1);
  eq(mapping.sku, 2);
});

Deno.test("detectColumns reports unrecognised columns instead of dropping them silently", () => {
  const { mapping, unmapped } = detectColumns(["Title", "Price", "Warehouse Bay", "Supplier Notes"]);
  eq(mapping.title, 0);
  deepEq(unmapped, ["Warehouse Bay", "Supplier Notes"]);
});

Deno.test("detectColumns keeps the first of duplicate columns", () => {
  const { mapping, unmapped } = detectColumns(["Title", "Name"]);
  eq(mapping.title, 0, "first match wins");
  deepEq(unmapped, ["Name"]);
});

// --- row mapping ---------------------------------------------------------------

const CONN = { id: "conn_1", business_id: "biz_1" };

// mapCsvRow returns null for unusable rows; these cases expect a mapped row,
// so assert that rather than silencing the type.
function mustMap(row: string[], mapping: Record<string, number>, conn: any, i: number): Record<string, any> {
  const m = mapCsvRow(row, mapping, conn, i);
  if (!m) throw new Error("expected a mapped row, got null");
  return m;
}

Deno.test("mapCsvRow maps a typical product row", () => {
  const headers = ["Title", "Description", "Price", "SKU", "Brand", "Image"];
  const { mapping } = detectColumns(headers);
  const m = mustMap(
    ["Optima Red Top Battery", "High performance AGM", "429.95", "OPT-34RT", "Optima", "https://x/img.jpg"],
    mapping, CONN, 1,
  );
  eq(m.title, "Optima Red Top Battery");
  eq(m.price_cents, 42995);
  eq(m.sku, "OPT-34RT");
  eq(m.brand, "Optima");
  eq(m.category, "electronics");
  eq(m.business_id, "biz_1");
  deepEq(m.photo_urls, ["https://x/img.jpg"]);
});

Deno.test("mapCsvRow strips currency symbols and thousands separators from price", () => {
  const { mapping } = detectColumns(["Title", "Price"]);
  eq(mustMap(["Turbo", "$1,299.00"], mapping, CONN, 1).price_cents, 129900);
  eq(mustMap(["Turbo", "AUD 89.95"], mapping, CONN, 1).price_cents, 8995);
});

Deno.test("mapCsvRow falls back for a missing id, so duplicate detection still works", () => {
  const { mapping } = detectColumns(["Title", "SKU"]);
  eq(mustMap(["Coilovers", "BC-001"], mapping, CONN, 4).external_id, "BC-001", "SKU is the fallback id");
  const noSku = detectColumns(["Title"]).mapping;
  eq(mustMap(["Coilovers"], noSku, CONN, 4).external_id, "row-4", "row position is the last resort");
});

Deno.test("mapCsvRow skips rows with no product name", () => {
  const { mapping } = detectColumns(["Title", "Price"]);
  eq(mapCsvRow(["", "9.99"], mapping, CONN, 1), null, "blank title");
  eq(mapCsvRow(["   ", "9.99"], mapping, CONN, 1), null, "whitespace title");
});

Deno.test("mapCsvRow does not fabricate compatibility", () => {
  const { mapping } = detectColumns(["Title"]);
  const m = mustMap(["Random Part"], mapping, CONN, 1);
  deepEq(m.compatible_models, []);
  eq(m.compatibility_confidence_score, null);
  eq(m.honda_compatibility_status, "unknown");
});

Deno.test("mapCsvRow only accepts http(s) image URLs", () => {
  const { mapping } = detectColumns(["Title", "Image"]);
  deepEq(mustMap(["X", "not-a-url"], mapping, CONN, 1).photo_urls, []);
  deepEq(
    mustMap(["X", "https://a/1.jpg | https://a/2.jpg"], mapping, CONN, 1).photo_urls,
    ["https://a/1.jpg", "https://a/2.jpg"],
    "multi-image cells split",
  );
});

// --- preview -------------------------------------------------------------------

Deno.test("previewCsv summarises a good file without staging anything", () => {
  const p = previewCsv('Title,Price,Bay\n"Battery",129.95,A1\n"Rotor",89,B2\n');
  eq(p.ok, true);
  eq(p.total_rows, 2);
  eq(p.has_price, true);
  deepEq(p.unmapped_columns, ["Bay"]);
  eq(p.preview.length, 2);
  eq(p.preview[0].title, "Battery");
});

Deno.test("previewCsv refuses a file with no product name column", () => {
  const p = previewCsv("Price,SKU\n10,ABC");
  eq(p.ok, false);
  eq(String(p.error).includes("No product name column"), true);
});

Deno.test("previewCsv rejects an empty file", () => {
  eq(previewCsv("").ok, false);
});

Deno.test("previewCsv ignores blank trailing rows", () => {
  const p = previewCsv("Title,Price\nBattery,99\n\n\n");
  eq(p.total_rows, 1, "blank lines must not count as products");
});
