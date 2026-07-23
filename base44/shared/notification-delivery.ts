/**
 * Honda Hub — Notification delivery + retry shared module (Phase 09, §2)
 *
 * The notification-delivery-failure retry job. Class C (best-effort): a
 * delivery failure never affects the authoritative write that triggered the
 * notification.
 *
 * Schedule: every 30 minutes (NotificationDeliveryRetry workflow).
 * Query:      delivery_status = 'failed' AND retry_count < 5, cursor on
 *             created_at (oldest first), batch size 200.
 * Backoff:    exponential — 1, 2, 4, 8, 16 minutes after each failed attempt.
 * Max:        5 retry attempts; after the 5th failed attempt the row is marked
 *             'permanently_failed' and excluded from all future runs (retained
 *             for support/debugging, never deleted).
 * Locking:    single-runner — the platform's scheduled workflow execution is
 *             single-runner by default (same as every other scheduled job),
 *             so a concurrent invocation does not occur.
 *
 * Delivery seam: deliverNotification() is the single place a delivery attempt
 * happens. In-app delivery = the Notification row existing; the only genuine
 * in-app delivery failure is a recipient who no longer exists (a notification
 * addressed to a deleted user cannot be delivered). Future external channels
 * (email/push) plug their own attempt logic in here.
 */

export const MAX_RETRY_ATTEMPTS = 5;
// Backoff (minutes) before the next retry, indexed by retry_count (retries
// performed so far): 0→1m, 1→2m, 2→4m, 3→8m, 4→16m. After the 5th failed retry
// (retry_count reaches 5) → permanently_failed.
export const BACKOFF_MINUTES = [1, 2, 4, 8, 16];
export const RETRY_BATCH_SIZE = 200;

/**
 * Whether a failed notification is due for its next retry attempt, respecting
 * the exponential backoff schedule. A row that is not 'failed', has exhausted
 * its 5 retries, or is still within its backoff window is a no-op for this run.
 */
export function isDueForRetry(notification: any, nowMs: number = Date.now()): boolean {
  if (!notification || notification.delivery_status !== "failed") return false;
  const retryCount = notification.retry_count || 0;
  if (retryCount >= MAX_RETRY_ATTEMPTS) return false;
  if (!notification.last_attempt_at) return true; // never attempted → due now
  const elapsed = nowMs - new Date(notification.last_attempt_at).getTime();
  const idx = Math.min(retryCount, BACKOFF_MINUTES.length - 1);
  const waitMs = BACKOFF_MINUTES[idx] * 60 * 1000;
  return elapsed >= waitMs;
}

/**
 * Delivery seam. Attempts delivery of a single notification.
 * Returns { delivered: boolean }. delivered=false is a genuine delivery failure
 * (the row stays/becomes 'failed' and is retried per the backoff schedule).
 */
export async function deliverNotification(
  base44: any,
  notification: any,
): Promise<{ delivered: boolean; reason?: string }> {
  try {
    await base44.asServiceRole.entities.User.get(notification.recipient_id);
    return { delivered: true };
  } catch {
    return { delivered: false, reason: "recipient_not_found" };
  }
}

/**
 * The retry worker. Processes one batch (≤200 due rows) of failed
 * notifications. Called by the notification-retry backend function, which the
 * NotificationDeliveryRetry workflow invokes every 30 minutes.
 */
export async function runNotificationRetry(base44: any) {
  // Cursor on created_at (oldest first); over-fetch to leave headroom after the
  // backoff-due filter, then cap processed at RETRY_BATCH_SIZE.
  const failed = await base44.asServiceRole.entities.Notification.filter(
    { delivery_status: "failed" },
    "created_date",
    500,
  );

  let processed = 0;
  let retried = 0;
  let succeeded = 0;
  let permanentlyFailed = 0;
  let skipped = 0;

  for (const n of failed) {
    if (processed >= RETRY_BATCH_SIZE) break;
    if (!isDueForRetry(n)) {
      skipped++;
      continue;
    }
    processed++;

    const { delivered } = await deliverNotification(base44, n);
    const nowIso = new Date().toISOString();

    if (delivered) {
      await base44.asServiceRole.entities.Notification.update(n.id, {
        delivery_status: "sent",
        retry_count: 0,
        last_attempt_at: nowIso,
      }).catch(() => {});
      succeeded++;
    } else {
      const newCount = (n.retry_count || 0) + 1;
      if (newCount >= MAX_RETRY_ATTEMPTS) {
        await base44.asServiceRole.entities.Notification.update(n.id, {
          delivery_status: "permanently_failed",
          retry_count: newCount,
          last_attempt_at: nowIso,
        }).catch(() => {});
        permanentlyFailed++;
      } else {
        await base44.asServiceRole.entities.Notification.update(n.id, {
          delivery_status: "failed",
          retry_count: newCount,
          last_attempt_at: nowIso,
        }).catch(() => {});
        retried++;
      }
    }
  }

  return { ok: true, processed, retried, succeeded, permanentlyFailed, skipped };
}