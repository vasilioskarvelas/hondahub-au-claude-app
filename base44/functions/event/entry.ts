/**
 * EventService (Phase 06) — owns Event and EventAttendance.
 *
 * Single-Writer: this function is the ONLY writer to Event and EventAttendance.
 * Reads (never writes) Vehicle (attending_vehicle_id ownership), GroupMembership
 * (GrpMod/GrpOwn role check), and Business/BusinessMembership (BizMgr/BizOwn —
 * Phase 07, generically implemented now; end-to-end test deferred and tracked).
 *
 * Methods (§3.2): createEvent, updateEvent, cancelEvent, attendEvent,
 *   withdrawAttendance. Plus read helpers (listDirectory, getEvent, listMyAttendance).
 *
 * Hard rules enforced (§6):
 *  - Three-part Event creation gate (§6.7): (a) Trusted Member+ (or Mod/Admin
 *    exempt, ADR-039); (b) if group_id set, caller holds GrpMod/GrpOwn on that
 *    Group; (c) if business_id set, caller holds BizMgr/BizOwn on that Business.
 *  - starts_at cannot be in the past at CREATION (§2.3); ends_at > starts_at.
 *  - organiser polymorphism restricted to USER/BUSINESS via ReferenceResolverService (§6.8).
 *  - attending_vehicle_id must belong to the attending user (§6.6).
 *  - Unique on (event_id, user_id); re-attending updates status, never duplicates (§6.5).
 *  - attendee_count recomputed from EventAttendance (status=going).
 *  - No events triggered (§5). No AI write path (§6.10).
 *  - cancelEvent is audit-logged (EVENT_CANCELLED); moderation removals go
 *    through ModerationService → content-moderation delegate.
 */
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import {
  EventStatus, AttendanceStatus, OrganiserType, ORGANISER_TYPES,
  meetsCreationTier, meetsParticipationTier, accountInGoodStanding,
  isGroupManager, actorTypeFor,
} from "../../shared/community.ts";
import { GroupRole, MembershipStatus } from "../../shared/community.ts";
import { validateReference } from "../../shared/reference-resolver.ts";
import { writeAuditLog } from "../../shared/audit-log.ts";
import { AuditActionType } from "../../shared/moderation.ts";
import { json, err } from "../../shared/http.ts";
import { resolveMediaUrl } from "../../shared/media.ts";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // ---------- createEvent ----------
    if (action === "createEvent") {
      if (!user) return err("AUTH_REQUIRED", 401);
      if (!accountInGoodStanding(user)) {
        return err(user.account_status === "banned" ? "ACCOUNT_BANNED" : "ACCOUNT_SUSPENDED", 403);
      }
      // (a) tier gate (ADR-039 — Mod/Admin exempt).
      if (!meetsCreationTier(user)) {
        return err("EVENT_CREATION_TIER_REQUIRED", 403, { current_tier: user.account_tier, required_tier: "trusted_member" });
      }
      const organiser_type = body.organiser_type;
      if (!ORGANISER_TYPES.includes(organiser_type)) {
        return err("VALIDATION_FAILED", 422, { organiser_type: "must be user or business" });
      }
      // (b) group connection role check (§6.7).
      if (body.group_id) {
        const roleOk = await holdsGroupManagerRole(base44, user.id, body.group_id);
        if (!roleOk) {
          return err("EVENT_CREATION_TIER_REQUIRED", 403, { reason: "missing_group_role", required_role: ["GrpMod", "GrpOwn"] });
        }
      }
      // (c) business connection role check (§6.7) — Phase 07; generically implemented.
      if (body.business_id) {
        const roleOk = await holdsBusinessManagerRole(base44, user.id, body.business_id);
        if (!roleOk) {
          return err("EVENT_CREATION_TIER_REQUIRED", 403, { reason: "missing_business_role", required_role: ["BizMgr", "BizOwn"] });
        }
      }
      // organiser resolution + good standing.
      let organiser_id = body.organiser_id;
      if (organiser_type === OrganiserType.USER) {
        // A user organises as themselves (Mod/Admin operational exemption may set another existing user).
        if (!organiser_id) organiser_id = user.id;
        if (organiser_id !== user.id && !(user.role === "admin" || user.account_tier === "moderator")) {
          return err("PERMISSION_DENIED", 403, { organiser_id: "you may only organise as yourself" });
        }
        // Skip existence check when the organiser is the current user — they're already authenticated.
        if (organiser_id !== user.id) {
          const ref = await validateReference(base44, { target_type: "user", target_id: organiser_id, allowedTypes: ["user"] });
          if (!ref.valid) return err("VALIDATION_FAILED", 422, { organiser_id: ref.error });
          const org = await base44.asServiceRole.entities.User.get(organiser_id).catch(() => null);
          if (org && (org.account_status === "suspended" || org.account_status === "banned")) {
            return err("VALIDATION_FAILED", 422, { organiser_id: "organiser not in good standing" });
          }
        }
      } else {
        // business — Phase 07. organiser_id must equal business_id connection.
        if (body.business_id && organiser_id !== body.business_id) {
          return err("VALIDATION_FAILED", 422, { organiser_id: "must match business_id for a business-organised event" });
        }
        const ref = await validateReference(base44, { target_type: "business", target_id: organiser_id, allowedTypes: ["business"] });
        if (!ref.valid) return err("VALIDATION_FAILED", 422, { organiser_id: ref.error });
      }
      const title = (body.title || "").trim();
      if (!title || title.length > 200) return err("VALIDATION_FAILED", 422, { title: "required, max 200 chars" });
      const starts_at = body.starts_at;
      if (!starts_at) return err("VALIDATION_FAILED", 422, { starts_at: "required" });
      const startMs = Date.parse(starts_at);
      if (isNaN(startMs)) return err("VALIDATION_FAILED", 422, { starts_at: "invalid datetime" });
      // §2.3 — starts_at cannot be in the past at CREATION.
      if (startMs < Date.now()) return err("VALIDATION_FAILED", 422, { starts_at: "cannot be in the past" });
      let ends_at: string | null = body.ends_at || null;
      if (ends_at) {
        const endMs = Date.parse(ends_at);
        if (isNaN(endMs)) return err("VALIDATION_FAILED", 422, { ends_at: "invalid datetime" });
        if (endMs <= startMs) return err("VALIDATION_FAILED", 422, { ends_at: "must be after starts_at" });
      }
      const description = (body.description || "").trim() || null;
      const location_name = (body.location_name || "").trim() || null;
      const location_general = (body.location_general || "").trim() || null;
      const event = await base44.entities.Event.create({
        organiser_type, organiser_id, title, description,
        location_name, location_general, starts_at, ends_at,
        status: EventStatus.PUBLISHED, attendee_count: 0,
        group_id: body.group_id || null,
        business_id: body.business_id || null,
        cover_media_id: body.cover_media_id || null,
      });
      return json({ ok: true, event });
    }

    // ---------- updateEvent (organiser-only) ----------
    if (action === "updateEvent") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const event = await base44.entities.Event.get(body.event_id).catch(() => null);
      if (!event) return err("RESOURCE_NOT_FOUND", 404);
      if (!await isOrganiser(base44, user, event)) return err("PERMISSION_DENIED", 403);
      if (event.status !== EventStatus.PUBLISHED) return err("INVALID_STATE_TRANSITION", 409);
      const upd: any = {};
      if (body.title !== undefined) {
        const t = (body.title || "").trim();
        if (!t || t.length > 200) return err("VALIDATION_FAILED", 422, { title: "required, max 200 chars" });
        upd.title = t;
      }
      if (body.description !== undefined) upd.description = (body.description || "").trim() || null;
      if (body.location_name !== undefined) upd.location_name = (body.location_name || "").trim() || null;
      if (body.location_general !== undefined) upd.location_general = (body.location_general || "").trim() || null;
      if (body.starts_at !== undefined) {
        const ms = Date.parse(body.starts_at);
        if (isNaN(ms)) return err("VALIDATION_FAILED", 422, { starts_at: "invalid datetime" });
        upd.starts_at = body.starts_at;
      }
      if (body.ends_at !== undefined) {
        if (body.ends_at) {
          const endMs = Date.parse(body.ends_at);
          const startMs = Date.parse(upd.starts_at || event.starts_at);
          if (isNaN(endMs) || endMs <= startMs) return err("VALIDATION_FAILED", 422, { ends_at: "must be after starts_at" });
          upd.ends_at = body.ends_at;
        } else {
          upd.ends_at = null;
        }
      }
      const updated = await base44.entities.Event.update(body.event_id, upd);
      return json({ ok: true, event: updated });
    }

    // ---------- cancelEvent (organiser-only) ----------
    if (action === "cancelEvent") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const event = await base44.entities.Event.get(body.event_id).catch(() => null);
      if (!event) return err("RESOURCE_NOT_FOUND", 404);
      if (!await isOrganiser(base44, user, event)) return err("PERMISSION_DENIED", 403);
      if (event.status !== EventStatus.PUBLISHED) {
        return err("INVALID_STATE_TRANSITION", 409, { current: event.status });
      }
      const updated = await base44.entities.Event.update(body.event_id, { status: EventStatus.CANCELLED });
      // §2.3 — cancellations are audit-logged.
      await writeAuditLog(base44, {
        action: AuditActionType.EVENT_CANCELLED,
        actor_type: actorTypeFor(user), actor_id: user.id,
        target_type: "event", target_id: body.event_id,
        context: JSON.stringify({ title: event.title }),
      }).catch(() => {});
      return json({ ok: true, event: updated });
    }

    // ---------- attendEvent ----------
    if (action === "attendEvent") {
      if (!user) return err("AUTH_REQUIRED", 401);
      if (!meetsParticipationTier(user)) return err("PERMISSION_DENIED", 403);
      const event = await base44.entities.Event.get(body.event_id).catch(() => null);
      if (!event || event.status !== EventStatus.PUBLISHED) return err("RESOURCE_NOT_FOUND", 404);
      const status = body.status || AttendanceStatus.GOING;
      if (![AttendanceStatus.GOING, AttendanceStatus.INTERESTED].includes(status)) {
        return err("VALIDATION_FAILED", 422, { status: "must be going or interested" });
      }
      // attending_vehicle_id ownership check (§6.6).
      if (body.attending_vehicle_id) {
        const vehicle = await base44.asServiceRole.entities.Vehicle.get(body.attending_vehicle_id).catch(() => null);
        if (!vehicle) return err("VALIDATION_FAILED", 422, { attending_vehicle_id: "not found" });
        if (vehicle.created_by_id !== user.id) {
          return err("PERMISSION_DENIED", 403, { attending_vehicle_id: "vehicle must belong to you" });
        }
      }
      const existing = await base44.entities.EventAttendance.filter({ event_id: body.event_id, user_id: user.id });
      const prev = existing[0];
      let attendance;
      if (prev) {
        // Unique on (event_id, user_id) — update existing row's status, never duplicate (§6.5).
        attendance = await base44.entities.EventAttendance.update(prev.id, {
          status, attending_vehicle_id: body.attending_vehicle_id || null,
        });
      } else {
        attendance = await base44.entities.EventAttendance.create({
          event_id: body.event_id, user_id: user.id, status,
          attending_vehicle_id: body.attending_vehicle_id || null,
        });
      }
      await recomputeAttendeeCount(base44, body.event_id);
      return json({ ok: true, attendance_status: status, attendance });
    }

    // ---------- withdrawAttendance (the attendee themselves) ----------
    if (action === "withdrawAttendance") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const existing = await base44.entities.EventAttendance.filter({ event_id: body.event_id, user_id: user.id });
      const prev = existing[0];
      if (!prev) return err("VALIDATION_FAILED", 422, { attendance: "you are not attending" });
      // Hard-delete on withdrawal (§2.4 — no moderation/audit value in retaining).
      await base44.entities.EventAttendance.delete(prev.id);
      await recomputeAttendeeCount(base44, body.event_id);
      return json({ ok: true });
    }

    // All remaining (read) actions require auth.
    if (!user) return err("AUTH_REQUIRED", 401);

    // ---------- getEvent ----------
    if (action === "getEvent") {
      const event = await base44.entities.Event.get(body.event_id).catch(() => null);
      if (!event) return err("RESOURCE_NOT_FOUND", 404);
      const organiser = await resolveOrganiser(base44, event);
      const myAttendance = (await base44.entities.EventAttendance.filter({ event_id: event.id, user_id: user.id }))[0] || null;
      const attendances = await base44.entities.EventAttendance.filter({ event_id: event.id, status: AttendanceStatus.GOING }, "created_date", 500);
      const attendees = await enrichAttendees(base44, attendances);
      let group: any = null;
      if (event.group_id) {
        group = await base44.asServiceRole.entities.Group.get(event.group_id).catch(() => null);
      }
      const cover_url = await resolveMediaUrl(base44, event.cover_media_id);
      const is_organiser = await isOrganiser(base44, user, event);
      return json({ ok: true, event: { ...event, cover_url }, organiser, my_attendance: myAttendance, attendees, group, is_organiser });
    }

    // ---------- listDirectory (starts_at ASC — soonest first, §8.4) ----------
    if (action === "listDirectory") {
      const all = await base44.entities.Event.filter({ status: EventStatus.PUBLISHED }, "starts_at", 200);
      let upcoming = all.filter((e: any) => new Date(e.starts_at).getTime() >= Date.now() - 24 * 3600 * 1000);
      // date range + location filters (§8.4).
      if (body.from) {
        const fromMs = Date.parse(body.from);
        if (!isNaN(fromMs)) upcoming = upcoming.filter((e: any) => new Date(e.starts_at).getTime() >= fromMs);
      }
      if (body.to) {
        const toMs = Date.parse(body.to);
        if (!isNaN(toMs)) upcoming = upcoming.filter((e: any) => new Date(e.starts_at).getTime() <= toMs);
      }
      if (body.location) {
        const q = String(body.location).toLowerCase();
        upcoming = upcoming.filter((e: any) => (e.location_general || "").toLowerCase().includes(q) || (e.location_name || "").toLowerCase().includes(q));
      }
      if (body.search) {
        const q = String(body.search).toLowerCase();
        upcoming = upcoming.filter((e: any) => (e.title || "").toLowerCase().includes(q));
      }
      upcoming.sort((a: any, b: any) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
      const enriched = await Promise.all(upcoming.map(async (e: any) => {
        const org = await resolveOrganiser(base44, e);
        return { ...e, cover_url: await resolveMediaUrl(base44, e.cover_media_id), organiser_name: org.name, organiser_handle: org.handle || null, organiser_type: org.type, organiser_id: org.id };
      }));
      return json({ ok: true, events: enriched });
    }

    // ---------- listMyAttendance ----------
    if (action === "listMyAttendance") {
      const mine = await base44.entities.EventAttendance.filter({ user_id: user.id, status: { $in: [AttendanceStatus.GOING, AttendanceStatus.INTERESTED] } }, "-created_date", 200);
      const events = await Promise.all(mine.map(async (a: any) => {
        const e = await base44.entities.Event.get(a.event_id).catch(() => null);
        if (!e || e.status !== EventStatus.PUBLISHED) return null;
        const org = await resolveOrganiser(base44, e);
        return { ...e, cover_url: await resolveMediaUrl(base44, e.cover_media_id), organiser_name: org.name, my_attendance_status: a.status, attending_vehicle_id: a.attending_vehicle_id };
      }));
      return json({ ok: true, events: events.filter(Boolean) });
    }

    return err("VALIDATION_FAILED", 422, { action: "unknown" });
  } catch (error) {
    return json({ error: error.message }, 500);
  }
});

// ---- helpers ----

async function isOrganiser(base44: any, user: any, event: any): Promise<boolean> {
  if (user.role === "admin" || user.account_tier === "moderator") return true; // operational exemption
  if (event.organiser_type === OrganiserType.USER) return event.organiser_id === user.id;
  // business — caller must hold BizMgr/BizOwn on that business.
  return holdsBusinessManagerRole(base44, user.id, event.organiser_id);
}

async function holdsGroupManagerRole(base44: any, userId: string, groupId: string): Promise<boolean> {
  const rows = await base44.entities.GroupMembership.filter({ group_id: groupId, user_id: userId, status: MembershipStatus.ACTIVE });
  return rows.some((m: any) => isGroupManager(m.role));
}

async function holdsBusinessManagerRole(base44: any, userId: string, businessId: string): Promise<boolean> {
  // Phase 07 — BusinessMembership entity not yet built. Build the check generically;
  // if the entity doesn't exist, no membership can be found → reject. End-to-end test
  // is deferred and explicitly tracked, never silently marked passing (§9.7).
  try {
    const rows = await base44.asServiceRole.entities.BusinessMembership.filter({ business_id: businessId, user_id: userId, status: "active" });
    return rows.some((m: any) => m.role === "owner" || m.role === "staff");
  } catch {
    return false;
  }
}

async function resolveOrganiser(base44: any, event: any) {
  if (event.organiser_type === OrganiserType.USER) {
    const u = await base44.asServiceRole.entities.User.get(event.organiser_id).catch(() => null);
    return { type: "user", id: event.organiser_id, name: u?.display_name || u?.handle || "Organiser", handle: u?.handle || null };
  }
  try {
    const b = await base44.asServiceRole.entities.Business.get(event.organiser_id);
    return { type: "business", id: event.organiser_id, name: b?.name || "Business" };
  } catch {
    return { type: "business", id: event.organiser_id, name: "Business organiser" };
  }
}

async function recomputeAttendeeCount(base44: any, eventId: string) {
  const going = await base44.entities.EventAttendance.filter({ event_id: eventId, status: AttendanceStatus.GOING });
  await base44.entities.Event.update(eventId, { attendee_count: going.length });
}

async function enrichAttendees(base44: any, attendances: any[]) {
  return Promise.all(attendances.map(async (a: any) => {
    const u = await base44.asServiceRole.entities.User.get(a.user_id).catch(() => null);
    let vehicle: any = null;
    if (a.attending_vehicle_id) {
      const v = await base44.asServiceRole.entities.Vehicle.get(a.attending_vehicle_id).catch(() => null);
      if (v) vehicle = { id: v.id, nickname: v.nickname, make: v.make, model: v.model, year: v.year };
    }
    return {
      user_id: a.user_id,
      status: a.status,
      display_name: u?.display_name || u?.handle || "Attendee",
      handle: u?.handle || null,
      avatar_media_id: u?.avatar_media_id || null,
      vehicle,
    };
  }));
}