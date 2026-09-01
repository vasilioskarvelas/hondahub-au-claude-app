/**
 * Honda Hub — Garage frontend helpers (Phase 03)
 * Mirrors base44/shared/garage.ts enums for UI selects/badges and wraps the
 * backend-function invoke pattern so pages never write entities directly.
 */
import { base44 } from "@/api/base44Client";

export const OWNERSHIP_RELATIONSHIP = ["current", "previous", "wishlist"];
export const BUILD_STATUS = ["stock", "project", "completed", "retired"];
export const SALE_STATUS = ["not_for_sale", "considering_offers", "for_sale", "sold"];
export const VEHICLE_VISIBILITY = ["public", "followers", "approved_connections", "private"];
export const REGISTRATION_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
export const BODY_STYLES = ["sedan", "hatchback", "coupe", "wagon", "suv", "ute", "convertible", "van", "other"];
export const DRIVETRAINS = ["fwd", "rwd", "awd", "4wd"];
export const FUEL_TYPES = ["petrol", "diesel", "hybrid", "electric", "lpg", "other"];

export const MOD_CATEGORIES = [
  "engine", "forced_induction", "fuel_system", "cooling", "intake", "exhaust",
  "ecu_electronics", "transmission", "drivetrain", "suspension", "brakes",
  "wheels_tyres", "exterior", "interior", "safety", "audio", "lighting", "other",
];
export const MOD_STATUS = ["planned", "ordered", "installed", "removed", "sold"];
export const INSTALLATION_TYPE = ["self", "workshop", "dealer", "friend", "unknown"];

export const ENTRY_TYPES = [
  "modification", "maintenance", "dyno_session", "track_day", "drag_result",
  "show_event", "ownership_milestone", "general_update",
];

export const MAINTENANCE_TYPES = [
  "scheduled_service", "oil_change", "fluids", "brakes", "tyres", "suspension",
  "timing", "cooling", "electrical", "inspection", "repair", "recall", "other",
];
export const SERVICE_PROVIDER_TYPE = ["self", "business", "other"];

export const PERFORMANCE_TYPES = ["dyno", "quarter_mile", "eighth_mile", "zero_to_hundred", "lap_time", "top_speed", "other"];

// Invoke a Garage backend function and return its data payload.
export async function callGarage(service, payload) {
  const res = await base44.functions.invoke(service, payload);
  return res.data;
}

// Resolve a Media id to its file_url for display (Vehicle cover).
export async function resolveMediaUrl(mediaId) {
  if (!mediaId) return null;
  try {
    const res = await base44.functions.invoke("media", { action: "get", media_id: mediaId });
    return res.data?.media?.file_url || null;
  } catch {
    return null;
  }
}

export const pretty = (s) => (s ? String(s).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "");
export const vehicleLabel = (v) =>
  v?.nickname || [v?.year, v?.make, v?.model].filter(Boolean).join(" ") || "Untitled Vehicle";