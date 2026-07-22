/**
 * Honda Hub — ReferenceResolverService shared module (Phase 02)
 *
 * Validates polymorphic (target_type, target_id) references against the
 * ReferenceTypes registry and an optional per-field allow-list, with a
 * best-effort existence check against the backing entity when one exists.
 *
 * Mirrors src/lib/registries.js ReferenceTypes — Deno backend functions
 * cannot import from src/.
 *
 * Existence is best-effort: reference types whose backing entity is not yet
 * built (Vehicle, Group, Business, ModerationCase, MarketplaceMessage,
 * BusinessReview) are type-validated only; their existence is enforced once
 * the backing entity lands in its phase.
 */

export const ReferenceTypes = Object.freeze({
  USER: "user",
  VEHICLE: "vehicle",
  POST: "post",
  COMMENT: "comment",
  GROUP: "group",
  EVENT: "event",
  BUSINESS: "business",
  LISTING: "listing",
  REPORT: "report",
  MODERATION_CASE: "moderation_case",
  MARKETPLACE_MESSAGE: "marketplace_message",
  BUSINESS_REVIEW: "business_review",
});

const REFERENCE_VALUES = Object.values(ReferenceTypes);

// Map of reference type → backing entity name (only types whose entity exists
// at this phase get an existence check; others are type-validated only).
const BACKING_ENTITY: Record<string, string | null> = {
  [ReferenceTypes.USER]: "User",
  [ReferenceTypes.POST]: "CommunityPost",
  [ReferenceTypes.COMMENT]: "Comment",
  [ReferenceTypes.EVENT]: "Event",
  [ReferenceTypes.LISTING]: "Listing",
  [ReferenceTypes.REPORT]: "Report",
  // Backing entity not yet built — type-validation only.
  [ReferenceTypes.VEHICLE]: null,
  [ReferenceTypes.GROUP]: null,
  [ReferenceTypes.BUSINESS]: null,
  [ReferenceTypes.MODERATION_CASE]: null,
  [ReferenceTypes.MARKETPLACE_MESSAGE]: null,
  [ReferenceTypes.BUSINESS_REVIEW]: null,
};

export function isReferenceType(value: string): boolean {
  return REFERENCE_VALUES.includes(value as any);
}

/**
 * Validate a polymorphic reference.
 * - target_type must be a known ReferenceTypes value.
 * - target_type must be in the field's allow-list (if provided).
 * - target_id must exist in the backing entity when one is built for that type.
 *
 * Returns { valid, error? }. Callers should reject the write when valid===false.
 */
export async function validateReference(
  base44: any,
  opts: { target_type?: string | null; target_id?: string | null; allowedTypes?: string[] },
): Promise<{ valid: boolean; error?: string }> {
  const { target_type, target_id, allowedTypes } = opts;

  if (!target_type) {
    // A null reference is a valid "no target".
    return { valid: true };
  }
  if (!isReferenceType(target_type)) {
    return { valid: false, error: `unknown target_type: ${target_type}` };
  }
  if (allowedTypes && allowedTypes.length > 0 && !allowedTypes.includes(target_type)) {
    return { valid: false, error: `target_type ${target_type} not allowed for this field` };
  }
  if (target_id) {
    const entityName = BACKING_ENTITY[target_type];
    if (entityName) {
      try {
        const entity = (base44.asServiceRole.entities as any)[entityName];
        if (entity && typeof entity.get === "function") {
          await entity.get(target_id);
        }
      } catch {
        return { valid: false, error: `target_id ${target_id} not found in ${entityName}` };
      }
    }
  }
  return { valid: true };
}