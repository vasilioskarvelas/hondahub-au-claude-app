/**
 * Honda Hub — Garage shared module (Phase 03)
 *
 * Enums and helpers shared across the five Garage backend functions
 * (VehicleService, ModificationService, TimelineService, MaintenanceService,
 * PerformanceService). Mirrors the entity schemas in base44/entities/.
 *
 * Backend functions are Deno and cannot import from src/, so the enums are
 * re-declared here and validated against these arrays at write time.
 */

// ---- Vehicle enums ----
export const OWNERSHIP_RELATIONSHIP = ["current", "previous", "wishlist"];
export const BUILD_STATUS = ["stock", "project", "completed", "retired"];
export const SALE_STATUS = ["not_for_sale", "considering_offers", "for_sale", "sold"];
export const VEHICLE_VISIBILITY = ["public", "followers", "approved_connections", "private"];
export const REGISTRATION_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
export const BODY_STYLES = ["sedan", "hatchback", "coupe", "wagon", "suv", "ute", "convertible", "van", "other"];
export const DRIVETRAINS = ["fwd", "rwd", "awd", "4wd"];
export const FUEL_TYPES = ["petrol", "diesel", "hybrid", "electric", "lpg", "other"];

// ---- Modification enums ----
export const MOD_CATEGORIES = [
  "engine", "forced_induction", "fuel_system", "cooling", "intake", "exhaust",
  "ecu_electronics", "transmission", "drivetrain", "suspension", "brakes",
  "wheels_tyres", "exterior", "interior", "safety", "audio", "lighting", "other",
];
export const MOD_STATUS = ["planned", "ordered", "installed", "removed", "sold"];
export const INSTALLATION_TYPE = ["self", "workshop", "dealer", "friend", "unknown"];

// ---- TimelineEntry enums ----
export const ENTRY_TYPES = [
  "modification", "maintenance", "dyno_session", "track_day", "drag_result",
  "show_event", "ownership_milestone", "general_update",
];
export const TIMELINE_ORIGIN = ["manual", "system_generated"];

// ---- MaintenanceRecord enums ----
export const MAINTENANCE_TYPES = [
  "scheduled_service", "oil_change", "fluids", "brakes", "tyres", "suspension",
  "timing", "cooling", "electrical", "inspection", "repair", "recall", "other",
];
export const SERVICE_PROVIDER_TYPE = ["self", "business", "other"];
export const MAINTENANCE_STATUS = ["active", "removed_by_owner"];

// ---- PerformanceRecord enums ----
export const PERFORMANCE_TYPES = ["dyno", "quarter_mile", "eighth_mile", "zero_to_hundred", "lap_time", "top_speed", "other"];

// ---- Error envelope helper ----
export function err(code: string, status: number, details?: any) {
  return Response.json({ ok: false, error: { code, message: code, details: details || {} } }, { status });
}

// ---- Authorization helper ----
export function isModOrAdmin(user: any): boolean {
  return user?.role === "admin" ||
    user?.account_tier === "moderator" ||
    user?.account_tier === "admin";
}

// True if the caller is the owner of the given vehicle record.
export function isVehicleOwner(vehicle: any, user: any): boolean {
  return !!vehicle && !!user && vehicle.created_by_id === user.id;
}

// Fetch a vehicle and assert the caller owns it. Returns { vehicle } or null
// (callers respond with PERMISSION_DENIED / RESOURCE_NOT_FOUND).
export async function getOwnedVehicle(base44: any, vehicle_id: string, user: any): Promise<any | null> {
  if (!vehicle_id) return null;
  let vehicle: any;
  try {
    vehicle = await base44.asServiceRole.entities.Vehicle.get(vehicle_id);
  } catch {
    return null;
  }
  if (!isVehicleOwner(vehicle, user)) return null;
  return vehicle;
}

// ---- Validation helpers ----
export function inList(value: any, list: string[]): boolean {
  return typeof value === "string" && list.includes(value);
}

// Reject negative numbers on performance fields (plausibility check).
export function nonNegative(n: any): boolean {
  return typeof n === "number" && isFinite(n) && n >= 0;
}

// ---- Timeline suggestion builder ----
// A Modification/Maintenance/Performance event PROPOSES a timeline entry; the
// user must confirm via TimelineService.createFromConfirmedSuggestion() before
// it is published. This builder returns the proposed (unpersisted) suggestion.
export function buildTimelineSuggestion(opts: {
  vehicle_id: string;
  entry_type: string;
  entry_date: string;
  title: string;
  description?: string;
  linked_modification_id?: string;
  linked_maintenance_id?: string;
  linked_performance_id?: string;
}): any {
  return {
    origin: "system_generated",
    vehicle_id: opts.vehicle_id,
    entry_type: opts.entry_type,
    entry_date: opts.entry_date,
    title: opts.title,
    description: opts.description || "",
    linked_modification_id: opts.linked_modification_id || null,
    linked_maintenance_id: opts.linked_maintenance_id || null,
    linked_performance_id: opts.linked_performance_id || null,
    linked_post_id: null,
  };
}

// Map a Modification category to a readable timeline suggestion title.
export function modSuggestionTitle(category: string, brand?: string, product_name?: string): string {
  const label = category.replace(/_/g, " ");
  const product = [brand, product_name].filter(Boolean).join(" ");
  return product ? `${product} installed (${label})` : `Modification installed (${label})`;
}

// Map a maintenance_type to a readable label (used for generated titles + suggestions).
export function maintenanceLabel(maintenance_type: string): string {
  return maintenance_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Map a performance_type to a timeline entry_type.
export function performanceToEntryType(performance_type: string): string {
  if (performance_type === "dyno") return "dyno_session";
  if (["quarter_mile", "eighth_mile", "zero_to_hundred"].includes(performance_type)) return "drag_result";
  if (["lap_time", "top_speed"].includes(performance_type)) return "track_day";
  return "general_update";
}

// Enforce "at most one linked_* FK" on a TimelineEntry payload.
export function validateSingleLink(fields: any): string | null {
  const links = [
    fields.linked_modification_id,
    fields.linked_maintenance_id,
    fields.linked_performance_id,
    fields.linked_post_id,
  ].filter((v) => v !== undefined && v !== null && v !== "");
  if (links.length > 1) {
    return "at most one linked_* reference may be set per TimelineEntry";
  }
  return null;
}