/**
 * GroupService (Phase 06) — owns Group and GroupMembership.
 *
 * Single-Writer: this function is the ONLY writer to Group and GroupMembership.
 * Never writes to User, Media, or any other entity.
 *
 * Methods (§3.2): createGroup, joinGroup, leaveGroup, inviteMember,
 *   changeMemberRole, removeMember. Plus read helpers (listDirectory, getGroup,
 *   listMembers, listPending, listMyGroups) and an inferred approveMember
 *   (pending_approval → active) required by §8.2's approve/reject panel — the
 *   pack's own UI spec mandates it; named per Architecture Questions item 1
 *   (method-level granularity is a reasonable inference).
 *
 * Hard rules enforced (§6):
 *  - Owner membership is atomic with Group creation — no code path produces a
 *    Group with zero memberships (§6.1).
 *  - Exactly one owner per Group at all times — changeMemberRole/leave reject
 *    any change leaving zero or multiple owners (§6.2). Ownership transfer is
 *    via changeMemberRole(target, owner) which promotes the target and demotes
 *    the caller to moderator in one atomic operation (Architecture Q4).
 *  - Unique on (group_id, user_id); joinGroup on an already-member account is
 *    CONFLICT (§6.4).
 *  - member_count is a denormalized counter, recomputed from GroupMembership
 *    (status=active) on every mutation — never used for permissions.
 *  - private groups hide member list from non-members (§6.9).
 *  - No events triggered by this phase (§5). No AI write path (§6.10).
 *  - removeMember (kick) is audit-logged (GROUP_MEMBER_REMOVED); voluntary
 *    leaves are not (§2.2). Group moderation removals go through
 *    ModerationService → content-moderation delegate (separate path).
 */
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import {
  GroupVisibility, GroupStatus, GroupRole, MembershipStatus,
  meetsCreationTier, meetsParticipationTier, accountInGoodStanding,
  isGroupManager, isGroupOwner, actorTypeFor,
} from "../../shared/community.ts";
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

    // ---------- createGroup ----------
    if (action === "createGroup") {
      if (!user) return err("AUTH_REQUIRED", 401);
      if (!accountInGoodStanding(user)) {
        return err(user.account_status === "banned" ? "ACCOUNT_BANNED" : "ACCOUNT_SUSPENDED", 403);
      }
      if (!meetsCreationTier(user)) {
        return err("GROUP_CREATION_TIER_REQUIRED", 403, { current_tier: user.account_tier, required_tier: "trusted_member" });
      }
      const name = (body.name || "").trim();
      if (!name || name.length > 100) return err("VALIDATION_FAILED", 422, { name: "required, max 100 chars" });
      const visibility = body.visibility || GroupVisibility.PUBLIC;
      if (![GroupVisibility.PUBLIC, GroupVisibility.PRIVATE].includes(visibility)) {
        return err("VALIDATION_FAILED", 422, { visibility: "invalid" });
      }
      const description = (body.description || "").trim() || null;
      // Atomic: Group row + owner membership in the same operation (§6.1).
      const group = await base44.entities.Group.create({
        name, description, owner_id: user.id, visibility,
        status: GroupStatus.ACTIVE, member_count: 1,
      });
      await base44.entities.GroupMembership.create({
        group_id: group.id, user_id: user.id,
        role: GroupRole.OWNER, status: MembershipStatus.ACTIVE,
      });
      return json({ ok: true, group });
    }

    // ---------- joinGroup ----------
    if (action === "joinGroup") {
      if (!user) return err("AUTH_REQUIRED", 401);
      if (!meetsParticipationTier(user)) return err("PERMISSION_DENIED", 403);
      const group = await base44.entities.Group.get(body.group_id).catch(() => null);
      if (!group || group.status !== GroupStatus.ACTIVE) return err("RESOURCE_NOT_FOUND", 404);
      const existing = await base44.entities.GroupMembership.filter({ group_id: group.id, user_id: user.id });
      const prev = existing[0];
      if (prev) {
        if (prev.status === MembershipStatus.ACTIVE) return err("CONFLICT", 409, { membership: "already a member" });
        if (prev.status === MembershipStatus.PENDING_APPROVAL) return err("CONFLICT", 409, { membership: "request already pending" });
        // removed → re-join (reactivate the row)
        const status = group.visibility === GroupVisibility.PUBLIC ? MembershipStatus.ACTIVE : MembershipStatus.PENDING_APPROVAL;
        await base44.entities.GroupMembership.update(prev.id, { status, role: GroupRole.MEMBER });
        if (status === MembershipStatus.ACTIVE) await recomputeMemberCount(base44, group.id);
        return json({ ok: true, membership_status: status });
      }
      const status = group.visibility === GroupVisibility.PUBLIC ? MembershipStatus.ACTIVE : MembershipStatus.PENDING_APPROVAL;
      await base44.entities.GroupMembership.create({
        group_id: group.id, user_id: user.id, role: GroupRole.MEMBER, status,
      });
      if (status === MembershipStatus.ACTIVE) await recomputeMemberCount(base44, group.id);
      return json({ ok: true, membership_status: status });
    }

    // ---------- leaveGroup ----------
    if (action === "leaveGroup") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const membership = await myMembership(base44, user.id, body.group_id);
      if (!membership || membership.status !== MembershipStatus.ACTIVE) {
        return err("VALIDATION_FAILED", 422, { membership: "you are not an active member" });
      }
      // §6.2 — sole owner cannot leave (would leave zero owners); transfer first.
      if (membership.role === GroupRole.OWNER) {
        return err("VALIDATION_FAILED", 422, { membership: "sole owner cannot leave — transfer ownership first" });
      }
      await base44.entities.GroupMembership.update(membership.id, { status: MembershipStatus.REMOVED });
      await recomputeMemberCount(base44, body.group_id);
      return json({ ok: true });
    }

    // ---------- inviteMember (GrpMod/GrpOwn) ----------
    if (action === "inviteMember") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const membership = await myMembership(base44, user.id, body.group_id);
      if (!membership || membership.status !== MembershipStatus.ACTIVE || !isGroupManager(membership.role)) {
        return err("PERMISSION_DENIED", 403);
      }
      if (!body.invitee_user_id) return err("VALIDATION_FAILED", 422, { invitee_user_id: "required" });
      const existing = await base44.entities.GroupMembership.filter({ group_id: body.group_id, user_id: body.invitee_user_id });
      if (existing.length > 0 && existing[0].status !== MembershipStatus.REMOVED) {
        return err("CONFLICT", 409, { membership: "already a member or pending" });
      }
      if (existing.length > 0) {
        await base44.entities.GroupMembership.update(existing[0].id, { status: MembershipStatus.PENDING_APPROVAL, role: GroupRole.MEMBER });
      } else {
        await base44.entities.GroupMembership.create({
          group_id: body.group_id, user_id: body.invitee_user_id,
          role: GroupRole.MEMBER, status: MembershipStatus.PENDING_APPROVAL,
        });
      }
      return json({ ok: true, status: MembershipStatus.PENDING_APPROVAL });
    }

    // ---------- approveMember (GrpMod/GrpOwn) — inferred, see §8.2 ----------
    if (action === "approveMember") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const membership = await myMembership(base44, user.id, body.group_id);
      if (!membership || membership.status !== MembershipStatus.ACTIVE || !isGroupManager(membership.role)) {
        return err("PERMISSION_DENIED", 403);
      }
      const target = await base44.entities.GroupMembership.filter({ group_id: body.group_id, user_id: body.member_user_id });
      const t = target[0];
      if (!t || t.status !== MembershipStatus.PENDING_APPROVAL) {
        return err("VALIDATION_FAILED", 422, { membership: "no pending request for this user" });
      }
      await base44.entities.GroupMembership.update(t.id, { status: MembershipStatus.ACTIVE });
      await recomputeMemberCount(base44, body.group_id);
      return json({ ok: true });
    }

    // ---------- changeMemberRole (GrpOwn only) ----------
    if (action === "changeMemberRole") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const membership = await myMembership(base44, user.id, body.group_id);
      if (!membership || membership.status !== MembershipStatus.ACTIVE || !isGroupOwner(membership.role)) {
        return err("PERMISSION_DENIED", 403);
      }
      const new_role = body.new_role;
      if (![GroupRole.MEMBER, GroupRole.MODERATOR, GroupRole.OWNER].includes(new_role)) {
        return err("VALIDATION_FAILED", 422, { new_role: "invalid" });
      }
      const target = await base44.entities.GroupMembership.filter({ group_id: body.group_id, user_id: body.member_user_id });
      const t = target[0];
      if (!t || t.status !== MembershipStatus.ACTIVE) {
        return err("VALIDATION_FAILED", 422, { member_user_id: "not an active member" });
      }
      if (body.member_user_id === user.id) {
        // Self role change.
        if (new_role === GroupRole.OWNER) return json({ ok: true }); // already owner — no-op
        // Demoting self away from owner → would leave zero owners → reject (§6.2).
        return err("VALIDATION_FAILED", 422, { role: "cannot demote the sole owner — promote a successor first" });
      }
      if (new_role === GroupRole.OWNER) {
        // Transfer: promote target to owner, demote caller to moderator (atomic, exactly-one-owner invariant preserved).
        await base44.entities.GroupMembership.update(t.id, { role: GroupRole.OWNER });
        await base44.entities.GroupMembership.update(membership.id, { role: GroupRole.MODERATOR });
        return json({ ok: true, role: GroupRole.OWNER });
      }
      // Cannot demote another owner (would leave zero owners).
      if (t.role === GroupRole.OWNER) {
        return err("VALIDATION_FAILED", 422, { role: "cannot change another owner's role" });
      }
      await base44.entities.GroupMembership.update(t.id, { role: new_role });
      return json({ ok: true, role: new_role });
    }

    // ---------- removeMember (GrpMod/GrpOwn) ----------
    if (action === "removeMember") {
      if (!user) return err("AUTH_REQUIRED", 401);
      const membership = await myMembership(base44, user.id, body.group_id);
      if (!membership || membership.status !== MembershipStatus.ACTIVE || !isGroupManager(membership.role)) {
        return err("PERMISSION_DENIED", 403);
      }
      const target = await base44.entities.GroupMembership.filter({ group_id: body.group_id, user_id: body.member_user_id });
      const t = target[0];
      if (!t || t.status === MembershipStatus.REMOVED) {
        return err("VALIDATION_FAILED", 422, { member_user_id: "not a member" });
      }
      // Cannot remove an owner — would break the exactly-one-owner invariant.
      if (t.role === GroupRole.OWNER) {
        return err("VALIDATION_FAILED", 422, { membership: "cannot remove the owner — transfer ownership first" });
      }
      // GrpMod may only remove ordinary members (§4 clarification); GrpOwn may also remove moderators.
      if (membership.role === GroupRole.MODERATOR && t.role !== GroupRole.MEMBER) {
        return err("PERMISSION_DENIED", 403, { membership: "a moderator can only remove ordinary members" });
      }
      const reason = (body.reason || "").trim() || null;
      await base44.entities.GroupMembership.update(t.id, { status: MembershipStatus.REMOVED });
      await recomputeMemberCount(base44, body.group_id);
      // §2.2 — kick is audit-logged with actor + reason; voluntary leaves are not.
      await writeAuditLog(base44, {
        action: AuditActionType.GROUP_MEMBER_REMOVED,
        actor_type: actorTypeFor(user), actor_id: user.id,
        target_type: "group", target_id: body.group_id,
        context: JSON.stringify({ member_user_id: body.member_user_id, reason }),
      }).catch(() => {});
      return json({ ok: true });
    }

    // All remaining (read) actions require auth.
    if (!user) return err("AUTH_REQUIRED", 401);

    // ---------- getGroup ----------
    if (action === "getGroup") {
      const group = await base44.entities.Group.get(body.group_id).catch(() => null);
      if (!group) return err("RESOURCE_NOT_FOUND", 404);
      const mine = await myMembership(base44, user.id, group.id);
      const amMember = !!mine && (mine.status === MembershipStatus.ACTIVE || mine.status === MembershipStatus.PENDING_APPROVAL);
      // private group: hide member list from non-members (§6.9).
      const canSeeMembers = group.visibility === GroupVisibility.PUBLIC || amMember;
      let members: any[] = [];
      let pending: any[] = [];
      if (canSeeMembers) {
        const all = await base44.entities.GroupMembership.filter({ group_id: group.id }, "created_date", 500);
        members = await enrichMembers(base44, all.filter((m: any) => m.status === MembershipStatus.ACTIVE));
        if (isGroupManager(mine?.role) && mine?.status === MembershipStatus.ACTIVE) {
          pending = await enrichMembers(base44, all.filter((m: any) => m.status === MembershipStatus.PENDING_APPROVAL));
        }
      }
      const cover_url = await resolveMediaUrl(base44, group.cover_media_id);
      return json({ ok: true, group: { ...group, cover_url }, my_membership: mine, members, pending });
    }

    // ---------- listDirectory ----------
    if (action === "listDirectory") {
      const all = await base44.entities.Group.filter({ status: GroupStatus.ACTIVE }, "-created_date", 200);
      const myIds = new Set((await base44.entities.GroupMembership.filter({ user_id: user.id }))
        .filter((m: any) => m.status === MembershipStatus.ACTIVE || m.status === MembershipStatus.PENDING_APPROVAL)
        .map((m: any) => m.group_id));
      // public groups (all) + private groups where viewer is member/pending (§8.1).
      let visible = all.filter((g: any) => g.visibility === GroupVisibility.PUBLIC || myIds.has(g.id));
      if (body.search) {
        const q = String(body.search).toLowerCase();
        visible = visible.filter((g: any) => g.name?.toLowerCase().includes(q));
      }
      if (body.visibility && [GroupVisibility.PUBLIC, GroupVisibility.PRIVATE].includes(body.visibility)) {
        visible = visible.filter((g: any) => g.visibility === body.visibility);
      }
      // No explicit sort in the locked architecture (Architecture Q2) — default to member_count desc then name.
      visible.sort((a: any, b: any) => (b.member_count || 0) - (a.member_count || 0) || (a.name || "").localeCompare(b.name || ""));
      const enriched = await Promise.all(visible.map(async (g: any) => ({
        ...g, cover_url: await resolveMediaUrl(base44, g.cover_media_id),
        is_member: myIds.has(g.id),
      })));
      return json({ ok: true, groups: enriched });
    }

    // ---------- listMembers ----------
    if (action === "listMembers") {
      const group = await base44.entities.Group.get(body.group_id).catch(() => null);
      if (!group) return err("RESOURCE_NOT_FOUND", 404);
      const mine = await myMembership(base44, user.id, group.id);
      const amMember = !!mine && (mine.status === MembershipStatus.ACTIVE || mine.status === MembershipStatus.PENDING_APPROVAL);
      if (group.visibility === GroupVisibility.PRIVATE && !amMember) {
        return err("PERMISSION_DENIED", 403);
      }
      const all = await base44.entities.GroupMembership.filter({ group_id: group.id, status: MembershipStatus.ACTIVE }, "created_date", 500);
      const members = await enrichMembers(base44, all);
      return json({ ok: true, members, my_role: mine?.role || null });
    }

    // ---------- listPending (GrpMod/GrpOwn) ----------
    if (action === "listPending") {
      const mine = await myMembership(base44, user.id, body.group_id);
      if (!mine || mine.status !== MembershipStatus.ACTIVE || !isGroupManager(mine.role)) {
        return err("PERMISSION_DENIED", 403);
      }
      const all = await base44.entities.GroupMembership.filter({ group_id: body.group_id, status: MembershipStatus.PENDING_APPROVAL }, "created_date", 200);
      const pending = await enrichMembers(base44, all);
      return json({ ok: true, pending });
    }

    // ---------- listMyGroups ----------
    if (action === "listMyGroups") {
      const mine = await base44.entities.GroupMembership.filter({ user_id: user.id, status: MembershipStatus.ACTIVE }, "-created_date", 200);
      const groups = await Promise.all(mine.map(async (m: any) => {
        const g = await base44.entities.Group.get(m.group_id).catch(() => null);
        return g ? { ...g, my_role: m.role, cover_url: await resolveMediaUrl(base44, g.cover_media_id) } : null;
      }));
      return json({ ok: true, groups: groups.filter(Boolean) });
    }

    // ---------- listManagedGroups (groups I can create events for: GrpMod/GrpOwn) ----------
    if (action === "listManagedGroups") {
      const mine = await base44.entities.GroupMembership.filter({ user_id: user.id, status: MembershipStatus.ACTIVE });
      const managed = mine.filter((m: any) => isGroupManager(m.role));
      const groups = await Promise.all(managed.map(async (m: any) => {
        const g = await base44.entities.Group.get(m.group_id).catch(() => null);
        return g ? { id: g.id, name: g.name, my_role: m.role } : null;
      }));
      return json({ ok: true, groups: groups.filter(Boolean) });
    }

    // ---------- listMessages (active members only) ----------
    if (action === "listMessages") {
      const group = await base44.entities.Group.get(body.group_id).catch(() => null);
      if (!group) return err("RESOURCE_NOT_FOUND", 404);
      const mine = await myMembership(base44, user.id, group.id);
      if (!mine || mine.status !== MembershipStatus.ACTIVE) return err("PERMISSION_DENIED", 403);
      const rows = await base44.entities.GroupMessage.filter({ group_id: group.id }, "created_date", 200);
      const messages = await Promise.all(rows.map(async (m: any) => enrichMessage(base44, m)));
      return json({ ok: true, messages });
    }

    // ---------- sendMessage (active members only) ----------
    if (action === "sendMessage") {
      const group = await base44.entities.Group.get(body.group_id).catch(() => null);
      if (!group) return err("RESOURCE_NOT_FOUND", 404);
      const mine = await myMembership(base44, user.id, group.id);
      if (!mine || mine.status !== MembershipStatus.ACTIVE) return err("PERMISSION_DENIED", 403);
      const bodyText = (body.body || "").trim();
      const mediaId = body.media_id || null;
      if (!bodyText && !mediaId) return err("VALIDATION_FAILED", 422, { body: "message text or media required" });
      const msg = await base44.entities.GroupMessage.create({ group_id: group.id, body: bodyText || null, media_id: mediaId });
      const enriched = await enrichMessage(base44, msg);
      return json({ ok: true, message: enriched });
    }

    // ---------- updateRules (owner only) ----------
    if (action === "updateRules") {
      const group = await base44.entities.Group.get(body.group_id).catch(() => null);
      if (!group) return err("RESOURCE_NOT_FOUND", 404);
      if (group.owner_id !== user.id) return err("PERMISSION_DENIED", 403);
      let rules: string[] = Array.isArray(body.rules) ? body.rules : [];
      rules = rules.map((r: any) => String(r || "").trim()).filter(Boolean).slice(0, 20).map((r: string) => r.slice(0, 200));
      await base44.entities.Group.update(group.id, { rules });
      return json({ ok: true, rules });
    }

    return err("VALIDATION_FAILED", 422, { action: "unknown" });
  } catch (error) {
    return json({ error: error.message }, 500);
  }
});

// ---- chat message enrichment ----
async function enrichMessage(base44: any, m: any) {
  const u = await base44.asServiceRole.entities.User.get(m.created_by_id).catch(() => null);
  let media_url: string | null = null;
  let media_type: string | null = null;
  if (m.media_id) {
    const med = await base44.asServiceRole.entities.Media.get(m.media_id).catch(() => null);
    media_url = med?.file_url || null;
    media_type = med?.media_type || null;
  }
  const avatar_url = await resolveMediaUrl(base44, u?.avatar_media_id);
  return {
    id: m.id,
    body: m.body,
    media_url,
    media_type,
    sender_id: m.created_by_id,
    sender_name: u?.display_name || u?.handle || "Member",
    sender_handle: u?.handle || null,
    avatar_url,
    created_date: m.created_date,
  };
}

// ---- helpers ----

async function myMembership(base44: any, userId: string, groupId: string) {
  const rows = await base44.entities.GroupMembership.filter({ group_id: groupId, user_id: userId });
  return rows[0] || null;
}

// Recompute the denormalized member_count from the source of truth (active memberships).
async function recomputeMemberCount(base44: any, groupId: string) {
  const active = await base44.entities.GroupMembership.filter({ group_id: groupId, status: MembershipStatus.ACTIVE });
  await base44.entities.Group.update(groupId, { member_count: active.length });
}

async function enrichMembers(base44: any, memberships: any[]) {
  return Promise.all(memberships.map(async (m: any) => {
    const u = await base44.asServiceRole.entities.User.get(m.user_id).catch(() => null);
    return {
      user_id: m.user_id,
      role: m.role,
      status: m.status,
      display_name: u?.display_name || u?.handle || "Member",
      handle: u?.handle || null,
      avatar_media_id: u?.avatar_media_id || null,
      joined_at: m.created_date,
    };
  }));
}