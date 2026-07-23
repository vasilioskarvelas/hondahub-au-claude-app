import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  ENTRY_TYPES, TIMELINE_ORIGIN, VEHICLE_VISIBILITY,
  err, getOwnedVehicle, inList, validateSingleLink,
} from "../../shared/garage.ts";
import { createNotification } from "../../shared/notifications.ts";
import { NotificationType } from "../../shared/identity.ts";

/**
 * TimelineService (Phase 03) — owns a vehicle's chronological narrative.
 * Actions: createEntry, updateEntry, removeEntry, createFromConfirmedSuggestion, listByVehicle.
 *
 * Hard rules:
 *  - vehicle-owner-only.
 *  - at most one linked_* FK per entry (service-layer enforced).
 *  - entry_date cannot be in the future (history, not planned items).
 *  - createFromConfirmedSuggestion is the explicit-confirmation path for an
 *    auto-suggested entry — a Modification/Maintenance/Performance event may
 *    PROPOSE a suggestion, but it is never silently auto-published.
 */

const ENTRY_FIELDS = [
  'entry_type', 'entry_date', 'title', 'description',
  'linked_modification_id', 'linked_maintenance_id', 'linked_performance_id', 'linked_post_id',
  'visibility',
];

function validateEntryFields(body: any): any {
  const d: any = {};
  for (const f of ENTRY_FIELDS) {
    if (body[f] !== undefined) d[f] = body[f];
  }
  if (d.entry_type !== undefined && !inList(d.entry_type, ENTRY_TYPES)) return { error: { entry_type: 'invalid' } };
  if (d.visibility !== undefined && !inList(d.visibility, VEHICLE_VISIBILITY)) return { error: { visibility: 'invalid' } };
  const linkErr = validateSingleLink(d);
  if (linkErr) return { error: { linked: linkErr } };
  return { d };
}

function notFuture(dateStr: string): boolean {
  if (!dateStr) return true;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  return d.getTime() <= Date.now() + 24 * 3600 * 1000; // allow same day
}

/**
 * TimelineEntryPublished → NotificationService (vehicle followers).
 * Notifies the users following this vehicle that a new timeline entry was
 * published — but only those who could actually SEE the entry, respecting the
 * same visibility check as the entry itself:
 *   - private              → nobody (owner only).
 *   - approved_connections → only vehicle-followers who are also an approved
 *                            connection of the owner (a mutual user-follow).
 *   - public / followers   → every (non-author) vehicle-follower.
 * A follower who could not see the entry never receives a notification about
 * it. The entry author is always excluded (it's their own vehicle).
 * Fire-and-forget: a notification failure never blocks the publish.
 */
async function notifyVehicleFollowers(base44: any, vehicleId: string, authorId: string, visibility: string | undefined) {
  if (visibility === "private") return;
  try {
    const followers = await base44.asServiceRole.entities.Follow.filter({
      target_type: "vehicle", target_id: vehicleId,
    });
    const eligible = followers.filter((f: any) => f.follower_id !== authorId);
    if (eligible.length === 0) return;

    // approved_connections: a vehicle-follower sees the entry (and is notified)
    // only if they are also an approved connection of the owner. With no
    // separate connection-approval entity, an "approved connection" is a
    // mutual user-follow (the owner follows them back). Everyone else is
    // excluded — a follower who is not an approved connection does not receive
    // a notification about an entry they cannot see.
    if (visibility === "approved_connections") {
      const authorFollows = await base44.asServiceRole.entities.Follow.filter({
        follower_id: authorId, target_type: "user",
      });
      const connectionIds = new Set(authorFollows.map((f: any) => f.target_id));
      const connected = eligible.filter((f: any) => connectionIds.has(f.follower_id));
      await Promise.all(connected.map((f: any) =>
        createNotification(base44, {
          recipient_id: f.follower_id,
          notification_type: NotificationType.NEW_VEHICLE_UPDATE,
          actor_id: authorId,
          target_type: "vehicle",
          target_id: vehicleId,
        }).catch(() => {}),
      ));
      return;
    }

    // public / followers — notify every (non-author) vehicle-follower.
    await Promise.all(eligible.map((f: any) =>
      createNotification(base44, {
        recipient_id: f.follower_id,
        notification_type: NotificationType.NEW_VEHICLE_UPDATE,
        actor_id: authorId,
        target_type: "vehicle",
        target_id: vehicleId,
      }).catch(() => {}),
    ));
  } catch {}
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return err('AUTH_REQUIRED', 401);

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'listByVehicle';

    // ---- createEntry (manual) ----
    if (action === 'createEntry') {
      const { vehicle_id } = body;
      const vehicle = await getOwnedVehicle(base44, vehicle_id, user);
      if (!vehicle) return err('PERMISSION_DENIED', 403);
      if (!body.title) return err('VALIDATION_FAILED', 422, { title: 'required' });
      if (!body.entry_date) return err('VALIDATION_FAILED', 422, { entry_date: 'required' });
      if (!notFuture(body.entry_date)) return err('VALIDATION_FAILED', 422, { entry_date: 'cannot be in the future' });
      const v = validateEntryFields(body);
      if (v.error) return err('VALIDATION_FAILED', 422, v.error);
      const entry = await base44.entities.TimelineEntry.create({ ...v.d, vehicle_id, origin: 'manual' });
      // Event: TimelineEntryPublished → notify vehicle followers (Phase 09 completion).
      await notifyVehicleFollowers(base44, vehicle_id, user.id, entry.visibility);
      return Response.json({ ok: true, entry });
    }

    // ---- createFromConfirmedSuggestion (explicit user confirmation) ----
    if (action === 'createFromConfirmedSuggestion') {
      const { vehicle_id, confirmed } = body;
      if (!confirmed) return err('VALIDATION_FAILED', 422, { confirmed: 'explicit user confirmation is required' });
      const vehicle = await getOwnedVehicle(base44, vehicle_id, user);
      if (!vehicle) return err('PERMISSION_DENIED', 403);
      if (!body.title) return err('VALIDATION_FAILED', 422, { title: 'required' });
      if (!body.entry_date) return err('VALIDATION_FAILED', 422, { entry_date: 'required' });
      if (!notFuture(body.entry_date)) return err('VALIDATION_FAILED', 422, { entry_date: 'cannot be in the future' });
      const v = validateEntryFields(body);
      if (v.error) return err('VALIDATION_FAILED', 422, v.error);
      const entry = await base44.entities.TimelineEntry.create({ ...v.d, vehicle_id, origin: 'system_generated' });
      // Event: TimelineEntryPublished → notify vehicle followers (Phase 09 completion).
      await notifyVehicleFollowers(base44, vehicle_id, user.id, entry.visibility);
      return Response.json({ ok: true, entry, published_from_suggestion: true });
    }

    // ---- updateEntry ----
    if (action === 'updateEntry') {
      const { entry_id } = body;
      let entry: any;
      try { entry = await base44.asServiceRole.entities.TimelineEntry.get(entry_id); } catch { return err('RESOURCE_NOT_FOUND', 404); }
      const vehicle = await getOwnedVehicle(base44, entry.vehicle_id, user);
      if (!vehicle) return err('PERMISSION_DENIED', 403);
      if (body.entry_date !== undefined && !notFuture(body.entry_date)) return err('VALIDATION_FAILED', 422, { entry_date: 'cannot be in the future' });
      const v = validateEntryFields(body);
      if (v.error) return err('VALIDATION_FAILED', 422, v.error);
      const updated = await base44.entities.TimelineEntry.update(entry_id, v.d);
      return Response.json({ ok: true, entry: updated });
    }

    // ---- removeEntry ----
    if (action === 'removeEntry') {
      const { entry_id } = body;
      let entry: any;
      try { entry = await base44.asServiceRole.entities.TimelineEntry.get(entry_id); } catch { return err('RESOURCE_NOT_FOUND', 404); }
      const vehicle = await getOwnedVehicle(base44, entry.vehicle_id, user);
      if (!vehicle) return err('PERMISSION_DENIED', 403);
      await base44.entities.TimelineEntry.delete(entry_id);
      return Response.json({ ok: true });
    }

    // ---- listByVehicle ----
    if (action === 'listByVehicle') {
      const { vehicle_id } = body;
      const entries = await base44.asServiceRole.entities.TimelineEntry.filter({ vehicle_id }, '-entry_date', 200);
      return Response.json({ ok: true, entries });
    }

    return err('VALIDATION_FAILED', 422, { action: 'unknown' });
  } catch (error) {
    return Response.json({ ok: false, error: { code: 'INTERNAL_ERROR', message: error.message } }, { status: 500 });
  }
});