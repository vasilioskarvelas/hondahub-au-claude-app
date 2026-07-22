/**
 * Honda Hub — NotificationService shared module (Phase 02)
 *
 * Centralized, registry-validated notification creation. Every notification
 * written anywhere on the platform goes through createNotification so that
 * notification_type is always a registry value and any polymorphic target is
 * type-validated. This is the cross-cutting service that Phase 04 (Social),
 * Phase 06 (Community), and Phase 08 (Marketplace) consumers call instead of
 * touching the Notification entity directly.
 *
 * Uses base44.asServiceRole so it is callable from other backend functions
 * regardless of the originating user's permissions (system-generated
 * notifications have no actor).
 */

import { NotificationType } from "./identity.ts";
import { isReferenceType } from "./reference-resolver.ts";

const NOTIFICATION_TYPE_VALUES = Object.values(NotificationType);

export async function createNotification(
  base44: any,
  opts: {
    recipient_id: string;
    notification_type: string;
    actor_id?: string | null;
    target_type?: string | null;
    target_id?: string | null;
  },
) {
  const { recipient_id, notification_type, actor_id = null, target_type = null, target_id = null } = opts;

  if (!recipient_id) {
    throw new Error("createNotification: recipient_id is required");
  }
  if (!NOTIFICATION_TYPE_VALUES.includes(notification_type as any)) {
    throw new Error(`createNotification: invalid notification_type ${notification_type}`);
  }
  if (target_type && !isReferenceType(target_type)) {
    throw new Error(`createNotification: invalid target_type ${target_type}`);
  }

  return await base44.asServiceRole.entities.Notification.create({
    recipient_id,
    notification_type,
    actor_id,
    target_type,
    target_id,
  });
}