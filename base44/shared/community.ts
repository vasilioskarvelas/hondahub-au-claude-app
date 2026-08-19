/**
 * Honda Hub — Community shared module (Phase 06)
 *
 * Group/Event registries and helpers shared across the group + event backend
 * functions. Group-scoped roles are DISTINCT from platform AccountTier.
 * Tier gates follow ADR-039 (Trusted Member+ to create; Moderator/Admin exempt
 * for operational purposes).
 */

export const GroupVisibility = Object.freeze({
  PUBLIC: "public",
  PRIVATE: "private",
});

export const GroupStatus = Object.freeze({
  ACTIVE: "active",
  ARCHIVED: "archived",
  REMOVED_BY_MODERATION: "removed_by_moderation",
});

export const GroupRole = Object.freeze({
  MEMBER: "member",
  MODERATOR: "moderator",
  OWNER: "owner",
});

export const MembershipStatus = Object.freeze({
  ACTIVE: "active",
  PENDING_APPROVAL: "pending_approval",
  REMOVED: "removed",
});

export const EventStatus = Object.freeze({
  PUBLISHED: "published",
  CANCELLED: "cancelled",
  REMOVED_BY_MODERATION: "removed_by_moderation",
});

export const AttendanceStatus = Object.freeze({
  GOING: "going",
  INTERESTED: "interested",
  CANCELLED: "cancelled",
});

export const OrganiserType = Object.freeze({
  USER: "user",
  BUSINESS: "business",
});
export const ORGANISER_TYPES = Object.values(OrganiserType);

const TIER_RANK: Record<string, number> = {
  guest: 0,
  new_member: 1,
  trusted_member: 2,
  verified_member: 3,
  business_verified: 4,
  moderator: 5,
  admin: 6,
};

export function isModeratorOrAdmin(user: any): boolean {
  return user?.role === "admin" || user?.account_tier === "moderator";
}

export function isAdmin(user: any): boolean {
  return user?.role === "admin";
}

/**
 * ADR-039 — Trusted Member+ to create Group/Event; Moderators/Admins may create
 * for operational purposes even below Trusted tier.
 */
export function meetsCreationTier(user: any): boolean {
  if (!user) return false;
  if (isModeratorOrAdmin(user)) return true; // operational exemption
  const t = user.account_tier || "new_member";
  return (TIER_RANK[t] ?? 0) >= TIER_RANK["new_member"];
}

/** New Member+ to participate (join groups, attend events). */
export function meetsParticipationTier(user: any): boolean {
  if (!user) return false;
  const t = user.account_tier || "new_member";
  return (TIER_RANK[t] ?? 0) >= TIER_RANK["new_member"];
}

/** Account is not suspended or banned (Authorization Evaluation step 2). */
export function accountInGoodStanding(user: any): boolean {
  const s = user?.account_status;
  return s !== "suspended" && s !== "banned";
}

/** GrpMod/GrpOwn — a manager who can approve/remove ordinary members. */
export function isGroupManager(role: string | undefined): boolean {
  return role === GroupRole.MODERATOR || role === GroupRole.OWNER;
}

/** GrpOwn — only role that can change another member's role. */
export function isGroupOwner(role: string | undefined): boolean {
  return role === GroupRole.OWNER;
}

export function actorTypeFor(user: any): string {
  if (isAdmin(user)) return "admin";
  if (isModeratorOrAdmin(user)) return "moderator";
  return "user";
}