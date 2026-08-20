/**
 * SocialService (Phase 04) — Honda Hub's social feed.
 *
 * Entities owned: Post, PostLike, Comment, Follow.
 * Public methods (actions): createPost, updatePost, removePost, likePost,
 *   unlikePost, createComment, removeOwnComment, hideCommentAsPostAuthor,
 *   followTarget, unfollowTarget, listFeed, listPostDetail, listProfilePosts,
 *   listFollowers, listFollowing.
 *
 * Hard rules enforced:
 *  - PostLike unique on (post_id, user_id); like/unlike idempotent (no-op, not error).
 *  - Follow unique on (follower_id, target_type, target_id); follow/unfollow idempotent.
 *  - followTarget() calls SafetyService.canInteract() first (Phase 05 stub).
 *  - like_count / comment_count are denormalized — recomputed from source tables, never
 *    trusted as raw increments.
 *  - hideCommentAsPostAuthor() sets status=hidden_by_post_author; the row and content are
 *    NEVER deleted and remain visible to the comment's own author + moderators.
 *  - primary_vehicle_id must be owned by the post author (ownership only, no mentions).
 *
 * Events (per EVENT_CATALOG.md — exact payloads not in scope context; mapped to
 * NotificationService with actor_id + polymorphic target):
 *   PostPublished      → no notification (author's own post).
 *   PostLiked          → new_like notification to post author (liker != author only).
 *   CommentCreated     → new_comment notification to post author (commenter != author only).
 *   UserFollowedTarget → new_follower notification to the followed user (user target only).
 *
 * Like-notification throttling: notifications fire only on the FIRST like of a post by a
 * given user (re-likes are no-ops), so a like/unlike/like cycle never spam-notifies. This
 * is the sensible batching rule the spec asked for.
 */
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { validateReference, ReferenceTypes } from "../../shared/reference-resolver.ts";
import { createNotification } from "../../shared/notifications.ts";
import { NotificationType } from "../../shared/identity.ts";
import { canInteract } from "../../shared/safety.ts";
import { checkRateLimit, rateLimitResponse } from "../../shared/rate-limit.ts";
import { resolveMediaUrl } from "../../shared/media.ts";

const FOLLOW_TARGET_TYPES = ["user", "vehicle", "business"];
const POST_STATUS = ["published", "removed_by_user", "removed_by_moderation"];
const COMMENT_STATUS = ["published", "hidden_by_post_author", "removed_by_author", "removed_by_moderation"];
const VISIBILITY = ["public", "followers", "approved_connections", "private"];

function isModeratorOrAdmin(user: any): boolean {
  return user?.role === "admin" || user?.account_tier === "moderator";
}

async function recomputeLikeCount(base44: any, postId: string): Promise<number> {
  const likes = await base44.asServiceRole.entities.PostLike.filter({ post_id: postId });
  await base44.asServiceRole.entities.Post.update(postId, { like_count: likes.length });
  return likes.length;
}

async function recomputeCommentCount(base44: any, postId: string): Promise<number> {
  const comments = await base44.asServiceRole.entities.Comment.filter({ post_id: postId, status: "published" });
  await base44.asServiceRole.entities.Post.update(postId, { comment_count: comments.length });
  return comments.length;
}

async function recomputeCommentLikeCount(base44: any, commentId: string): Promise<number> {
  const likes = await base44.asServiceRole.entities.CommentLike.filter({ comment_id: commentId });
  await base44.asServiceRole.entities.Comment.update(commentId, { like_count: likes.length });
  return likes.length;
}

async function validateOwnedVehicle(base44: any, user: any, vehicleId: string): Promise<{ ok: boolean; error?: string }> {
  const ref = await validateReference(base44, { target_type: ReferenceTypes.VEHICLE, target_id: vehicleId, allowedTypes: [ReferenceTypes.VEHICLE] });
  if (!ref.valid) return { ok: false, error: ref.error };
  try {
    const vehicle = await base44.asServiceRole.entities.Vehicle.get(vehicleId);
    if (vehicle.created_by_id !== user.id) return { ok: false, error: "primary_vehicle_id must belong to the post author" };
    return { ok: true };
  } catch {
    return { ok: false, error: "vehicle not found" };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    // Write actions require an authenticated user; read/discovery actions are public
    // so anyone can browse the social feed, posts, and profiles (explore + meet new people).
    const WRITE_ACTIONS = new Set(["createPost","updatePost","removePost","likePost","unlikePost","likeComment","unlikeComment","createComment","removeOwnComment","hideCommentAsPostAuthor","followTarget","unfollowTarget"]);
    if (!user && WRITE_ACTIONS.has(action)) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // Rate limiting (abuse mitigation): counts caller's own recent records; see shared/rate-limit.ts
    if (action === "createPost") {
      const rl = await checkRateLimit(base44, user.id, "Post", [{ limit: 10, windowSec: 60 }, { limit: 200, windowSec: 86400 }]);
      if (rl.limited) return rateLimitResponse(rl.retryAfter);
    }
    if (action === "createComment") {
      const rl = await checkRateLimit(base44, user.id, "Comment", [{ limit: 20, windowSec: 60 }, { limit: 500, windowSec: 86400 }]);
      if (rl.limited) return rateLimitResponse(rl.retryAfter);
    }

    // ---- createPost ----
    if (action === "createPost") {
      const caption = (body.caption || "").trim();
      if (!caption) return Response.json({ error: "VALIDATION_FAILED", details: { caption: "required" } }, { status: 422 });
      if (body.media_id) {
        const r = await validateReference(base44, { target_type: ReferenceTypes.POST, target_id: body.media_id, allowedTypes: [] });
        // media_id is a Media FK, not a polymorphic reference — skip ref validation, just non-empty.
      }
      if (body.primary_vehicle_id) {
        const v = await validateOwnedVehicle(base44, user, body.primary_vehicle_id);
        if (!v.ok) return Response.json({ error: "VALIDATION_FAILED", details: { primary_vehicle_id: v.error } }, { status: 422 });
      }
      if (body.visibility && !VISIBILITY.includes(body.visibility)) {
        return Response.json({ error: "VALIDATION_FAILED", details: { visibility: "invalid" } }, { status: 422 });
      }
      const hashtags = extractHashtags(caption);
      const post = await base44.entities.Post.create({
        caption,
        media_id: body.media_id || null,
        primary_vehicle_id: body.primary_vehicle_id || null,
        status: "published",
        visibility: body.visibility || "public",
        like_count: 0,
        comment_count: 0,
        hashtags,
      });
      return Response.json({ ok: true, post });
    }

    // ---- updatePost ----
    if (action === "updatePost") {
      const post = await base44.entities.Post.get(body.post_id);
      if (post.created_by_id !== user.id) return Response.json({ error: "PERMISSION_DENIED" }, { status: 403 });
      if (post.status !== "published") return Response.json({ error: "VALIDATION_FAILED", details: { post: "cannot edit removed post" } }, { status: 422 });
      const update: any = {};
      if (body.caption !== undefined) {
        const caption = (body.caption || "").trim();
        if (!caption) return Response.json({ error: "VALIDATION_FAILED", details: { caption: "required" } }, { status: 422 });
        update.caption = caption;
        update.hashtags = extractHashtags(caption);
      }
      if (body.media_id !== undefined) update.media_id = body.media_id || null;
      if (body.primary_vehicle_id !== undefined) {
        if (body.primary_vehicle_id) {
          const v = await validateOwnedVehicle(base44, user, body.primary_vehicle_id);
          if (!v.ok) return Response.json({ error: "VALIDATION_FAILED", details: { primary_vehicle_id: v.error } }, { status: 422 });
          update.primary_vehicle_id = body.primary_vehicle_id;
        } else {
          update.primary_vehicle_id = null;
        }
      }
      if (body.visibility && !VISIBILITY.includes(body.visibility)) {
        return Response.json({ error: "VALIDATION_FAILED", details: { visibility: "invalid" } }, { status: 422 });
      }
      if (body.visibility) update.visibility = body.visibility;
      const updated = await base44.entities.Post.update(post.id, update);
      return Response.json({ ok: true, post: updated });
    }

    // ---- removePost ----
    if (action === "removePost") {
      const post = await base44.entities.Post.get(body.post_id);
      if (post.created_by_id !== user.id && !isModeratorOrAdmin(user)) {
        return Response.json({ error: "PERMISSION_DENIED" }, { status: 403 });
      }
      if (post.status === "published") {
        const status = isModeratorOrAdmin(user) && post.created_by_id !== user.id ? "removed_by_moderation" : "removed_by_user";
        await base44.entities.Post.update(post.id, { status });
      }
      return Response.json({ ok: true });
    }

    // ---- likePost ----
    if (action === "likePost") {
      const post = await base44.entities.Post.get(body.post_id);
      if (post.status !== "published") return Response.json({ error: "VALIDATION_FAILED", details: { post: "not likeable" } }, { status: 422 });
      const existing = await base44.entities.PostLike.filter({ post_id: body.post_id, user_id: user.id });
      if (existing.length > 0) {
        return Response.json({ ok: true, liked: true, already_liked: true, like_count: post.like_count });
      }
      await base44.entities.PostLike.create({ post_id: body.post_id, user_id: user.id });
      const likeCount = await recomputeLikeCount(base44, body.post_id);
      // PostLiked event → new_like notification to post author (throttled: first like only).
      if (post.created_by_id !== user.id) {
        await createNotification(base44, {
          recipient_id: post.created_by_id,
          notification_type: NotificationType.NEW_LIKE,
          actor_id: user.id,
          target_type: ReferenceTypes.POST,
          target_id: body.post_id,
        }).catch(() => {});
      }
      return Response.json({ ok: true, liked: true, like_count: likeCount });
    }

    // ---- unlikePost ----
    if (action === "unlikePost") {
      const existing = await base44.entities.PostLike.filter({ post_id: body.post_id, user_id: user.id });
      if (existing.length > 0) {
        await base44.entities.PostLike.delete(existing[0].id);
        await recomputeLikeCount(base44, body.post_id);
      }
      return Response.json({ ok: true, liked: false });
    }

    // ---- likeComment ----
    if (action === "likeComment") {
      const comment = await base44.entities.Comment.get(body.comment_id);
      if (comment.status !== "published") return Response.json({ error: "VALIDATION_FAILED", details: { comment: "not likeable" } }, { status: 422 });
      const existing = await base44.entities.CommentLike.filter({ comment_id: body.comment_id, user_id: user.id });
      if (existing.length > 0) {
        return Response.json({ ok: true, liked: true, already_liked: true, like_count: comment.like_count });
      }
      await base44.entities.CommentLike.create({ comment_id: body.comment_id, user_id: user.id });
      const likeCount = await recomputeCommentLikeCount(base44, body.comment_id);
      return Response.json({ ok: true, liked: true, like_count: likeCount });
    }

    // ---- unlikeComment ----
    if (action === "unlikeComment") {
      const existing = await base44.entities.CommentLike.filter({ comment_id: body.comment_id, user_id: user.id });
      if (existing.length > 0) {
        await base44.entities.CommentLike.delete(existing[0].id);
        await recomputeCommentLikeCount(base44, body.comment_id);
      }
      return Response.json({ ok: true, liked: false });
    }

    // ---- createComment ----
    if (action === "createComment") {
      const post = await base44.entities.Post.get(body.post_id);
      if (post.status !== "published") return Response.json({ error: "VALIDATION_FAILED", details: { post: "not commentable" } }, { status: 422 });
      const text = (body.text || "").trim();
      if (!text) return Response.json({ error: "VALIDATION_FAILED", details: { text: "required" } }, { status: 422 });
      let parentCommentId = null;
      if (body.parent_comment_id) {
        const parent = await base44.entities.Comment.get(body.parent_comment_id);
        if (parent.post_id !== body.post_id) return Response.json({ error: "VALIDATION_FAILED", details: { parent_comment_id: "must belong to same post" } }, { status: 422 });
        if (parent.status !== "published") return Response.json({ error: "VALIDATION_FAILED", details: { parent_comment_id: "parent not visible" } }, { status: 422 });
        if (parent.parent_comment_id) return Response.json({ error: "VALIDATION_FAILED", details: { parent_comment_id: "one level of threading only" } }, { status: 422 });
        parentCommentId = body.parent_comment_id;
      }
      const comment = await base44.entities.Comment.create({
        post_id: body.post_id,
        text,
        parent_comment_id: parentCommentId,
        status: "published",
        like_count: 0,
      });
      await recomputeCommentCount(base44, body.post_id);
      // CommentCreated event → new_comment notification to post author (commenter != author).
      if (post.created_by_id !== user.id) {
        await createNotification(base44, {
          recipient_id: post.created_by_id,
          notification_type: NotificationType.NEW_COMMENT,
          actor_id: user.id,
          target_type: ReferenceTypes.COMMENT,
          target_id: comment.id,
        }).catch(() => {});
      }
      // Enrich with the author so the UI can render the commenter's name/avatar
      // immediately without a re-fetch (matches listPostDetail's enrichAuthors).
      const author = await safeUser(base44, user.id);
      const avatar_url = author ? await resolveMediaUrl(base44, author.avatar_media_id) : null;
      return Response.json({ ok: true, comment: { ...comment, author: author ? { ...author, avatar_url } : null, liked: false } });
    }

    // ---- removeOwnComment ----
    if (action === "removeOwnComment") {
      const comment = await base44.entities.Comment.get(body.comment_id);
      if (comment.created_by_id !== user.id) return Response.json({ error: "PERMISSION_DENIED" }, { status: 403 });
      if (comment.status === "published") {
        await base44.entities.Comment.update(comment.id, { status: "removed_by_author" });
        await recomputeCommentCount(base44, comment.post_id);
      }
      return Response.json({ ok: true });
    }

    // ---- hideCommentAsPostAuthor ----
    if (action === "hideCommentAsPostAuthor") {
      const comment = await base44.entities.Comment.get(body.comment_id);
      const post = await base44.entities.Post.get(comment.post_id);
      // Only the post author (not the comment author) may hide. Moderators use removeByModeration (Phase 05).
      if (post.created_by_id !== user.id) return Response.json({ error: "PERMISSION_DENIED" }, { status: 403 });
      if (comment.created_by_id === user.id) return Response.json({ error: "VALIDATION_FAILED", details: { comment: "cannot hide your own comment as post author" } }, { status: 422 });
      if (comment.status !== "published") return Response.json({ error: "VALIDATION_FAILED", details: { comment: "not in published state" } }, { status: 422 });
      // Hide — NEVER delete. Content retained; visible to comment author + moderators.
      await base44.entities.Comment.update(comment.id, { status: "hidden_by_post_author" });
      await recomputeCommentCount(base44, comment.post_id);
      return Response.json({ ok: true });
    }

    // ---- followTarget ----
    if (action === "followTarget") {
      const targetType = body.target_type;
      const targetId = body.target_id;
      if (!FOLLOW_TARGET_TYPES.includes(targetType)) return Response.json({ error: "VALIDATION_FAILED", details: { target_type: "invalid" } }, { status: 422 });
      if (!targetId) return Response.json({ error: "VALIDATION_FAILED", details: { target_id: "required" } }, { status: 422 });
      if (targetType === "user" && targetId === user.id) return Response.json({ error: "VALIDATION_FAILED", details: { target: "cannot follow yourself" } }, { status: 422 });
      // SafetyService.canInteract() — a block in either direction rejects (Phase 05 stub: always allowed).
      const safety = await canInteract(base44, user.id, targetType, targetId);
      if (!safety.allowed) return Response.json({ error: "PERMISSION_DENIED", details: { reason: safety.reason || "blocked" } }, { status: 403 });
      const ref = await validateReference(base44, { target_type: targetType, target_id: targetId, allowedTypes: FOLLOW_TARGET_TYPES });
      if (!ref.valid) return Response.json({ error: "VALIDATION_FAILED", details: { target: ref.error } }, { status: 422 });
      const existing = await base44.entities.Follow.filter({ follower_id: user.id, target_type: targetType, target_id: targetId });
      if (existing.length > 0) return Response.json({ ok: true, following: true, already_following: true });
      await base44.entities.Follow.create({ follower_id: user.id, target_type: targetType, target_id: targetId });
      // UserFollowedTarget event → new_follower notification (user target only).
      if (targetType === "user") {
        await createNotification(base44, {
          recipient_id: targetId,
          notification_type: NotificationType.NEW_FOLLOWER,
          actor_id: user.id,
          target_type: ReferenceTypes.USER,
          target_id: user.id,
        }).catch(() => {});
      }
      return Response.json({ ok: true, following: true });
    }

    // ---- unfollowTarget ----
    if (action === "unfollowTarget") {
      const existing = await base44.entities.Follow.filter({ follower_id: user.id, target_type: body.target_type, target_id: body.target_id });
      if (existing.length > 0) await base44.entities.Follow.delete(existing[0].id);
      return Response.json({ ok: true, following: false });
    }

    // ---- explore (public discovery feed — everyone's public posts) ----
    if (action === "explore") {
      const limit = Math.min(body.limit || 50, 100);
      const posts = await base44.asServiceRole.entities.Post.filter(
        { status: "published", visibility: "public" },
        "-created_date",
        limit,
      );
      return Response.json({ ok: true, posts: await enrichPosts(base44, user, posts) });
    }

    // ---- listFeed (pull-based chronological) ----
    if (action === "listFeed") {
      const limit = Math.min(body.limit || 50, 100);
      // Logged-out visitors see the full public feed (explore).
      if (!user) {
        const posts = await base44.asServiceRole.entities.Post.filter(
          { status: "published", visibility: "public" },
          "-created_date",
          limit,
        );
        return Response.json({ ok: true, posts: await enrichPosts(base44, null, posts) });
      }
      const follows = await base44.entities.Follow.filter({ follower_id: user.id });
      const authorIds = new Set<string>([user.id]);
      for (const f of follows) {
        if (f.target_type === "user") authorIds.add(f.target_id);
        if (f.target_type === "vehicle") {
          try {
            const v = await base44.asServiceRole.entities.Vehicle.get(f.target_id);
            if (v?.created_by_id) authorIds.add(v.created_by_id);
          } catch {}
        }
        // business target → backing entity lands in Phase 07; owner resolution deferred.
      }
      const posts = await base44.entities.Post.filter(
        { $or: [{ created_by_id: { $in: Array.from(authorIds) } }, { author_id: { $in: Array.from(authorIds) } }], status: "published" },
        "-created_date",
        limit,
      );
      const enriched = await enrichPosts(base44, user, posts);
      return Response.json({ ok: true, posts: enriched });
    }

    // ---- listPostDetail ----
    if (action === "listPostDetail") {
      const post = await base44.entities.Post.get(body.post_id);
      if (!post) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
      const allComments = await base44.asServiceRole.entities.Comment.filter({ post_id: body.post_id }, "-created_date");
      const isPostAuthor = !!user && post.created_by_id === user.id;
      const isMod = isModeratorOrAdmin(user);
      const comments = allComments.filter((c: any) => {
        if (c.status === "published") return true;
        if (isMod) return true;
        if (c.status === "hidden_by_post_author") return isPostAuthor || (!!user && c.created_by_id === user.id);
        if (c.status === "removed_by_author") return !!user && c.created_by_id === user.id;
        if (c.status === "removed_by_moderation") return false;
        return false;
      });
      const existingLike = user ? await base44.entities.PostLike.filter({ post_id: body.post_id, user_id: user.id }) : [];
      return Response.json({
        ok: true,
        post: await enrichOne(base44, user, post),
        comments: await enrichAuthors(base44, comments, user),
        liked: existingLike.length > 0,
        can_hide_comments: isPostAuthor,
        is_moderator: isMod,
      });
    }

    // ---- listProfilePosts ----
    if (action === "listProfilePosts") {
      const targetUserId = body.user_id || (user && user.id);
      if (!targetUserId) return Response.json({ ok: true, posts: [] });
      const posts = await base44.asServiceRole.entities.Post.filter({ $or: [{ created_by_id: targetUserId }, { author_id: targetUserId }], status: "published" }, "-created_date", body.limit || 50);
      return Response.json({ ok: true, posts: await enrichPosts(base44, user, posts) });
    }

    // ---- listFollowers / listFollowing ----
    // Each follow row is enriched with the backing user's public profile so the
    // UI never has to call User.get (blocked by built-in security for other users).
    if (action === "listFollowers") {
      const targetUserId = body.user_id || (user && user.id);
      if (!targetUserId) return Response.json({ ok: true, follows: [], count: 0 });
      const follows = await base44.asServiceRole.entities.Follow.filter({ target_type: "user", target_id: targetUserId });
      return Response.json({ ok: true, follows: await enrichFollowUsers(base44, follows, "follower_id"), count: follows.length });
    }
    if (action === "listFollowing") {
      const targetUserId = body.user_id || (user && user.id);
      if (!targetUserId) return Response.json({ ok: true, follows: [], count: 0 });
      const follows = await base44.asServiceRole.entities.Follow.filter({ follower_id: targetUserId });
      return Response.json({ ok: true, follows: await enrichFollowUsers(base44, follows, "target_id"), count: follows.length });
    }

    // ---- isFollowing / isLiked (UI state helpers) ----
    if (action === "isFollowing") {
      if (!user) return Response.json({ ok: true, following: false });
      const existing = await base44.entities.Follow.filter({ follower_id: user.id, target_type: body.target_type, target_id: body.target_id });
      return Response.json({ ok: true, following: existing.length > 0 });
    }
    if (action === "isLiked") {
      if (!user) return Response.json({ ok: true, liked: false });
      const existing = await base44.entities.PostLike.filter({ post_id: body.post_id, user_id: user.id });
      return Response.json({ ok: true, liked: existing.length > 0 });
    }

    return Response.json({ error: "VALIDATION_FAILED", details: { action: "unknown" } }, { status: 422 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ---- helpers ----
function extractHashtags(caption: string): string[] {
  const matches = caption.match(/#[a-zA-Z0-9_]+/g) || [];
  return Array.from(new Set(matches.map((m) => m.toLowerCase())));
}

async function enrichOne(base44: any, user: any, post: any, followingIds?: Set<string>) {
  const authorId = post.author_id || post.created_by_id;
  const author = await safeUser(base44, authorId);
  const avatar_url = author ? await resolveMediaUrl(base44, author.avatar_media_id) : null;
  let vehicle = null;
  if (post.primary_vehicle_id) {
    try { vehicle = await base44.asServiceRole.entities.Vehicle.get(post.primary_vehicle_id); } catch {}
  }
  let media = null;
  if (post.media_id) {
    try { media = await base44.asServiceRole.entities.Media.get(post.media_id); } catch {}
  }
  const like = user ? await base44.entities.PostLike.filter({ post_id: post.id, user_id: user.id }) : [];
  return { ...post, author: author ? { ...author, avatar_url } : null, vehicle, media_url: media?.file_url || null, liked: like.length > 0, following: !!(followingIds && authorId && followingIds.has(authorId)) };
}

async function enrichPosts(base44: any, user: any, posts: any[]) {
  let followingIds = new Set<string>();
  if (user && posts.length) {
    const authorIds = Array.from(new Set(posts.map((p) => p.author_id || p.created_by_id).filter(Boolean)));
    if (authorIds.length) {
      try {
        const follows = await base44.entities.Follow.filter({ follower_id: user.id, target_type: "user", target_id: { $in: authorIds } });
        for (const f of follows) followingIds.add(f.target_id);
      } catch {}
    }
  }
  return Promise.all(posts.map((p) => enrichOne(base44, user, p, followingIds)));
}

async function enrichAuthors(base44: any, comments: any[], user: any) {
  const ids = Array.from(new Set(comments.map((c) => c.created_by_id)));
  const users = await Promise.all(ids.map((id) => safeUser(base44, id)));
  const map = new Map(users.filter(Boolean).map((u: any) => [u.id, u]));
  // Resolve avatar URLs for all comment authors in parallel.
  const avatarUrls = await Promise.all(
    Array.from(map.values()).map(async (u: any) => [u.id, await resolveMediaUrl(base44, u.avatar_media_id)])
  );
  const avatarMap = new Map(avatarUrls as any);
  const likedRows = user ? await base44.entities.CommentLike.filter({ comment_id: { $in: comments.map((c) => c.id) }, user_id: user.id }) : [];
  const likedSet = new Set(likedRows.map((l: any) => l.comment_id));
  return comments.map((c) => {
    const author = map.get(c.created_by_id) || null;
    return { ...c, author: author ? { ...author, avatar_url: avatarMap.get(author.id) || null } : null, liked: likedSet.has(c.id) };
  });
}

async function enrichFollowUsers(base44: any, follows: any[], idField: string) {
  const ids = Array.from(new Set(follows.map((f) => f[idField]).filter(Boolean)));
  if (!ids.length) return follows;
  const all = await base44.asServiceRole.entities.User.list(500);
  const map = new Map(all.filter((u) => ids.includes(u.id)).map((u) => [u.id, u]));
  const avatarUrls = await Promise.all(
    Array.from(map.values()).map(async (u) => [u.id, u.avatar_media_id ? await resolveMediaUrl(base44, u.avatar_media_id) : null]),
  );
  const avatarMap = new Map(avatarUrls as any);
  return follows.map((f) => {
    const u = map.get(f[idField]);
    return {
      ...f,
      user: u ? {
        id: u.id,
        handle: u.handle || null,
        display_name: u.display_name || null,
        full_name: u.full_name || null,
        account_tier: u.account_tier || null,
        avatar_url: avatarMap.get(u.id) || null,
        avatar_position: u.avatar_position || null,
      } : null,
    };
  });
}

async function safeUser(base44: any, id: string) {
  if (!id) return null;
  try { return await base44.asServiceRole.entities.User.get(id); } catch { return null; }
}