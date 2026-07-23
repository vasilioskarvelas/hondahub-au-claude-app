// ADR-042 — category-attribute applicability mirror for the UI.
// Kept in sync with base44/shared/marketplace.ts applicableCategoryFields so
// the create form only renders (and only sends) fields that apply to the
// selected category, preventing a CATEGORY_FIELD_MISMATCH rejection.

export const OEM_OPTIONS = [
  { v: "oem", l: "OEM" },
  { v: "aftermarket", l: "Aftermarket" },
  { v: "not_applicable", l: "N/A" },
];
export const TESTED_OPTIONS = [
  { v: "compression_tested", l: "Compression tested" },
  { v: "leak_down_tested", l: "Leak-down tested" },
  { v: "running_when_removed", l: "Running when removed" },
  { v: "untested", l: "Untested" },
];
export const LOCK_OPTIONS = [
  { v: "locked", l: "Locked" },
  { v: "unlocked", l: "Unlocked" },
  { v: "not_applicable", l: "N/A" },
];

const DRIVETRAIN = ["engine", "transmission", "forced_induction"];
export const OEM_REQUIRED = [
  "engine", "transmission", "forced_induction", "wheels_tyres", "suspension",
  "brakes", "electronics", "performance_part",
];
const GENERIC = ["brand", "oem_or_aftermarket", "shipping_available", "pickup_available", "shipping_cost_cents"];
const WHEELS = ["wheel_diameter_inches", "wheel_width_inches", "wheel_offset_mm", "wheel_pcd", "wheel_quantity", "tyres_included", "tyre_tread_percentage"];
const DRIVETRAIN_FIELDS = ["component_kilometres", "tested_before_listing", "warranty_included"];
const ELECTRONICS = ["lock_status", "tuned"];

export const ATTR_FIELDS = [...GENERIC, ...WHEELS, ...DRIVETRAIN_FIELDS, ...ELECTRONICS];

export function applicableCategoryFields(category) {
  if (category === "vehicle") return [];
  const s = [...GENERIC];
  if (category === "wheels_tyres") s.push(...WHEELS);
  if (DRIVETRAIN.includes(category)) s.push(...DRIVETRAIN_FIELDS);
  if (category === "electronics") s.push(...ELECTRONICS);
  return s;
}

// Defaults for the boolean category attributes (ADR-042 §3 / §7).
export const DEFAULT_ATTRS = {
  shipping_available: false,
  pickup_available: true,
  tyres_included: false,
  warranty_included: false,
  tuned: false,
};

// Empty-string defaults for the textual/numeric category attributes — used to
// reset state when the category changes so no stale value is ever sent.
export const EMPTY_ATTRS = {
  brand: "",
  oem_or_aftermarket: "",
  shipping_cost: "",
  wheel_diameter_inches: "",
  wheel_width_inches: "",
  wheel_offset_mm: "",
  wheel_pcd: "",
  wheel_quantity: "",
  tyre_tread_percentage: "",
  component_kilometres: "",
  tested_before_listing: "",
  lock_status: "",
};