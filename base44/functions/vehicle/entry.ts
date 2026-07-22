import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  OWNERSHIP_RELATIONSHIP, BUILD_STATUS, SALE_STATUS, VEHICLE_VISIBILITY,
  VERIFICATION_STATUS, REGISTRATION_STATES, BODY_STYLES, DRIVETRAINS, FUEL_TYPES,
  err, isModOrAdmin, isVehicleOwner, getOwnedVehicle, inList,
} from "../../shared/garage.ts";
import { awardSignalToUser } from "../../shared/trust-score.ts";
import { SignalType } from "../../shared/identity.ts";
import { createNotification } from "../../shared/notifications.ts";
import { NotificationType } from "../../shared/identity.ts";
import { writeAuditLog } from "../../shared/audit-log.ts";
import { AuditActionType } from "../../shared/moderation.ts";

/**
 * VehicleService (Phase 03) — owns the Garage's central domain object.
 * Actions: create, update, setCover, changeVisibility, changeSaleStatus,
 *          submitVerification, approveVerification, rejectVerification,
 *          get, list, listPublic, listPendingVerification.
 *
 * Hard rules:
 *  - No vin / registration_number field exists; reject both even if submitted.
 *  - owner-only edits; verification_status only via submit/approve/reject.
 *  - approveVerification fires VehicleVerified → awardSignalToUser(vehicle_verified).
 */

const VEHICLE_SPEC_FIELDS = [
  'nickname', 'make', 'model', 'year', 'generation', 'chassis_code', 'body_style',
  'colour', 'ownership_relationship', 'build_status', 'sale_status', 'trim',
  'engine_code', 'engine_capacity', 'transmission', 'drivetrain', 'fuel_type',
  'odometer_km', 'power_kw', 'registration_state', 'purchase_date', 'purchase_price',
  'build_goal', 'build_description', 'cover_media_id', 'visibility',
];

function rejectVinOrRego(body: any) {
  if (body.vin !== undefined || body.registration_number !== undefined) {
    return err('VALIDATION_FAILED', 422, { vin: 'VIN/registration_number fields do not exist on Vehicle' });
  }
  return null;
}

function validateSpec(spec: any): any {
  const d: any = {};
  for (const f of VEHICLE_SPEC_FIELDS) {
    if (spec[f] !== undefined) d[f] = spec[f];
  }
  if (d.make !== undefined && (typeof d.make !== 'string' || !d.make.trim())) {
    return { error: { make: 'required' } };
  }
  if (d.model !== undefined && (typeof d.model !== 'string' || !d.model.trim())) {
    return { error: { model: 'required' } };
  }
  if (d.year !== undefined) {
    const y = Number(d.year);
    const max = new Date().getFullYear() + 1;
    if (!Number.isFinite(y) || y < 1948 || y > max) {
      return { error: { year: 'must be between 1948 and ' + max } };
    }
    d.year = y;
  }
  if (d.ownership_relationship !== undefined && !inList(d.ownership_relationship, OWNERSHIP_RELATIONSHIP)) {
    return { error: { ownership_relationship: 'invalid' } };
  }
  if (d.build_status !== undefined && !inList(d.build_status, BUILD_STATUS)) {
    return { error: { build_status: 'invalid' } };
  }
  if (d.sale_status !== undefined && !inList(d.sale_status, SALE_STATUS)) {
    return { error: { sale_status: 'invalid' } };
  }
  if (d.visibility !== undefined && !inList(d.visibility, VEHICLE_VISIBILITY)) {
    return { error: { visibility: 'invalid' } };
  }
  if (d.verification_status !== undefined && !inList(d.verification_status, VERIFICATION_STATUS)) {
    return { error: { verification_status: 'invalid' } };
  }
  if (d.body_style !== undefined && d.body_style !== null && !inList(d.body_style, BODY_STYLES)) {
    return { error: { body_style: 'invalid' } };
  }
  if (d.drivetrain !== undefined && d.drivetrain !== null && !inList(d.drivetrain, DRIVETRAINS)) {
    return { error: { drivetrain: 'invalid' } };
  }
  if (d.fuel_type !== undefined && d.fuel_type !== null && !inList(d.fuel_type, FUEL_TYPES)) {
    return { error: { fuel_type: 'invalid' } };
  }
  if (d.registration_state !== undefined && d.registration_state !== null && !inList(d.registration_state, REGISTRATION_STATES)) {
    return { error: { registration_state: 'invalid' } };
  }
  return { d };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return err('AUTH_REQUIRED', 401);

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'list';

    // ---- create ----
    if (action === 'create') {
      const vinErr = rejectVinOrRego(body);
      if (vinErr) return vinErr;
      if (!body.model || !body.year) {
        return err('VALIDATION_FAILED', 422, { model: 'required', year: 'required' });
      }
      const v = validateSpec(body);
      if (v.error) return err('VALIDATION_FAILED', 422, v.error);
      const data = { ...v.d, make: v.d.make || 'Honda', verification_status: 'unverified' };
      // verification_status is never client-settable on create.
      delete (data as any).verification_status;
      const vehicle = await base44.entities.Vehicle.create(data);
      // Event: VehicleCreated (TrustScoreService garage_completed progress — deferred).
      return Response.json({ ok: true, vehicle });
    }

    // ---- update ----
    if (action === 'update') {
      const vinErr = rejectVinOrRego(body);
      if (vinErr) return vinErr;
      const { vehicle_id } = body;
      const vehicle = await getOwnedVehicle(base44, vehicle_id, user);
      if (!vehicle) return err('PERMISSION_DENIED', 403);
      // verification_status is not settable via update.
      if (body.verification_status !== undefined) {
        return err('PERMISSION_DENIED', 403, { verification_status: 'use submitVerification/approveVerification/rejectVerification' });
      }
      const v = validateSpec(body);
      if (v.error) return err('VALIDATION_FAILED', 422, v.error);
      // sale_status changes go through changeSaleStatus (transition rules); block here.
      delete (v.d as any).sale_status;
      const updated = await base44.entities.Vehicle.update(vehicle_id, v.d);
      return Response.json({ ok: true, vehicle: updated });
    }

    // ---- setCover ----
    if (action === 'setCover') {
      const { vehicle_id, cover_media_id } = body;
      const vehicle = await getOwnedVehicle(base44, vehicle_id, user);
      if (!vehicle) return err('PERMISSION_DENIED', 403);
      const updated = await base44.entities.Vehicle.update(vehicle_id, { cover_media_id: cover_media_id || null });
      return Response.json({ ok: true, vehicle: updated });
    }

    // ---- changeVisibility ----
    if (action === 'changeVisibility') {
      const { vehicle_id, visibility } = body;
      if (!inList(visibility, VEHICLE_VISIBILITY)) return err('VALIDATION_FAILED', 422, { visibility: 'invalid' });
      const vehicle = await getOwnedVehicle(base44, vehicle_id, user);
      if (!vehicle) return err('PERMISSION_DENIED', 403);
      const updated = await base44.entities.Vehicle.update(vehicle_id, { visibility });
      return Response.json({ ok: true, vehicle: updated });
    }

    // ---- changeSaleStatus ----
    if (action === 'changeSaleStatus') {
      const { vehicle_id, sale_status } = body;
      if (!inList(sale_status, SALE_STATUS)) return err('VALIDATION_FAILED', 422, { sale_status: 'invalid' });
      const vehicle = await getOwnedVehicle(base44, vehicle_id, user);
      if (!vehicle) return err('PERMISSION_DENIED', 403);
      const current = vehicle.sale_status || 'not_for_sale';
      // Business rule: a vehicle must be on the market (for_sale / considering_offers) to be marked sold.
      if (sale_status === 'sold' && !['for_sale', 'considering_offers'].includes(current)) {
        return err('INVALID_STATE_TRANSITION', 409, { sale_status: `cannot move from ${current} to sold` });
      }
      const updated = await base44.entities.Vehicle.update(vehicle_id, { sale_status });
      return Response.json({ ok: true, vehicle: updated });
    }

    // ---- submitVerification ----
    if (action === 'submitVerification') {
      const { vehicle_id } = body;
      const vehicle = await getOwnedVehicle(base44, vehicle_id, user);
      if (!vehicle) return err('PERMISSION_DENIED', 403);
      if (vehicle.verification_status === 'verified') {
        return err('INVALID_STATE_TRANSITION', 409, { verification_status: 'already verified' });
      }
      const updated = await base44.entities.Vehicle.update(vehicle_id, { verification_status: 'pending' });
      return Response.json({ ok: true, vehicle: updated });
    }

    // ---- approveVerification (Mod/Admin) ----
    if (action === 'approveVerification') {
      if (!isModOrAdmin(user)) return err('PERMISSION_DENIED', 403);
      const { vehicle_id } = body;
      let vehicle: any;
      try { vehicle = await base44.asServiceRole.entities.Vehicle.get(vehicle_id); } catch { return err('RESOURCE_NOT_FOUND', 404); }
      if (vehicle.verification_status === 'verified') {
        // Idempotent — re-approving an already-verified vehicle does not double-award trust.
        return Response.json({ ok: true, vehicle, already_verified: true });
      }
      const updated = await base44.asServiceRole.entities.Vehicle.update(vehicle_id, { verification_status: 'verified' });
      // Event: VehicleVerified → award vehicle_verified signal to the owner (idempotent).
      try {
        await awardSignalToUser(base44, {
          target_user_id: vehicle.created_by_id,
          signal_type: SignalType.VEHICLE_VERIFIED,
          reason: 'Vehicle verified by moderator',
          actor: `moderator:${user.id}`,
        });
      } catch (e) { /* logged, non-blocking */ }
      // Notify owner of the verification outcome.
      try {
        await createNotification(base44, {
          recipient_id: vehicle.created_by_id,
          notification_type: NotificationType.MODERATION_OUTCOME,
          actor_id: user.id,
          target_type: 'vehicle',
          target_id: vehicle_id,
        });
      } catch (e) { /* non-blocking */ }
      // Phase 05 wiring: VehicleVerified approval → AuditLog entry (completes the approval workflow).
      try {
        await writeAuditLog(base44, {
          action: AuditActionType.VEHICLE_VERIFICATION_APPROVED,
          actor_type: user.role === 'admin' ? 'admin' : 'moderator',
          actor_id: user.id,
          target_type: 'vehicle',
          target_id: vehicle_id,
          context: `Vehicle "${vehicle.nickname || `${vehicle.make} ${vehicle.model}`}" verified by ${user.role === 'admin' ? 'admin' : 'moderator'}`,
        });
      } catch (e) { /* non-blocking */ }
      return Response.json({ ok: true, vehicle: updated });
    }

    // ---- rejectVerification (Mod/Admin) ----
    if (action === 'rejectVerification') {
      if (!isModOrAdmin(user)) return err('PERMISSION_DENIED', 403);
      const { vehicle_id } = body;
      let vehicle: any;
      try { vehicle = await base44.asServiceRole.entities.Vehicle.get(vehicle_id); } catch { return err('RESOURCE_NOT_FOUND', 404); }
      const updated = await base44.asServiceRole.entities.Vehicle.update(vehicle_id, { verification_status: 'rejected' });
      try {
        await createNotification(base44, {
          recipient_id: vehicle.created_by_id,
          notification_type: NotificationType.MODERATION_OUTCOME,
          actor_id: user.id,
          target_type: 'vehicle',
          target_id: vehicle_id,
        });
      } catch (e) { /* non-blocking */ }
      return Response.json({ ok: true, vehicle: updated });
    }

    // ---- get (aggregated detail) ----
    if (action === 'get') {
      const { vehicle_id } = body;
      let vehicle: any;
      try { vehicle = await base44.asServiceRole.entities.Vehicle.get(vehicle_id); } catch { return err('RESOURCE_NOT_FOUND', 404); }
      // Visibility: non-public vehicles visible only to owner / Mod / Admin.
      if (vehicle.visibility !== 'public' && !isVehicleOwner(vehicle, user) && !isModOrAdmin(user)) {
        return err('RESOURCE_NOT_FOUND', 404);
      }
      const [modifications, timeline, maintenance, performance] = await Promise.all([
        base44.asServiceRole.entities.Modification.filter({ vehicle_id }, '-updated_date', 200),
        base44.asServiceRole.entities.TimelineEntry.filter({ vehicle_id }, '-entry_date', 200),
        base44.asServiceRole.entities.MaintenanceRecord.filter({ vehicle_id, status: 'active' }, '-service_date', 200),
        base44.asServiceRole.entities.PerformanceRecord.filter({ vehicle_id }, '-result_date', 200),
      ]);
      const isOwner = isVehicleOwner(vehicle, user);
      return Response.json({ ok: true, vehicle, modifications, timeline, maintenance, performance, is_owner: isOwner, can_moderate: isModOrAdmin(user) });
    }

    // ---- list (caller's own vehicles) ----
    if (action === 'list') {
      const vehicles = await base44.entities.Vehicle.filter({ created_by_id: user.id }, '-updated_date', 100);
      return Response.json({ ok: true, vehicles });
    }

    // ---- listPublic (browse) ----
    if (action === 'listPublic') {
      const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ visibility: 'public' }, '-updated_date', 100);
      return Response.json({ ok: true, vehicles });
    }

    // ---- listPendingVerification (Mod/Admin) ----
    if (action === 'listPendingVerification') {
      if (!isModOrAdmin(user)) return err('PERMISSION_DENIED', 403);
      const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ verification_status: 'pending' }, '-updated_date', 100);
      return Response.json({ ok: true, vehicles });
    }

    return err('VALIDATION_FAILED', 422, { action: 'unknown' });
  } catch (error) {
    return Response.json({ ok: false, error: { code: 'INTERNAL_ERROR', message: error.message } }, { status: 500 });
  }
});