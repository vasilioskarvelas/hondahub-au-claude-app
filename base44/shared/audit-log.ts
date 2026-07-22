/**
 * Honda Hub — AuditLogService shared module (Phase 05)
 *
 * The sole write path into AuditLog. Called internally by every other service
 * for every action documented as "audit-logged" — never by a user-facing action
 * directly, and never by AI. Read access is Admin-only (Moderators read
 * moderation-relevant entries via ModerationAction, not via a direct AuditLog read).
 *
 * `action` is always validated against the AuditActionType registry — never a
 * free-text string. `actor_type` is required; `actor_id` is null when
 * actor_type = system. Uses asServiceRole so any backend function can write an
 * audit entry regardless of the originating user's entity permissions.
 *
 * AuditLog is append-only: no update or delete path exists anywhere, including
 * admin tooling (§2.9).
 */

import { AuditActionType, ACTOR_TYPE } from "./moderation.ts";
import { isReferenceType } from "./reference-resolver.ts";

const AUDIT_ACTION_VALUES = Object.values(AuditActionType);
const ACTOR_TYPE_VALUES = Object.values(ACTOR_TYPE);

export async function writeAuditLog(
  base44: any,
  opts: {
    action: string;
    actor_type?: string;
    actor_id?: string | null;
    target_type?: string | null;
    target_id?: string | null;
    context?: string | null;
  },
) {
  const {
    action,
    actor_id = null,
    target_type = null,
    target_id = null,
    context = null,
  } = opts;

  // Infer actor_type when not provided: null actor → system; present actor → user.
  // Callers that know the role (moderation/vehicle) pass actor_type explicitly.
  let actor_type = opts.actor_type;
  if (!actor_type) {
    actor_type = actor_id ? ACTOR_TYPE.USER : ACTOR_TYPE.SYSTEM;
  }

  if (!AUDIT_ACTION_VALUES.includes(action as any)) {
    throw new Error(`writeAuditLog: invalid action ${action}`);
  }
  if (!ACTOR_TYPE_VALUES.includes(actor_type as any)) {
    throw new Error(`writeAuditLog: invalid actor_type ${actor_type}`);
  }
  if (target_type && !isReferenceType(target_type)) {
    throw new Error(`writeAuditLog: invalid target_type ${target_type}`);
  }

  return await base44.asServiceRole.entities.AuditLog.create({
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    context,
  });
}