import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { AccountTier, SignalType, computeTier, isTierPromotion } from "../../shared/identity.ts";
import { awardSignalToUser } from "../../shared/trust-score.ts";

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
      // Delegates to the shared TrustScoreService award logic (sole writer of
      // account_tier) — awards to the calling user here.
      const result = await awardSignalToUser(base44, {
        target_user_id: user.id,
        signal_type,
        reason: reason || signal_type,
        actor: actor || 'system',
      });
      return Response.json(result);
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
          await createNotification(base44, {
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