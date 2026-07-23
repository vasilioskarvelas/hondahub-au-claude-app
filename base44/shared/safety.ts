/**
 * Honda Hub — SafetyService shared module (Phase 02/05/08)
 *
 * Block-list enforcement. isBlockedEitherDirection() checks the UserBlock
 * entity for a block in EITHER direction (A blocked B, or B blocked A) and
 * is the single seam every cross-user interaction uses:
 *  - Phase 04 SocialService.canInteract() before followTarget().
 *  - Phase 08 MarketplaceService before startConversation() / sendMessage().
 *
 * A block prevents NEW conversations and new messages, but existing
 * conversation history stays fully visible to both parties (Phase 08 §safety).
 * Block rows are the source of truth: existence = blocked; deletion = unblock.
 */

export interface InteractionResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check whether a block exists in EITHER direction between two users.
 * Returns true if A→B or B→A is blocked. Symmetric.
 */
export async function isBlockedEitherDirection(
  base44: any,
  userAId: string,
  userBId: string,
): Promise<boolean> {
  if (!userAId || !userBId || userAId === userBId) return false;
  try {
    const blocks = await base44.asServiceRole.entities.UserBlock.filter({
      blocker_id: { $in: [userAId, userBId] },
      blocked_user_id: { $in: [userAId, userBId] },
    });
    return blocks.some((b: any) =>
      (b.blocker_id === userAId && b.blocked_user_id === userBId) ||
      (b.blocker_id === userBId && b.blocked_user_id === userAId),
    );
  } catch {
    return false;
  }
}

/**
 * Phase 04 seam: can a user interact with a (possibly polymorphic) target?
 * Resolves a vehicle/business target to its owning user before the block check.
 * A block in either direction rejects the interaction.
 */
export async function canInteract(
  base44: any,
  actorId: string,
  targetType: string,
  targetId: string,
): Promise<InteractionResult> {
  let targetUserId: string | null = null;
  if (targetType === "user") {
    targetUserId = targetId;
  } else if (targetType === "vehicle" || targetType === "business") {
    // Resolve the owning user of the vehicle/business.
    try {
      const entityName = targetType === "vehicle" ? "Vehicle" : "Business";
      const record = await base44.asServiceRole.entities[entityName].get(targetId);
      targetUserId = record.created_by_id || record.owner_id || null;
    } catch {
      return { allowed: true };
    }
  } else {
    return { allowed: true };
  }
  if (!targetUserId) return { allowed: true };
  const blocked = await isBlockedEitherDirection(base44, actorId, targetUserId);
  return blocked ? { allowed: false, reason: "blocked" } : { allowed: true };
}

// ---- UserBlock CRUD helpers (exposed so SocialService / a future Settings
//      page can create/remove blocks without touching the entity directly). ----

export async function createBlock(base44: any, blockerId: string, blockedId: string) {
  if (!blockerId || !blockedId || blockerId === blockedId) {
    throw new Error("createBlock: invalid blocker/blocked");
  }
  const existing = await base44.asServiceRole.entities.UserBlock.filter({
    blocker_id: blockerId, blocked_user_id: blockedId,
  });
  if (existing.length > 0) return existing[0];
  return await base44.asServiceRole.entities.UserBlock.create({
    blocker_id: blockerId, blocked_user_id: blockedId,
  });
}

export async function removeBlock(base44: any, blockerId: string, blockedId: string) {
  const existing = await base44.asServiceRole.entities.UserBlock.filter({
    blocker_id: blockerId, blocked_user_id: blockedId,
  });
  for (const b of existing) {
    await base44.asServiceRole.entities.UserBlock.delete(b.id);
  }
  return { ok: true, removed: existing.length };
}