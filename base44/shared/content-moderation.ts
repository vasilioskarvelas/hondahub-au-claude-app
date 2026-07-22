/**
 * Honda Hub — Content-moderation delegate shared module (Phase 05)
 *
 * The SINGLE-WRITER enforcement for moderation-driven content status changes.
 * ModerationService.applyAction() NEVER writes directly to the target content's
 * entity (Post, Comment, Vehicle, User) — it calls this delegate, which is the
 * owning service's moderation-write path. This satisfies the architectural rule
 * that the owning service changes its own content's status, not ModerationService.
 *
 * SocialService.removePost() (user-facing, Phase 04) is the other writer to
 * Post.status; this delegate is the moderation-initiated equivalent. Both paths
 * are the owning service's delegated write — ModerationService itself never
 * touches the target entity table directly.
 */

import { ModerationActionType } from "./moderation.ts";

export interface ContentActionResult {
  ok: boolean;
  changed: boolean;
  error?: string;
}

/**
 * Apply a moderation action to the target content. Routes by target_type +
 * action_type to the correct status transition on the owning entity.
 */
export async function applyContentAction(
  base44: any,
  target_type: string,
  target_id: string,
  action_type: string,
): Promise<ContentActionResult> {
  // ---- Post ----
  if (target_type === "post") {
    try {
      const post = await base44.asServiceRole.entities.Post.get(target_id);
      if (action_type === ModerationActionType.CONTENT_REMOVED) {
        if (post.status === "removed_by_moderation") return { ok: true, changed: false };
        await base44.asServiceRole.entities.Post.update(target_id, { status: "removed_by_moderation" });
        return { ok: true, changed: true };
      }
      if (action_type === ModerationActionType.CONTENT_RESTORED) {
        if (post.status === "published") return { ok: true, changed: false };
        await base44.asServiceRole.entities.Post.update(target_id, { status: "published" });
        return { ok: true, changed: true };
      }
      return { ok: true, changed: false };
    } catch {
      return { ok: false, error: "post not found" };
    }
  }

  // ---- Comment ----
  if (target_type === "comment") {
    try {
      const comment = await base44.asServiceRole.entities.Comment.get(target_id);
      if (action_type === ModerationActionType.CONTENT_REMOVED) {
        if (comment.status === "removed_by_moderation") return { ok: true, changed: false };
        await base44.asServiceRole.entities.Comment.update(target_id, { status: "removed_by_moderation" });
        // Recompute the post's comment_count (source of truth = published comments).
        try {
          const published = await base44.asServiceRole.entities.Comment.filter({ post_id: comment.post_id, status: "published" });
          await base44.asServiceRole.entities.Post.update(comment.post_id, { comment_count: published.length });
        } catch {}
        return { ok: true, changed: true };
      }
      if (action_type === ModerationActionType.CONTENT_RESTORED) {
        if (comment.status === "published") return { ok: true, changed: false };
        await base44.asServiceRole.entities.Comment.update(target_id, { status: "published" });
        try {
          const published = await base44.asServiceRole.entities.Comment.filter({ post_id: comment.post_id, status: "published" });
          await base44.asServiceRole.entities.Post.update(comment.post_id, { comment_count: published.length });
        } catch {}
        return { ok: true, changed: true };
      }
      return { ok: true, changed: false };
    } catch {
      return { ok: false, error: "comment not found" };
    }
  }

  // ---- User (account restriction/suspension/ban) ----
  if (target_type === "user") {
    // account_suspended → User.account_status = suspended
    // account_banned → User.account_status = banned
    // account_restricted → no account_status value exists; record only (softer measure).
    const statusMap: Record<string, string> = {
      [ModerationActionType.ACCOUNT_SUSPENDED]: "suspended",
      [ModerationActionType.ACCOUNT_BANNED]: "banned",
    };
    const newStatus = statusMap[action_type];
    if (newStatus) {
      try {
        await base44.asServiceRole.entities.User.update(target_id, { account_status: newStatus });
        return { ok: true, changed: true };
      } catch {
        return { ok: false, error: "user not found" };
      }
    }
    // warning / account_restricted / no_action → no account_status change.
    return { ok: true, changed: false };
  }

  // ---- Vehicle (content_removed on a vehicle → verification reset; rare) ----
  if (target_type === "vehicle") {
    // Vehicles don't have a "removed" status. content_restored/content_removed
    // are not meaningful for Vehicle at MVP — no-op, action is recorded in
    // ModerationAction regardless.
    return { ok: true, changed: false };
  }

  // ---- listing / group / event / business / marketplace_message ----
  // Backing entities land in later phases (06/07/08). The action is still
  // recorded in ModerationAction; the content status change activates when
  // each backing entity lands.
  return { ok: true, changed: false };
}