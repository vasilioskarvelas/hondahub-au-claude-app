import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { runNotificationRetry } from "../../shared/notification-delivery.ts";

/**
 * NotificationDeliveryRetry worker (Phase 09, §2).
 * Invoked every 30 minutes by the NotificationDeliveryRetry workflow.
 * Class C best-effort: a delivery failure never affects the authoritative
 * write that triggered the notification.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const result = await runNotificationRetry(base44);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: error.message } },
      { status: 500 },
    );
  }
});