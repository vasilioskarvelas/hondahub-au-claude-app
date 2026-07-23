/**
 * Honda Hub — TrustScoreService shared award logic (Phase 01/03)
 *
 * Extracted so that other services (VehicleService.approveVerification,
 * PerformanceService.approveVerification) can award a trust signal to a
 * specific user (the vehicle owner — who may differ from the acting
 * moderator) WITHOUT duplicating TrustScoreService's write logic. This
 * shared module IS TrustScoreService's award method; callers invoke it
 * rather than touching TrustScore/TrustScoreEvent/User.account_tier
 * directly, preserving the Single-Writer Rule (TrustScoreService is the
 * sole writer of account_tier).
 *
 * Idempotent: re-awarding the same signal_type to the same user does not
 * double-award (checked via an existing TrustScoreEvent for that signal).
 */

import {
  AccountTier,
  SignalType,
  SIGNAL_DELTAS,
  NotificationType,
  computeTier,
  isTierPromotion,
} from "./identity.ts";
import { createNotification } from "./notifications.ts";

const SIGNAL_TYPE_VALUES = Object.values(SignalType);

export async function awardSignalToUser(
  base44: any,
  opts: { target_user_id: string; signal_type: string; reason: string; actor: string },
): Promise<{ ok: boolean; trust_score: any; already_awarded: boolean; tier_changed: boolean }> {
  const { target_user_id, signal_type, reason, actor } = opts;

  if (!target_user_id) {
    throw new Error("awardSignalToUser: target_user_id is required");
  }
  if (!SIGNAL_TYPE_VALUES.includes(signal_type as any)) {
    throw new Error(`awardSignalToUser: invalid signal_type ${signal_type}`);
  }

  // Find or create the target user's TrustScore.
  let scores = await base44.asServiceRole.entities.TrustScore.filter({ user_id: target_user_id });
  let trustScore: any;
  if (scores.length === 0) {
    trustScore = await base44.asServiceRole.entities.TrustScore.create({
      user_id: target_user_id,
      current_score: 0,
      current_tier: AccountTier.NEW_MEMBER,
    });
  } else {
    trustScore = scores[0];
  }

  // Idempotency: re-awarding an already-awarded signal does not double-award.
  const prior = await base44.asServiceRole.entities.TrustScoreEvent.filter({
    trust_score_id: trustScore.id,
    signal_type,
  });
  if (prior.length > 0) {
    return { ok: true, trust_score: trustScore, already_awarded: true, tier_changed: false };
  }

  const delta = SIGNAL_DELTAS[signal_type] || 0;
  await base44.asServiceRole.entities.TrustScoreEvent.create({
    trust_score_id: trustScore.id,
    signal_type,
    delta,
    reason: reason || signal_type,
    actor: actor || "system",
  });

  const newScore = (trustScore.current_score || 0) + delta;
  const oldTier = trustScore.current_tier || AccountTier.NEW_MEMBER;
  const newTier = computeTier(newScore);

  const updated = await base44.asServiceRole.entities.TrustScore.update(trustScore.id, {
    current_score: newScore,
    current_tier: newTier,
  });

  // Sync User.account_tier — TrustScoreService is the sole writer.
  await base44.asServiceRole.entities.User.update(target_user_id, { account_tier: newTier });

  // TrustTierChanged → NotificationService (positive changes only).
  if (newTier !== oldTier && isTierPromotion(oldTier, newTier)) {
    await createNotification(base44, {
      recipient_id: target_user_id,
      notification_type: NotificationType.TRUST_TIER_CHANGE,
      target_type: "user",
      target_id: target_user_id,
    });
  }

  return { ok: true, trust_score: updated, already_awarded: false, tier_changed: newTier !== oldTier };
}