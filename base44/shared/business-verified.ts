/**
 * Honda Hub — BusinessVerified consumer wiring (Phase 07, §11.1)
 *
 * The BusinessVerified event's consumers. When a Business is verified:
 *   1. Awards the business_verified trust signal to every User holding an
 *      active owner/manager BusinessMembership on this Business (not just one
 *      person — verification reflects on the business entity itself).
 *   2. Notifies all BusinessMembership holders.
 *   3. Writes an AuditLog entry (business_status_changed).
 *
 * BusinessService.approveVerification calls this shared method — it is the
 * single consumer path, so the Single-Writer Rule (TrustScoreService is the
 * sole writer of account_tier) is preserved (awardSignalToUser delegates to
 * TrustScoreService). Idempotent: re-approving an already-verified business
 * does not double-award trust (awardSignalToUser is idempotent).
 */

import { awardSignalToUser } from "./trust-score.ts";
import { SignalType } from "./identity.ts";
import { createNotification } from "./notifications.ts";
import { NotificationType } from "./identity.ts";
import { writeAuditLog } from "./audit-log.ts";
import { AuditActionType } from "./moderation.ts";
import { getActiveMembers } from "./business.ts";

export async function onBusinessVerified(
  base44: any,
  opts: { business_id: string; business_name?: string; actor_id: string },
) {
  const { business_id, business_name, actor_id } = opts;

  const members = await getActiveMembers(base44, business_id);

  // 1. Trust signal to every active owner/manager member (idempotent per user).
  for (const m of members) {
    await awardSignalToUser(base44, {
      target_user_id: m.user_id,
      signal_type: SignalType.BUSINESS_VERIFIED,
      reason: `Business verified${business_name ? `: ${business_name}` : ""}`,
      actor: `admin:${actor_id}`,
    }).catch(() => null);
  }

  // 2. Notify every member of the verification outcome.
  for (const m of members) {
    await createNotification(base44, {
      recipient_id: m.user_id,
      notification_type: NotificationType.MODERATION_OUTCOME,
      actor_id,
      target_type: "business",
      target_id: business_id,
    }).catch(() => {});
  }

  // 3. Audit log.
  await writeAuditLog(base44, {
    action: AuditActionType.BUSINESS_STATUS_CHANGED,
    actor_type: "admin",
    actor_id,
    target_type: "business",
    target_id: business_id,
    context: JSON.stringify({ from: "pending", to: "verified", business_name: business_name || null }),
  }).catch(() => {});

  return { ok: true, notified: members.length };
}