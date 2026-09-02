/**
 * Honda Hub — AI compatibility extraction (ADR-046 §7).
 *
 * Works out which Hondas a staged product fits, from its title and description,
 * and fills the ADR-043 compatibility arrays.
 *
 * Two things this module takes seriously:
 *
 * 1. **The model may only choose from fixed vocabularies.** Everything it
 *    returns is filtered against the ADR-043 enums and anything unrecognised is
 *    dropped, not stored. A hallucinated chassis code would put a part on the
 *    wrong car, and a buyer would find out by fitting it.
 *
 * 2. **Confidence is a self-report, not a probability.** A model saying "90"
 *    does not mean it is right nine times in ten; it is a rough signal used only
 *    to decide whether an item goes to the reviewer flagged or unflagged. It
 *    NEVER approves anything. Every imported product still passes a human before
 *    it can be listed, and this module cannot change that.
 *
 * Pure: prompt construction, validation and status derivation only. The LLM call
 * lives in the service layer.
 */

import { COMPATIBILITY_CONFIDENCE_THRESHOLD, HondaCompatibilityStatus } from "./store-import.ts";

// ADR-043 vocabularies. These MUST mirror StoreImportItem / MarketplaceListing;
// a value outside them fails entity validation on write.
export const COMPAT_MODELS = ["civic", "integra", "accord", "crv", "s2000", "nsx", "other"];
export const COMPAT_CHASSIS = ["eg", "ek", "dc2", "dc5", "ep3", "fn2", "cl7", "cl9", "fd2", "fk8", "fl5", "other"];
export const COMPAT_ENGINES = ["d_series", "b_series", "k_series", "j_series", "f_series", "h_series", "other"];

/** Above this, an item is confident enough to reach the reviewer unflagged. */
export const LIKELY_THRESHOLD = 50;
/** Batch size for extraction runs — each item is one LLM call. */
export const COMPAT_BATCH = 10;

/** Schema constraining the model's reply. Enums are enforced again on our side. */
export const COMPAT_SCHEMA = {
  type: "object",
  properties: {
    fits_honda: {
      type: "boolean",
      description: "True if this part CAN be fitted to a Honda — including universal parts that fit many cars. False ONLY when the part is specific to another make (a Holden manifold, a Ford strut, an RX-7 rotor housing).",
    },
    is_universal: {
      type: "boolean",
      description: "True for parts with no specific vehicle application — a universal intercooler, a generic oil catch can, tools and fluids. These still belong on a Honda marketplace.",
    },
    models: { type: "array", items: { type: "string", enum: COMPAT_MODELS } },
    chassis_codes: { type: "array", items: { type: "string", enum: COMPAT_CHASSIS } },
    engine_families: { type: "array", items: { type: "string", enum: COMPAT_ENGINES } },
    year_from: { type: "number" },
    year_to: { type: "number" },
    oem_or_aftermarket: {
      type: "string",
      enum: ["oem", "aftermarket", "not_applicable"],
      description: "oem for genuine Honda parts, aftermarket for third-party brands (AEM, Skunk2, HKS...), not_applicable for fluids, tools and consumables. Omit if genuinely unclear.",
    },
    confidence: { type: "number", description: "0-100. How certain the fitment is from the text ALONE." },
    reasoning: { type: "string", description: "One short sentence citing the wording relied on." },
  },
  required: ["fits_honda", "confidence"],
};

export const OEM_VALUES = ["oem", "aftermarket", "not_applicable"];

export function buildCompatPrompt(item: { title?: string; description?: string | null; brand?: string | null }): string {
  return [
    "You identify which Honda vehicles an aftermarket or OEM car part fits.",
    "",
    "Rules:",
    "- Use ONLY what the text states or clearly implies. Do not use outside knowledge to widen fitment.",
    "- If the text does not say which Hondas it fits, return empty arrays and a LOW confidence. Do not guess.",
    "- fits_honda=false ONLY when the part is specific to another make — a Holden manifold, a Ford",
    "  strut, an RX-7 rotor housing. Those do not belong on a Honda marketplace.",
    "- is_universal=true for parts with no specific vehicle application: a universal intercooler,",
    "  a generic catch can, tools, fluids. Those DO belong here, so set fits_honda=true as well,",
    "  leave the arrays empty, and give a HIGH confidence — you are confident it is universal.",
    "- Chassis codes: eg/ek are Civic generations, dc2/dc5 Integra, ep3/fn2/fk8/fl5 Civic Type R,",
    "  cl7/cl9 Accord Euro, fd2 Civic Type R sedan.",
    "- Engine families: b_series, d_series, k_series, j_series, f_series, h_series.",
    "- confidence reflects certainty from the TEXT ALONE. An explicit model listing is high;",
    "  an inference from an engine code alone is moderate; a guess from the brand is low.",
    "",
    `TITLE: ${String(item?.title || "").slice(0, 200)}`,
    item?.brand ? `BRAND: ${String(item.brand).slice(0, 80)}` : "",
    `DESCRIPTION: ${String(item?.description || "").slice(0, 2000)}`,
  ].filter(Boolean).join("\n");
}

/** Keep only values in the allowed vocabulary; deduplicate; bound the length. */
function cleanEnumArray(values: unknown, allowed: string[]): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const v of values) {
    const s = String(v ?? "").trim().toLowerCase();
    if (allowed.includes(s) && !out.includes(s)) out.push(s);
  }
  return out.slice(0, allowed.length);
}

function cleanYear(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isInteger(n)) return null;
  // Honda's first car was 1963; anything outside a sane window is a bad read.
  return n >= 1963 && n <= 2100 ? n : null;
}

function cleanConfidence(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Derive the stored compatibility status from a validated result.
 *
 * Deliberately asymmetric: high confidence WITH a specific fitment earns
 * `compatible`, but confidence alone never does. A model that returns
 * "confidence 95, fits nothing in particular" describes a universal-fit product,
 * not a confident Honda match, and must not be presented as one.
 */
export function deriveCompatStatus(result: {
  fits_honda: boolean;
  models: string[];
  chassis_codes: string[];
  engine_families: string[];
  confidence: number;
  is_universal?: boolean;
}): string {
  if (!result.fits_honda) return HondaCompatibilityStatus.INCOMPATIBLE;
  // A universal part is the one case where empty arrays are not a gap: it fits
  // Hondas precisely BECAUSE it has no specific application. Treating it as
  // unknown would strand generic intercoolers and catch cans in the review
  // queue forever, alongside parts that genuinely belong to another make.
  const hasFitment = result.models.length > 0 || result.chassis_codes.length > 0 || result.engine_families.length > 0;
  if (!hasFitment && !result.is_universal) return HondaCompatibilityStatus.UNKNOWN;
  if (result.confidence >= COMPATIBILITY_CONFIDENCE_THRESHOLD) return HondaCompatibilityStatus.COMPATIBLE;
  if (result.confidence >= LIKELY_THRESHOLD) return HondaCompatibilityStatus.LIKELY_COMPATIBLE;
  return HondaCompatibilityStatus.UNKNOWN;
}

/**
 * Validate a raw model reply into the fields we are willing to store.
 * Returns null when the reply is unusable, so the caller leaves the item alone
 * rather than overwriting good data with nothing.
 */
export function validateCompatResult(raw: any): Record<string, any> | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.fits_honda !== "boolean") return null;

  const models = cleanEnumArray(raw.models, COMPAT_MODELS);
  const chassis = cleanEnumArray(raw.chassis_codes, COMPAT_CHASSIS);
  const engines = cleanEnumArray(raw.engine_families, COMPAT_ENGINES);
  const confidence = cleanConfidence(raw.confidence);
  let yearFrom = cleanYear(raw.year_from);
  let yearTo = cleanYear(raw.year_to);
  // A reversed range is a misread, not a fact about the product.
  if (yearFrom !== null && yearTo !== null && yearFrom > yearTo) { yearFrom = null; yearTo = null; }

  const cleaned = {
    fits_honda: raw.fits_honda,
    models, chassis_codes: chassis, engine_families: engines,
    confidence,
    is_universal: raw.is_universal === true,
  };
  const status = deriveCompatStatus(cleaned);

  // For a product that does not fit a Honda, storing a fitment would be worse
  // than storing none: clear the arrays rather than keeping a contradiction.
  // ADR-042 requires oem_or_aftermarket on 8 of the 12 categories, and an import
  // always leaves it null — so without a value here nothing can be approved.
  // Suggested, never assumed: an unrecognised or absent reply stays null and the
  // reviewer picks it, rather than a part being labelled genuine when it is not.
  const oem = OEM_VALUES.includes(String(raw.oem_or_aftermarket || "").trim().toLowerCase())
    ? String(raw.oem_or_aftermarket).trim().toLowerCase()
    : null;

  const keep = raw.fits_honda;
  return {
    oem_or_aftermarket: oem,
    compatible_models: keep ? models : [],
    compatible_chassis_codes: keep ? chassis : [],
    compatible_engine_families: keep ? engines : [],
    compatible_year_from: keep ? yearFrom : null,
    compatible_year_to: keep ? yearTo : null,
    compatibility_confidence_score: confidence,
    honda_compatibility_status: status,
    reasoning: typeof raw.reasoning === "string" ? raw.reasoning.slice(0, 300) : null,
  };
}
