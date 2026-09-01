/**
 * Honda Hub — Business Store Import shared module (ADR-046 Phase 1).
 *
 * Registries + the Phase 1 feature-flag gate, shared by StoreConnectorService
 * and the admin UI. Phase 1 is ADMIN-ONLY: the feature flag is
 * `requireStoreImportAdmin` — frontend nav hiding is supplemental only and
 * never the security boundary.
 *
 * Sync state lives on BusinessStoreConnection (Decision 2); JobStatus stays the
 * append-only terminal execution log. The import creation path (Section 8)
 * derives the poster server-side from BusinessStoreConnection → Business →
 * active owner BusinessMembership — never from the request body (Decision 1).
 */
import { err } from "./http.ts";

export const StorePlatform = Object.freeze({
  SHOPIFY: "shopify",
  WOOCOMMERCE: "woocommerce",
});
export const STORE_PLATFORM_VALUES = Object.values(StorePlatform);

export const ConnectionStatus = Object.freeze({
  UNVERIFIED: "unverified",
  VERIFIED: "verified",
  DISCONNECTED: "disconnected",
});
export const CONNECTION_STATUS_VALUES = Object.values(ConnectionStatus);

export const SyncStatus = Object.freeze({
  IDLE: "idle",
  SYNCING: "syncing",
  PAUSED: "paused",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
  FAILED: "failed",
});
export const SYNC_STATUS_VALUES = Object.values(SyncStatus);

export const ImportItemStatus = Object.freeze({
  PENDING: "pending",
  EXTRACTING: "extracting",
  READY_FOR_APPROVAL: "ready_for_approval",
  NEEDS_ATTENTION: "needs_attention",
  POSSIBLE_DUPLICATE: "possible_duplicate",
  APPROVED: "approved",
  REJECTED: "rejected",
  FAILED: "failed",
});
export const IMPORT_ITEM_STATUS_VALUES = Object.values(ImportItemStatus);

export const FieldProvenance = Object.freeze({
  SOURCE_CONFIRMED: "source_confirmed",
  AI_INFERRED: "ai_inferred",
  BUSINESS_CONFIRMED: "business_confirmed",
  BUSINESS_EDITED: "business_edited",
});
export const FIELD_PROVENANCE_VALUES = Object.values(FieldProvenance);

export const HondaCompatibilityStatus = Object.freeze({
  COMPATIBLE: "compatible",
  LIKELY_COMPATIBLE: "likely_compatible",
  UNKNOWN: "unknown",
  INCOMPATIBLE: "incompatible",
});
export const HONDA_COMPATIBILITY_STATUS_VALUES = Object.values(HondaCompatibilityStatus);

export const DuplicateMatchMethod = Object.freeze({
  EXTERNAL_ID: "external_id",
  SKU: "sku",
  MANUFACTURER_PART_NUMBER: "manufacturer_part_number",
  CANONICAL_URL: "canonical_url",
  AI_SIMILARITY: "ai_similarity",
});
export const DUPLICATE_MATCH_METHOD_VALUES = Object.values(DuplicateMatchMethod);

// ADR-046 §7: compatibility confidence threshold (0–100). Configurable; 85 is
// the Phase 1 default. >= threshold → compatible; below → needs attention.
export const COMPATIBILITY_CONFIDENCE_THRESHOLD = 85;

// ADR-046 §11: per-sync safety caps (enforced at the fetch layer, Section 4).
export const SYNC_MAX_PRODUCTS = 500;
export const SYNC_FETCH_TIMEOUT_MS = 15000;
export const SYNC_MAX_REDIRECTS = 3;
export const SYNC_BATCH_SIZE = 25;

/**
 * requireStoreImportAdmin — the Phase 1 feature-flag gate. Returns null when
 * the caller is an admin (the feature flag), or an error Response otherwise.
 * Every StoreConnectorService action MUST call this first. This is the
 * security boundary; RLS (admin-only on both entities) is defense in depth.
 */
export function requireStoreImportAdmin(user: any): Response | null {
  if (!user) return err("AUTH_REQUIRED", 401);
  if (user.role !== "admin") return err("PERMISSION_DENIED", 403, { reason: "admin only" });
  return null;
}