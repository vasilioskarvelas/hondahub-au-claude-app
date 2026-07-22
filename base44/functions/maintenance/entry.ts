import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  MAINTENANCE_TYPES, SERVICE_PROVIDER_TYPE, MAINTENANCE_STATUS,
  err, isModOrAdmin, getOwnedVehicle, inList, buildTimelineSuggestion, maintenanceLabel,
} from "../../shared/garage.ts";
import { validateReference, ReferenceTypes } from "../../shared/reference-resolver.ts";

/**
 * MaintenanceService (Phase 03) — owns MaintenanceRecord (a service log, not a task).
 * Actions: createRecord, updateRecord, removeRecord, getUpcoming, listByVehicle,
 *          applyModerationActionToRecord (internal, Mod/Admin).
 *
 * Hard rules:
 *  - vehicle-owner-only for create/update/remove.
 *  - serviced_by_business_id must reference a verified Business (verified-gate
 *    activates when the Business entity lands in Phase 07).
 *  - serviced_by_business_id only when service_provider_type = business.
 *  - NO markCompleted() — a MaintenanceRecord is a log of completed work.
 *  - createRecord fires MaintenanceRecordLogged and returns a user-confirmable
 *    timeline SUGGESTION (never auto-publishes).
 */

const RECORD_FIELDS = [
  'maintenance_type', 'title', 'description', 'service_date', 'odometer_km',
  'service_provider_type', 'serviced_by_business_id', 'service_provider_name_freetext',
  'cost', 'next_service_date', 'next_service_odometer_km',
];

async function validateBusinessTag(base44: any, provider_type: string, business_id: string | undefined): Promise<any> {
  if (!business_id) return null;
  if (provider_type !== 'business') {
    return { serviced_by_business_id: 'requires service_provider_type = business' };
  }
  const ref = await validateReference(base44, {
    target_type: ReferenceTypes.BUSINESS, target_id: business_id, allowedTypes: [ReferenceTypes.BUSINESS],
  });
  if (!ref.valid) return { serviced_by_business_id: ref.error || 'invalid business reference' };
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
      const { vehicle_id, maintenance_type, service_date, service_provider_type, serviced_by_business_id } = body;
      const vehicle = await getOwnedVehicle(base44, vehicle_id, user);
      if (!vehicle) return err('PERMISSION_DENIED', 403);
      if (!inList(maintenance_type, MAINTENANCE_TYPES)) return err('VALIDATION_FAILED', 422, { maintenance_type: 'invalid' });
      if (!service_date) return err('VALIDATION_FAILED', 422, { service_date: 'required' });
      const pType = service_provider_type || 'self';
      if (!inList(pType, SERVICE_PROVIDER_TYPE)) return err('VALIDATION_FAILED', 422, { service_provider_type: 'invalid' });
      const bizErr = await validateBusinessTag(base44, pType, serviced_by_business_id);
      if (bizErr) return err('VALIDATION_FAILED', 422, bizErr);
      const data: any = { vehicle_id, maintenance_type, service_date, service_provider_type: pType, status: 'active' };
      for (const f of RECORD_FIELDS) {
        if (body[f] !== undefined && f !== 'maintenance_type' && f !== 'service_date' && f !== 'service_provider_type') data[f] = body[f];
      }
      const record = await base44.entities.MaintenanceRecord.create(data);
      // Event: MaintenanceRecordLogged → propose a user-confirmable timeline suggestion.
      const suggestion = buildTimelineSuggestion({
        vehicle_id,
        entry_type: 'maintenance',
        entry_date: service_date,
        title: body.title || maintenanceLabel(maintenance_type),
        linked_maintenance_id: record.id,
      });
      return Response.json({ ok: true, record, timeline_suggestion: suggestion });
    }

    // ---- updateRecord ----
    if (action === 'updateRecord') {
      const { record_id } = body;
      let record: any;
      try { record = await base44.asServiceRole.entities.MaintenanceRecord.get(record_id); } catch { return err('RESOURCE_NOT_FOUND', 404); }
      const vehicle = await getOwnedVehicle(base44, record.vehicle_id, user);
      if (!vehicle) return err('PERMISSION_DENIED', 403);
      const data: any = {};
      for (const f of RECORD_FIELDS) {
        if (body[f] !== undefined) data[f] = body[f];
      }
      if (data.maintenance_type !== undefined && !inList(data.maintenance_type, MAINTENANCE_TYPES)) return err('VALIDATION_FAILED', 422, { maintenance_type: 'invalid' });
      if (data.service_provider_type !== undefined && !inList(data.service_provider_type, SERVICE_PROVIDER_TYPE)) return err('VALIDATION_FAILED', 422, { service_provider_type: 'invalid' });
      if (data.serviced_by_business_id !== undefined) {
        const bizErr = await validateBusinessTag(base44, data.service_provider_type || record.service_provider_type || 'self', data.serviced_by_business_id);
        if (bizErr) return err('VALIDATION_FAILED', 422, bizErr);
      }
      const updated = await base44.entities.MaintenanceRecord.update(record_id, data);
      return Response.json({ ok: true, record: updated });
    }

    // ---- removeRecord (soft delete) ----
    if (action === 'removeRecord') {
      const { record_id } = body;
      let record: any;
      try { record = await base44.asServiceRole.entities.MaintenanceRecord.get(record_id); } catch { return err('RESOURCE_NOT_FOUND', 404); }
      const vehicle = await getOwnedVehicle(base44, record.vehicle_id, user);
      if (!vehicle) return err('PERMISSION_DENIED', 403);
      const updated = await base44.entities.MaintenanceRecord.update(record_id, { status: 'removed_by_owner' });
      return Response.json({ ok: true, record: updated });
    }

    // ---- getUpcoming (derived reminders — reads next_service_date / next_service_odometer_km) ----
    if (action === 'getUpcoming') {
      const vehicles = await base44.entities.Vehicle.filter({ created_by_id: user.id });
      const ids = vehicles.map((v: any) => v.id);
      const upcoming: any[] = [];
      for (const vid of ids) {
        const recs = await base44.asServiceRole.entities.MaintenanceRecord.filter({ vehicle_id: vid, status: 'active' });
        for (const r of recs) {
          if (r.next_service_date || r.next_service_odometer_km) upcoming.push(r);
        }
      }
      upcoming.sort((a, b) => (a.next_service_date || '9999').localeCompare(b.next_service_date || '9999'));
      return Response.json({ ok: true, upcoming });
    }

    // ---- listByVehicle ----
    if (action === 'listByVehicle') {
      const { vehicle_id } = body;
      const records = await base44.asServiceRole.entities.MaintenanceRecord.filter({ vehicle_id, status: 'active' }, '-service_date', 200);
      return Response.json({ ok: true, records });
    }

    // ---- applyModerationActionToRecord (internal, Mod/Admin) ----
    if (action === 'applyModerationActionToRecord') {
      if (!isModOrAdmin(user)) return err('PERMISSION_DENIED', 403);
      const { record_id, status } = body;
      if (!inList(status, MAINTENANCE_STATUS)) return err('VALIDATION_FAILED', 422, { status: 'invalid' });
      const updated = await base44.asServiceRole.entities.MaintenanceRecord.update(record_id, { status });
      return Response.json({ ok: true, record: updated });
    }

    return err('VALIDATION_FAILED', 422, { action: 'unknown' });
  } catch (error) {
    return Response.json({ ok: false, error: { code: 'INTERNAL_ERROR', message: error.message } }, { status: 500 });
  }
});