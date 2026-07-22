import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  AccountTier,
  SignalType,
  SIGNAL_DELTAS,
  NotificationType,
  computeTier,
  isTierPromotion,
} from "../../shared/identity.ts";

/**
 * TrustScoreService (Phase 01) — the trust signal engine.
 * Actions:
 *   init  — idempotent baseline TrustScore creation for the current user (UserRegistered consumer).
 *   award — idempotent signal award (checks existing event before awarding; ContactMethodVerified consumer).
 *   recalc — recompute tier from current score (deterministic, idempotent).
 *
 * Hard rule: account_tier on User is written ONLY here (TrustScoreService), never by any other path.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'AUTH_REQUIRED' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'init';

    if (action === 'init') {
      const existing = await base44.entities.TrustScore.filter({ user_id: user.id });
      if (existing.length > 0) {
        return Response.json({ ok: true, trust_score: existing[0] });
      }
      const ts = await base44.entities.TrustScore.create({
        user_id: user.id,
        current_score: 0,
        current_tier: AccountTier.NEW_MEMBER,
      });
      return Response.json({ ok: true, trust_score: ts });
    }

    if (action === 'award') {
      const { signal_type, reason, actor } = body;
      if (!Object.values(SignalType).includes(signal_type)) {
        return Response.json({ error: 'VALIDATION_FAILED', details: { signal_type: 'invalid' } }, { status: 422 });
      }
      let scores = await base44.entities.TrustScore.filter({ user_id: user.id });
      let trustScore;
      if (scores.length === 0) {
        trustScore = await base44.entities.TrustScore.create({
          user_id: user.id, current_score: 0, current_tier: AccountTier.NEW_MEMBER,
        });
      } else {
        trustScore = scores[0];
      }
      // Idempotency: re-awarding an already-awarded signal does not double-award.
      const prior = await base44.entities.TrustScoreEvent.filter({
        trust_score_id: trustScore.id, signal_type,
      });
      if (prior.length > 0) {
        return Response.json({ ok: true, trust_score: trustScore, already_awarded: true });
      }
      const delta = SIGNAL_DELTAS[signal_type] || 0;
      await base44.entities.TrustScoreEvent.create({
        trust_score_id: trustScore.id,
        signal_type,
        delta,
        reason: reason || signal_type,
        actor: actor || 'system',
      });
      const newScore = (trustScore.current_score || 0) + delta;
      const oldTier = trustScore.current_tier || AccountTier.NEW_MEMBER;
      const newTier = computeTier(newScore);
      const updated = await base44.entities.TrustScore.update(trustScore.id, {
        current_score: newScore,
        current_tier: newTier,
      });
      // Sync User.account_tier — TrustScoreService is the sole writer.
      await base44.entities.User.update(user.id, { account_tier: newTier });
      // TrustTierChanged → NotificationService (positive changes only).
      if (newTier !== oldTier && isTierPromotion(oldTier, newTier)) {
        await base44.entities.Notification.create({
          recipient_id: user.id,
          notification_type: NotificationType.TRUST_TIER_CHANGE,
          target_type: 'user',
          target_id: user.id,
        });
      }
      return Response.json({ ok: true, trust_score: updated, tier_changed: newTier !== oldTier });
    }

    if (action === 'recalc') {
      let scores = await base44.entities.TrustScore.filter({ user_id: user.id });
      if (scores.length === 0) {
        const ts = await base44.entities.TrustScore.create({
          user_id: user.id, current_score: 0, current_tier: AccountTier.NEW_MEMBER,
        });
        return Response.json({ ok: true, trust_score: ts, tier_changed: false });
      }
      const trustScore = scores[0];
      const oldTier = trustScore.current_tier || AccountTier.NEW_MEMBER;
      const newTier = computeTier(trustScore.current_score || 0);
      if (newTier !== oldTier) {
        await base44.entities.TrustScore.update(trustScore.id, { current_tier: newTier });
        await base44.entities.User.update(user.id, { account_tier: newTier });
        if (isTierPromotion(oldTier, newTier)) {
          await base44.entities.Notification.create({
            recipient_id: user.id,
            notification_type: NotificationType.TRUST_TIER_CHANGE,
            target_type: 'user',
            target_id: user.id,
          });
        }
      }
      return Response.json({ ok: true, trust_score: { ...trustScore, current_tier: newTier }, tier_changed: newTier !== oldTier });
    }

    return Response.json({ error: 'VALIDATION_FAILED', details: { action: 'unknown' } }, { status: 422 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});