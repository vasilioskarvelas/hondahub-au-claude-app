// ADR-044 — Marketplace listing wizard registries + step-completion logic.
// Step lists drive the wizard order for each flow; isStepComplete powers the
// "resume at first incomplete step" behaviour and the Next button gating.
import { OEM_REQUIRED } from "@/components/marketplace/categoryAttrs";

export const CATEGORIES = [
  { v: "vehicle", l: "Vehicle" },
  { v: "engine", l: "Engine" },
  { v: "transmission", l: "Transmission" },
  { v: "forced_induction", l: "Forced Induction" },
  { v: "wheels_tyres", l: "Wheels & Tyres" },
  { v: "suspension", l: "Suspension" },
  { v: "brakes", l: "Brakes" },
  { v: "electronics", l: "Electronics" },
  { v: "interior", l: "Interior" },
  { v: "exterior", l: "Exterior" },
  { v: "performance_part", l: "Performance Part" },
  { v: "tools_equipment", l: "Tools & Equipment" },
  { v: "other", l: "Other" },
];
export const PART_CATEGORIES = CATEGORIES.filter((c) => c.v !== "vehicle");
export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.v, c.l]));
export const CONDITIONS = [
  { v: "new", l: "New" },
  { v: "used", l: "Used" },
  { v: "for_parts_or_repair", l: "For parts or repair" },
];
export const PRICE_TYPES = [
  { v: "fixed", l: "Fixed" },
  { v: "negotiable", l: "Negotiable" },
  { v: "poa", l: "Price on ask" },
  { v: "free", l: "Free" },
  { v: "auction", l: "Auction" },
];

export const AUCTION_DURATIONS = [
  { v: 3, l: "3 days" },
  { v: 5, l: "5 days" },
  { v: 7, l: "7 days" },
];

export const VEHICLE_STEPS = ["type", "vehicle", "format", "photos", "video", "pricing", "location", "description", "review"];
export const PART_STEPS = ["type", "category", "details", "compatibility", "specs", "format", "photos", "video", "pricing", "shipping", "location", "description", "review"];

export const STEP_LABELS = {
  type: "What are you selling?",
  vehicle: "Your vehicle",
  category: "Category",
  details: "Part details",
  compatibility: "Compatibility",
  specs: "Additional specs",
  format: "Selling format",
  photos: "Photos",
  video: "Video",
  pricing: "Pricing",
  shipping: "Shipping & pickup",
  location: "Location",
  description: "Description",
  review: "Preview & publish",
};

export const inputCls = "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary";

export function isStepComplete(key, ctx) {
  switch (key) {
    case "type": return !!ctx.flow;
    case "vehicle": return !!ctx.primary_vehicle_id;
    case "category": return !!ctx.category && ctx.category !== "vehicle";
    case "details":
      if (!(ctx.title || "").trim()) return false;
      if (OEM_REQUIRED.includes(ctx.category) && !ctx.oem_or_aftermarket) return false;
      return true;
    case "format": return !!ctx.listing_type && !!ctx.price_type;
    case "pricing":
      if (ctx.price_type === "fixed" || ctx.price_type === "negotiable") {
        const p = Number(ctx.price);
        return ctx.price !== "" && !Number.isNaN(p) && p >= 0;
      }
      if (ctx.price_type === "auction") {
        const minBid = Number(ctx.auction_min_bid);
        return ctx.auction_min_bid !== "" && !Number.isNaN(minBid) && minBid > 0 && !!ctx.auction_duration_days;
      }
      return true;
    case "description":
      if (ctx.flow === "vehicle" && !(ctx.title || "").trim()) return false;
      return true;
    default: return true;
  }
}