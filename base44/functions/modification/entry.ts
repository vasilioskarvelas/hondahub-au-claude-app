import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  MOD_CATEGORIES, MOD_STATUS, INSTALLATION_TYPE,
  err, isModOrAdmin, getOwnedVehicle, inList, buildTimelineSuggestion, modSuggestionTitle,
} from "../../shared/garage.ts";
import { validateReference, ReferenceTypes } from "../../shared/reference-resolver.ts";
import { refreshExperienceForUser } from "../../shared/business.ts";

/**
 * ModificationService (Phase 03) — owns structured build/mod records.
 * Actions: create, update, markInstalled, markRemoved, delete, listByVehicle.
 *
 * Hard rules:
 *  - vehicle-owner-only writes.
 *  - installed_by_business_id must reference a verified Business (existence +
 *    verified-gate activate when the Business entity lands in Phase 07; today
 *    the Business backing entity is type-validated only via ReferenceResolver).
 *  - installed_by_business_id only when installation_type is workshop/dealer.
 *  - markInstalled fires ModificationInstalled and returns a user-confirmable
 *    timeline SUGGESTION — never silently auto-publishes a TimelineEntry.
 */

const MOD_FIELDS = [
  'category', 'brand', 'product_name', 'part_number', 'status', 'purchase_date',
  'installation_date', 'installation_type', 'installed_by_business_id',
  'installed_by_user_id', 'installer_name_freetext', 'cost', 'notes',
  'product_link', 'replaced_modification_id',
];

async function validateBusinessTag(base44: any, installation_type: string, business_id: string | undefined): Promise<any> {
  if (!business_id) return null;
  if (!['workshop', 'dealer'].includes(installation_type)) {
    return { installation_type: 'installed_by_business_id requires installation_type workshop/dealer' };
  }
  const ref = await validateReference(base44, {
    target_type: ReferenceTypes.BUSINESS, target_id: business_id, allowedTypes: [ReferenceTypes.BUSINESS],
  });
  if (!ref.valid) return { installed_by_business_id: ref.error || 'invalid business reference' };
  // Verified-gate (Phase 07): a Business must be verified to be tagged on a mod.
  const biz = await base44.asServiceRole.entities.Business.get(business_id).catch(() => null);
  if (!biz) return { installed_by_business_id: 'business not found' };
  if (biz.verification_status !== 'verified') {
    return { installed_by_business_id: 'business must be verified to be tagged' };
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

    // ---- create ----
    if (action === 'create') {
      const { vehicle_id, category, installation_type, installed_by_business_id } = body;
      const vehicle = await getOwnedVehicle(base44, vehicle_id, user);
      if (!vehicle) return err('PERMISSION_DENIED', 403);
      if (!inList(category, MOD_CATEGORIES)) return err('VALIDATION_FAILED', 422, { category: 'invalid' });
      const instType = installation_type || 'unknown';
      if (!inList(instType, INSTALLATION_TYPE)) return err('VALIDATION_FAILED', 422, { installation_type: 'invalid' });
      const bizErr = await validateBusinessTag(base44, instType, installed_by_business_id);
      if (bizErr) return err('VALIDATION_FAILED', 422, bizErr);
      const data: any = { vehicle_id, category, installation_type: instType };
      for (const f of MOD_FIELDS) {
        if (body[f] !== undefined && f !== 'category' && f !== 'installation_type') data[f] = body[f];
      }
      const mod = await base44.entities.Modification.create(data);
      if (mod.installed_by_business_id) {
        await refreshExperienceForUser(base44, user.id, mod.installed_by_business_id).catch(() => {});
      }
      return Response.json({ ok: true, modification: mod });
    }

    // ---- update ----
    if (action === 'update') {
      const { modification_id } = body;
      let mod: any;
      try { mod = await base44.asServiceRole.entities.Modification.get(modification_id); } catch { return err('RESOURCE_NOT_FOUND', 404); }
      const vehicle = await getOwnedVehicle(base44, mod.vehicle_id, user);
      if (!vehicle) return err('PERMISSION_DENIED', 403);
      const data: any = {};
      for (const f of MOD_FIELDS) {
        if (body[f] !== undefined) data[f] = body[f];
      }
      if (data.category !== undefined && !inList(data.category, MOD_CATEGORIES)) return err('VALIDATION_FAILED', 422, { category: 'invalid' });
      if (data.installation_type !== undefined && !inList(data.installation_type, INSTALLATION_TYPE)) return err('VALIDATION_FAILED', 422, { installation_type: 'invalid' });
      if (data.installed_by_business_id !== undefined) {
        const bizErr = await validateBusinessTag(base44, data.installation_type || mod.installation_type || 'unknown', data.installed_by_business_id);
        if (bizErr) return err('VALIDATION_FAILED', 422, bizErr);
      }
      const updated = await base44.entities.Modification.update(modification_id, data);
      const bizId = data.installed_by_business_id !== undefined ? data.installed_by_business_id : mod.installed_by_business_id;
      if (bizId) {
        await refreshExperienceForUser(base44, user.id, bizId).catch(() => {});
      }
      return Response.json({ ok: true, modification: updated });
    }

    // ---- markInstalled ----
    if (action === 'markInstalled') {
      const { modification_id } = body;
      let mod: any;
      try { mod = await base44.asServiceRole.entities.Modification.get(modification_id); } catch { return err('RESOURCE_NOT_FOUND', 404); }
      const vehicle = await getOwnedVehicle(base44, mod.vehicle_id, user);
      if (!vehicle) return err('PERMISSION_DENIED', 403);
      const prev = mod.status;
      if (prev === 'installed') {
        // Idempotent — re-saving an already-installed mod does not re-fire.
        return Response.json({ ok: true, modification: mod, already_installed: true });
      }
      const updated = await base44.entities.Modification.update(modification_id, { status: 'installed', installation_date: mod.installation_date || new Date().toISOString().slice(0, 10) });
      // Event: ModificationInstalled → propose a user-confirmable timeline suggestion (never auto-publish).
      const suggestion = buildTimelineSuggestion({
        vehicle_id: mod.vehicle_id,
        entry_type: 'modification',
        entry_date: updated.installation_date || new Date().toISOString().slice(0, 10),
        title: modSuggestionTitle(mod.category, mod.brand, mod.product_name),
        linked_modification_id: modification_id,
      });
      return Response.json({ ok: true, modification: updated, timeline_suggestion: suggestion });
    }

    // ---- markRemoved ----
    if (action === 'markRemoved') {
      const { modification_id } = body;
      let mod: any;
      try { mod = await base44.asServiceRole.entities.Modification.get(modification_id); } catch { return err('RESOURCE_NOT_FOUND', 404); }
      const vehicle = await getOwnedVehicle(base44, mod.vehicle_id, user);
      if (!vehicle) return err('PERMISSION_DENIED', 403);
      const updated = await base44.entities.Modification.update(modification_id, { status: 'removed' });
      return Response.json({ ok: true, modification: updated });
    }

    // ---- delete ----
    if (action === 'delete') {
      const { modification_id } = body;
      let mod: any;
      try { mod = await base44.asServiceRole.entities.Modification.get(modification_id); } catch { return err('RESOURCE_NOT_FOUND', 404); }
      const vehicle = await getOwnedVehicle(base44, mod.vehicle_id, user);
      if (!vehicle) return err('PERMISSION_DENIED', 403);
      // Only delete if never published to a timeline entry — else use markRemoved.
      const linked = await base44.asServiceRole.entities.TimelineEntry.filter({ linked_modification_id: modification_id });
      if (linked.length > 0) {
        return err('INVALID_STATE_TRANSITION', 409, { modification: 'published to timeline — use markRemoved instead' });
      }
      await base44.entities.Modification.delete(modification_id);
      return Response.json({ ok: true });
    }

    // ---- listByVehicle ----
    if (action === 'listByVehicle') {
      const { vehicle_id } = body;
      const mods = await base44.asServiceRole.entities.Modification.filter({ vehicle_id }, '-updated_date', 200);
      return Response.json({ ok: true, modifications: mods });
    }

    return err('VALIDATION_FAILED', 422, { action: 'unknown' });
  } catch (error) {
    return Response.json({ ok: false, error: { code: 'INTERNAL_ERROR', message: error.message } }, { status: 500 });
  }
});