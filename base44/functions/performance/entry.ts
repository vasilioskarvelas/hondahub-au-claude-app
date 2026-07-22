import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  PERFORMANCE_TYPES, VERIFICATION_STATUS, FUEL_TYPES,
  err, isModOrAdmin, getOwnedVehicle, inList, nonNegative,
  buildTimelineSuggestion, performanceToEntryType,
} from "../../shared/garage.ts";
import { createNotification } from "../../shared/notifications.ts";
import { NotificationType } from "../../shared/identity.ts";
import { validateReference, ReferenceTypes } from "../../shared/reference-resolver.ts";

/**
 * PerformanceService (Phase 03) — owns PerformanceRecord (measured results).
 * Actions: createRecord, updateRecord, removeRecord, submitVerification,
 *          approveVerification, rejectVerification, listByVehicle,
 *          listPendingVerification, applyModerationActionToRecord (internal).
 *
 * Hard rules:
 *  - vehicle-owner-only for create/update/remove.
 *  - Mod/Admin-only for verification_status changes. AI never sets it.
 *  - power_kw is the only stored power field (power_hp computed for display).
 *  - venue_name is the single location field (no track_name).
 *  - Numeric plausibility: no negative times/speeds.
 *  - createRecord fires PerformanceRecordCreated → returns a user-confirmable
 *    timeline suggestion. approveVerification fires PerformanceRecordVerified.
 *    (Trust signal award for PerformanceRecordVerified is deferred — the locked
 *    SignalType enum has no performance_verified value; a registry addition is
 *    required first. The owner is still notified of the outcome.)
 */

const RECORD_FIELDS = [
  'performance_type', 'result_date', 'venue_name', 'event_id', 'title', 'notes',
  'power_kw', 'torque_nm', 'quarter_mile_seconds', 'trap_speed_kmh',
  'eighth_mile_seconds', 'zero_to_hundred_seconds', 'lap_time_seconds',
  'dyno_type', 'fuel_type_at_test', 'boost_psi', 'tyre_description',
];

const NON_NEG_FIELDS = [
  'power_kw', 'torque_nm', 'quarter_mile_seconds', 'trap_speed_kmh',
  'eighth_mile_seconds', 'zero_to_hundred_seconds', 'lap_time_seconds', 'boost_psi',
];

function validateNumbers(d: any): any {
  for (const f of NON_NEG_FIELDS) {
    if (d[f] !== undefined && d[f] !== null && !nonNegative(d[f])) {
      return { error: { [f]: 'must be a non-negative number' } };
    }
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return err('AUTH_REQUIRED', 401);

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'listByVehicle';

    // ---- createRecord ----
    if (action === 'createRecord') {
      const { vehicle_id, performance_type, result_date, event_id } = body;
      const vehicle = await getOwnedVehicle(base44, vehicle_id, user);
      if (!vehicle) return err('PERMISSION_DENIED', 403);
      if (!inList(performance_type, PERFORMANCE_TYPES)) return err('VALIDATION_FAILED', 422, { performance_type: 'invalid' });
      if (!result_date) return err('VALIDATION_FAILED', 422, { result_date: 'required' });
      if (event_id) {
        const ref = await validateReference(base44, { target_type: ReferenceTypes.EVENT, target_id: event_id, allowedTypes: [ReferenceTypes.EVENT] });
        if (!ref.valid) return err('VALIDATION_FAILED', 422, { event_id: ref.error });
      }
      if (body.fuel_type_at_test !== undefined && body.fuel_type_at_test !== null && !inList(body.fuel_type_at_test, FUEL_TYPES)) {
        return err('VALIDATION_FAILED', 422, { fuel_type_at_test: 'invalid' });
      }
      const data: any = { vehicle_id, performance_type, result_date, verification_status: 'unverified' };
      for (const f of RECORD_FIELDS) {
        if (body[f] !== undefined && f !== 'performance_type' && f !== 'result_date') data[f] = body[f];
      }
      const numErr = validateNumbers(data);
      if (numErr) return err('VALIDATION_FAILED', 422, numErr.error);
      const record = await base44.entities.PerformanceRecord.create(data);
      // Event: PerformanceRecordCreated → propose a user-confirmable timeline suggestion.
      const suggestion = buildTimelineSuggestion({
        vehicle_id,
        entry_type: performanceToEntryType(performance_type),
        entry_date: result_date,
        title: body.title || `Performance result: ${performance_type.replace(/_/g, ' ')}`,
        linked_performance_id: record.id,
      });
      return Response.json({ ok: true, record, timeline_suggestion: suggestion });
    }

    // ---- updateRecord ----
    if (action === 'updateRecord') {
      const { record_id } = body;
      let record: any;
      try { record = await base44.asServiceRole.entities.PerformanceRecord.get(record_id); } catch { return err('RESOURCE_NOT_FOUND', 404); }
      const vehicle = await getOwnedVehicle(base44, record.vehicle_id, user);
      if (!vehicle) return err('PERMISSION_DENIED', 403);
      if (body.verification_status !== undefined) {
        return err('PERMISSION_DENIED', 403, { verification_status: 'use submitVerification/approveVerification/rejectVerification' });
      }
      const data: any = {};
      for (const f of RECORD_FIELDS) {
        if (body[f] !== undefined) data[f] = body[f];
      }
      if (data.performance_type !== undefined && !inList(data.performance_type, PERFORMANCE_TYPES)) return err('VALIDATION_FAILED', 422, { performance_type: 'invalid' });
      if (data.fuel_type_at_test !== undefined && data.fuel_type_at_test !== null && !inList(data.fuel_type_at_test, FUEL_TYPES)) return err('VALIDATION_FAILED', 422, { fuel_type_at_test: 'invalid' });
      const numErr = validateNumbers(data);
      if (numErr) return err('VALIDATION_FAILED', 422, numErr.error);
      const updated = await base44.entities.PerformanceRecord.update(record_id, data);
      return Response.json({ ok: true, record: updated });
    }

    // ---- removeRecord ----
    if (action === 'removeRecord') {
      const { record_id } = body;
      let record: any;
      try { record = await base44.asServiceRole.entities.PerformanceRecord.get(record_id); } catch { return err('RESOURCE_NOT_FOUND', 404); }
      const vehicle = await getOwnedVehicle(base44, record.vehicle_id, user);
      if (!vehicle) return err('PERMISSION_DENIED', 403);
      await base44.entities.PerformanceRecord.delete(record_id);
      return Response.json({ ok: true });
    }

    // ---- submitVerification (owner) ----
    if (action === 'submitVerification') {
      const { record_id } = body;
      let record: any;
      try { record = await base44.asServiceRole.entities.PerformanceRecord.get(record_id); } catch { return err('RESOURCE_NOT_FOUND', 404); }
      const vehicle = await getOwnedVehicle(base44, record.vehicle_id, user);
      if (!vehicle) return err('PERMISSION_DENIED', 403);
      if (record.verification_status === 'verified') return err('INVALID_STATE_TRANSITION', 409, { verification_status: 'already verified' });
      const updated = await base44.entities.PerformanceRecord.update(record_id, { verification_status: 'pending' });
      return Response.json({ ok: true, record: updated });
    }

    // ---- approveVerification (Mod/Admin) ----
    if (action === 'approveVerification') {
      if (!isModOrAdmin(user)) return err('PERMISSION_DENIED', 403);
      const { record_id } = body;
      let record: any;
      try { record = await base44.asServiceRole.entities.PerformanceRecord.get(record_id); } catch { return err('RESOURCE_NOT_FOUND', 404); }
      if (record.verification_status === 'verified') {
        return Response.json({ ok: true, record, already_verified: true });
      }
      const updated = await base44.asServiceRole.entities.PerformanceRecord.update(record_id, { verification_status: 'verified' });
      // Event: PerformanceRecordVerified. Trust signal deferred (no performance_verified SignalType).
      try {
        await createNotification(base44, {
          recipient_id: record.created_by_id,
          notification_type: NotificationType.MODERATION_OUTCOME,
          actor_id: user.id,
          target_type: 'vehicle',
          target_id: record.vehicle_id,
        });
      } catch (e) { /* non-blocking */ }
      return Response.json({ ok: true, record: updated });
    }

    // ---- rejectVerification (Mod/Admin) ----
    if (action === 'rejectVerification') {
      if (!isModOrAdmin(user)) return err('PERMISSION_DENIED', 403);
      const { record_id } = body;
      let record: any;
      try { record = await base44.asServiceRole.entities.PerformanceRecord.get(record_id); } catch { return err('RESOURCE_NOT_FOUND', 404); }
      const updated = await base44.asServiceRole.entities.PerformanceRecord.update(record_id, { verification_status: 'rejected' });
      try {
        await createNotification(base44, {
          recipient_id: record.created_by_id,
          notification_type: NotificationType.MODERATION_OUTCOME,
          actor_id: user.id,
          target_type: 'vehicle',
          target_id: record.vehicle_id,
        });
      } catch (e) { /* non-blocking */ }
      return Response.json({ ok: true, record: updated });
    }

    // ---- listByVehicle ----
    if (action === 'listByVehicle') {
      const { vehicle_id } = body;
      const records = await base44.asServiceRole.entities.PerformanceRecord.filter({ vehicle_id }, '-result_date', 200);
      return Response.json({ ok: true, records });
    }

    // ---- listPendingVerification (Mod/Admin) ----
    if (action === 'listPendingVerification') {
      if (!isModOrAdmin(user)) return err('PERMISSION_DENIED', 403);
      const records = await base44.asServiceRole.entities.PerformanceRecord.filter({ verification_status: 'pending' }, '-updated_date', 100);
      return Response.json({ ok: true, records });
    }

    // ---- applyModerationActionToRecord (internal, Mod/Admin) ----
    if (action === 'applyModerationActionToRecord') {
      if (!isModOrAdmin(user)) return err('PERMISSION_DENIED', 403);
      const { record_id, verification_status } = body;
      if (!inList(verification_status, VERIFICATION_STATUS)) return err('VALIDATION_FAILED', 422, { verification_status: 'invalid' });
      const updated = await base44.asServiceRole.entities.PerformanceRecord.update(record_id, { verification_status });
      return Response.json({ ok: true, record: updated });
    }

    return err('VALIDATION_FAILED', 422, { action: 'unknown' });
  } catch (error) {
    return Response.json({ ok: false, error: { code: 'INTERNAL_ERROR', message: error.message } }, { status: 500 });
  }
});