/**
 * Honda Hub — AI compatibility extraction tests (ADR-046 §7).
 *
 *   Run:  deno test base44/shared/compat-extract.test.ts
 *
 * Weighted heavily towards rejecting bad model output. A hallucinated chassis
 * code does not fail loudly — it puts a part on the wrong car and a buyer finds
 * out by fitting it. So the tests care far more about what gets thrown away than
 * about what gets through.
 */

import {
  validateCompatResult, deriveCompatStatus, buildCompatPrompt,
  COMPAT_MODELS, COMPAT_CHASSIS, COMPAT_ENGINES, LIKELY_THRESHOLD,
} from "./compat-extract.ts";
import { COMPATIBILITY_CONFIDENCE_THRESHOLD } from "./store-import.ts";

function eq(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(`${msg || "assertion failed"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function deepEq(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg || "assertion failed"}: expected ${b}, got ${a}`);
}

// --- rejecting invalid vocabulary ----------------------------------------------

Deno.test("drops values outside the ADR-043 vocabularies", () => {
  const r = validateCompatResult({
    fits_honda: true,
    models: ["civic", "supra", "skyline", "integra"],
    chassis_codes: ["ek", "r34", "ae86"],
    engine_families: ["b_series", "2jz", "rb26"],
    confidence: 90,
  })!;
  deepEq(r.compatible_models, ["civic", "integra"], "non-Honda models dropped");
  deepEq(r.compatible_chassis_codes, ["ek"], "invented chassis codes dropped");
  deepEq(r.compatible_engine_families, ["b_series"], "foreign engines dropped");
});

Deno.test("normalises case and removes duplicates", () => {
  const r = validateCompatResult({
    fits_honda: true, models: ["CIVIC", "civic", " Civic "], chassis_codes: ["EK"], confidence: 80,
  })!;
  deepEq(r.compatible_models, ["civic"]);
  deepEq(r.compatible_chassis_codes, ["ek"]);
});

Deno.test("handles non-array and junk vocabulary fields without throwing", () => {
  const r = validateCompatResult({
    fits_honda: true, models: "civic", chassis_codes: null, engine_families: [null, 42, {}], confidence: 50,
  })!;
  deepEq(r.compatible_models, [], "a string is not an array of models");
  deepEq(r.compatible_chassis_codes, []);
  deepEq(r.compatible_engine_families, []);
});

// --- confidence and years -------------------------------------------------------

Deno.test("clamps confidence into 0-100", () => {
  eq(validateCompatResult({ fits_honda: true, confidence: 150 })!.compatibility_confidence_score, 100);
  eq(validateCompatResult({ fits_honda: true, confidence: -20 })!.compatibility_confidence_score, 0);
  eq(validateCompatResult({ fits_honda: true, confidence: "not a number" })!.compatibility_confidence_score, 0);
  eq(validateCompatResult({ fits_honda: true })!.compatibility_confidence_score, 0, "absent confidence is zero, not assumed");
});

Deno.test("rejects implausible and reversed year ranges", () => {
  const bad = validateCompatResult({ fits_honda: true, models: ["civic"], year_from: 1850, year_to: 3000, confidence: 90 })!;
  eq(bad.compatible_year_from, null);
  eq(bad.compatible_year_to, null);
  const reversed = validateCompatResult({ fits_honda: true, models: ["civic"], year_from: 2005, year_to: 1999, confidence: 90 })!;
  eq(reversed.compatible_year_from, null, "a reversed range is a misread, not a fact");
  eq(reversed.compatible_year_to, null);
  const good = validateCompatResult({ fits_honda: true, models: ["civic"], year_from: 2001, year_to: 2005, confidence: 90 })!;
  eq(good.compatible_year_from, 2001);
  eq(good.compatible_year_to, 2005);
});

// --- status derivation ----------------------------------------------------------

Deno.test("confidence alone never earns a compatible status", () => {
  // A model returning "95% confident, fits nothing in particular" is describing
  // a universal-fit product. Presenting that as a confident Honda match would be
  // the exact failure that puts a wrong part on someone's car.
  eq(
    deriveCompatStatus({ fits_honda: true, models: [], chassis_codes: [], engine_families: [], confidence: 95 }),
    "unknown",
  );
});

Deno.test("status follows confidence once a specific fitment exists", () => {
  const base = { fits_honda: true, models: ["civic"], chassis_codes: [], engine_families: [] };
  eq(deriveCompatStatus({ ...base, confidence: COMPATIBILITY_CONFIDENCE_THRESHOLD }), "compatible");
  eq(deriveCompatStatus({ ...base, confidence: COMPATIBILITY_CONFIDENCE_THRESHOLD - 1 }), "likely_compatible");
  eq(deriveCompatStatus({ ...base, confidence: LIKELY_THRESHOLD }), "likely_compatible");
  eq(deriveCompatStatus({ ...base, confidence: LIKELY_THRESHOLD - 1 }), "unknown");
});

Deno.test("a non-Honda product is incompatible and carries no fitment", () => {
  eq(
    deriveCompatStatus({ fits_honda: false, models: ["civic"], chassis_codes: [], engine_families: [], confidence: 99 }),
    "incompatible",
  );
  const r = validateCompatResult({ fits_honda: false, models: ["civic"], chassis_codes: ["ek"], confidence: 99 })!;
  deepEq(r.compatible_models, [], "storing fitment on a non-Honda product would be a contradiction");
  deepEq(r.compatible_chassis_codes, []);
  eq(r.honda_compatibility_status, "incompatible");
});

// --- unusable replies -----------------------------------------------------------

Deno.test("returns null for a reply we cannot trust", () => {
  // Null means "leave the item as it was" — better than overwriting good data.
  eq(validateCompatResult(null), null);
  eq(validateCompatResult("nope"), null);
  eq(validateCompatResult({}), null, "no fits_honda");
  eq(validateCompatResult({ fits_honda: "yes" }), null, "fits_honda must be a real boolean");
});

// --- a realistic pass -----------------------------------------------------------

Deno.test("accepts a well-formed extraction", () => {
  const r = validateCompatResult({
    fits_honda: true,
    models: ["civic"], chassis_codes: ["ek", "eg"], engine_families: ["b_series"],
    year_from: 1992, year_to: 2000, confidence: 92,
    reasoning: "Title lists EG/EK Civic B-series application.",
  })!;
  eq(r.honda_compatibility_status, "compatible");
  eq(r.compatibility_confidence_score, 92);
  deepEq(r.compatible_chassis_codes, ["ek", "eg"]);
  eq(r.reasoning?.startsWith("Title lists"), true);
});

Deno.test("every vocabulary value survives validation", () => {
  // Guards against a typo in the module's own lists silently discarding values
  // the entity schema does allow.
  const r = validateCompatResult({
    fits_honda: true, models: COMPAT_MODELS, chassis_codes: COMPAT_CHASSIS,
    engine_families: COMPAT_ENGINES, confidence: 100,
  })!;
  eq(r.compatible_models.length, COMPAT_MODELS.length);
  eq(r.compatible_chassis_codes.length, COMPAT_CHASSIS.length);
  eq(r.compatible_engine_families.length, COMPAT_ENGINES.length);
});

// --- prompt ---------------------------------------------------------------------

Deno.test("prompt carries the product and instructs against guessing", () => {
  const p = buildCompatPrompt({ title: "Skunk2 Intake Manifold", brand: "Skunk2", description: "For B-series." });
  eq(p.includes("Skunk2 Intake Manifold"), true);
  eq(p.includes("For B-series."), true);
  eq(p.toLowerCase().includes("do not guess"), true, "must tell the model not to invent fitment");
});

Deno.test("prompt tolerates a sparse item", () => {
  const p = buildCompatPrompt({ title: "Part" });
  eq(typeof p, "string");
  eq(p.includes("Part"), true);
});
