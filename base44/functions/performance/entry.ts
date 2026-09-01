import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  PERFORMANCE_TYPES, FUEL_TYPES,
  err, getOwnedVehicle, inList, nonNegative,
  buildTimelineSuggestion, performanceToEntryType,
} from "../../shared/garage.ts";
import { validateReference, ReferenceTypes } from "../../shared/reference-resolver.ts";

/**
 * PerformanceService (Phase 03) — owns PerformanceRecord (measured results).
 * Actions: createRecord, updateRecord, removeRecord, listByVehicle.
 *
 * Hard rules:
 *  - vehicle-owner-only for create/update/remove.
 *  - power_kw is the only stored power field (power_hp computed for display).
 *  - venue_name is the single location field (no track_name).
 *  - Numeric plausibility: no negative times/speeds.
 *  - createRecord fires PerformanceRecordCreated → returns a user-confirmable
 *    timeline suggestion.
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
      const data: any = { vehicle_id, performance_type, result_date };
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

    // ---- listByVehicle ----
    if (action === 'listByVehicle') {
      const { vehicle_id } = body;
      const records = await base44.asServiceRole.entities.PerformanceRecord.filter({ vehicle_id }, '-result_date', 200);
      return Response.json({ ok: true, records });
    }

    return err('VALIDATION_FAILED', 422, { action: 'unknown' });
  } catch (error) {
    return Response.json({ ok: false, error: { code: 'INTERNAL_ERROR', message: error.message } }, { status: 500 });
  }
});