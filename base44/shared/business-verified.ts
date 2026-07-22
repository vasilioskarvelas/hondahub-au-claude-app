/**
 * Honda Hub — BusinessVerified consumer wiring (Phase 05)
 *
 * The BusinessVerified event's consumers, wired now per the Phase 05 build spec
 * even though the Business entity itself is built in Phase 07. When a business
 * is verified, this:
 *   1. Awards the business_verified trust signal to the owner (idempotent).
 *   2. Notifies the owner of the verification outcome.
 *   3. Writes an AuditLog entry (business_status_changed).
 *
 * Phase 07's BusinessService.approveVerification calls this shared method — it
 * is the single consumer path, so the Single-Writer Rule (TrustScoreService is
 * the sole writer of account_tier) is preserved.
 */

import { awardSignalToUser } from "./trust-score.ts";
import { SignalType } from "./identity.ts";
import { createNotification } from "./notifications.ts";
import { NotificationType } from "./identity.ts";
import { writeAuditLog } from "./audit-log.ts";
import { AuditActionType } from "./moderation.ts";
import { ReferenceTypes } from "./reference-resolver.ts";

export async function onBusinessVerified(
  base44: any,
  opts: { business_id: string; business_name?: string; owner_id: string; actor_id: string },
) {
  const { business_id, business_name, owner_id, actor_id } = opts;

  // 1. Trust signal (idempotent — re-verifying does not double-award).
  const award = await awardSignalToUser(base44, {
    target_user_id: owner_id,
    signal_type: SignalType.BUSINESS_VERIFIED,
    reason: `Business verified${business_name ? `: ${business_name}` : ""}`,
    actor: `admin:${actor_id}`,
  }).catch(() => null);

  // 2. Notify the owner.
  await createNotification(base44, {
    recipient_id: owner_id,
    notification_type: NotificationType.MODERATION_OUTCOME,
    actor_id,
    target_type: ReferenceTypes.BUSINESS,
    target_id: business_id,
  }).catch(() => {});

  // 3. Audit log.
  await writeAuditLog(base44, {
    action: AuditActionType.BUSINESS_STATUS_CHANGED,
    actor_id,
    target_type: ReferenceTypes.BUSINESS,
    target_id: business_id,
    details: `Business verified${business_name ? `: ${business_name}` : ""}`,
  }).catch(() => {});

  return { ok: true, award };
}