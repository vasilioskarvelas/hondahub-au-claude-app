import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { isValidHandle } from "../../shared/identity.ts";

/**
 * UserService (Phase 01) — identity/profile writes.
 * Actions:
 *   update       — self-only profile edit (handle/display_name/bio/location_general/phone/avatar_media_id/cover_media_id/last_active_at).
 *                  account_tier and account_status are NOT settable here.
 *   changeStatus — Moderator/Admin only; changes another user's account_status.
 *
 * Hard rules:
 *   - account_tier never settable via this function (TrustScoreService owns it).
 *   - handle uniqueness enforced service-layer (check-then-write), Base44 DB not confirmed to enforce natively.
 *   - handle character rules + reserved-word blocklist enforced.
 *   - bio length cap enforced server-side.
 */
const ALLOWED_PROFILE_FIELDS = [
  'handle', 'display_name', 'bio', 'location_general',
  'phone', 'avatar_media_id', 'cover_media_id', 'last_active_at',
];
const ACCOUNT_STATUS_VALUES = ['active', 'suspended', 'banned', 'deactivated_by_user', 'pending_deletion'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'AUTH_REQUIRED' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'update';

    if (action === 'update') {
      const update = {};
      for (const f of ALLOWED_PROFILE_FIELDS) {
        if (body[f] !== undefined) update[f] = body[f];
      }
      // Reject any attempt to set account_tier / account_status via this path.
      if (body.account_tier !== undefined || body.account_status !== undefined) {
        return Response.json({ error: 'PERMISSION_DENIED', details: { reason: 'account_tier/account_status not settable via profile update' } }, { status: 403 });
      }
      // Handle validation + uniqueness.
      if (update.handle !== undefined && update.handle !== user.handle) {
        if (!isValidHandle(update.handle)) {
          return Response.json({ error: 'VALIDATION_FAILED', details: { handle: 'invalid (3-20 chars, alphanumeric/underscore, not reserved)' } }, { status: 422 });
        }
        const others = await base44.asServiceRole.entities.User.filter({ handle: update.handle });
        if (others.some((u) => u.id !== user.id)) {
          return Response.json({ error: 'CONFLICT', details: { handle: 'taken' } }, { status: 409 });
        }
      }
      // Bio length cap.
      if (update.bio !== undefined && update.bio !== null && String(update.bio).length > 500) {
        return Response.json({ error: 'VALIDATION_FAILED', details: { bio: 'max 500 characters' } }, { status: 422 });
      }
      const updated = await base44.entities.User.update(user.id, update);
      return Response.json({ ok: true, user: updated });
    }

    if (action === 'changeStatus') {
      // Mod/Admin only (platform role admin OR account_tier moderator/admin).
      const isModOrAdmin = user.role === 'admin' ||
        user.account_tier === 'moderator' || user.account_tier === 'admin';
      if (!isModOrAdmin) {
        return Response.json({ error: 'PERMISSION_DENIED' }, { status: 403 });
      }
      const { target_user_id, account_status } = body;
      if (!ACCOUNT_STATUS_VALUES.includes(account_status)) {
        return Response.json({ error: 'VALIDATION_FAILED', details: { account_status: 'invalid' } }, { status: 422 });
      }
      if (!target_user_id) {
        return Response.json({ error: 'VALIDATION_FAILED', details: { target_user_id: 'required' } }, { status: 422 });
      }
      const updated = await base44.asServiceRole.entities.User.update(target_user_id, { account_status });
      return Response.json({ ok: true, user: updated });
    }

    return Response.json({ error: 'VALIDATION_FAILED', details: { action: 'unknown' } }, { status: 422 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});