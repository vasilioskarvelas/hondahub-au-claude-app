/**
 * Honda Hub — AuditLogService shared module (Phase 05)
 *
 * The platform-wide generic audit log. This is the internal write path called
 * by every other service that needs to record an admin/system-level action.
 * ModerationAction is the moderation-specific append-only log; AuditLog is the
 * broader compliance trail (vehicle verification, business status, trust tier
 * overrides, financial changes, listing removals by moderation).
 *
 * `action` is always validated against the AuditActionType registry — never a
 * free-text string. Uses asServiceRole so any backend function can write an
 * audit entry regardless of the originating user's entity permissions.
 */

import { AuditActionType } from "./moderation.ts";
import { isReferenceType } from "./reference-resolver.ts";

const AUDIT_ACTION_VALUES = Object.values(AuditActionType);

export async function writeAuditLog(
  base44: any,
  opts: {
    action: string;
    actor_id?: string | null;
    target_type?: string | null;
    target_id?: string | null;
    details?: string | null;
  },
) {
  const { action, actor_id = null, target_type = null, target_id = null, details = null } = opts;

  if (!AUDIT_ACTION_VALUES.includes(action as any)) {
    throw new Error(`writeAuditLog: invalid action ${action}`);
  }
  if (target_type && !isReferenceType(target_type)) {
    throw new Error(`writeAuditLog: invalid target_type ${target_type}`);
  }

  return await base44.asServiceRole.entities.AuditLog.create({
    action,
    actor_id,
    target_type,
    target_id,
    details,
  });
}