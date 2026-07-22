import React from "react";
import { base44 } from "@/api/base44Client";
import { Heart, MessageCircle, Share2, Bookmark, BadgeCheck } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "@/components/ui/use-toast";
import PostMenu from "./PostMenu";
import EditPostModal from "./EditPostModal";
import TagSomeoneModal from "./TagSomeoneModal";
import LazyImage from "./LazyImage";
import SmartVideo from "./SmartVideo";
import PhotoCarousel from "./PhotoCarousel";
import CommentThread from "./CommentThread";
import { Link } from "react-router-dom";
import { getCurrentUser, isSaved, toggleSaved, isFollowing, toggleFollow } from "@/lib/userIdentity";

function renderCaption(text) {
  if (!text) return null;
  return text.split(/(#\w+|@\w+)/g).map((p, i) =>
    p.startsWith("#") || p.startsWith("@")
      ? <span key={i} className="text-primary font-medium">{p}</span>
      : <span key={i}>{p}</span>
  );
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function handleToUsername(name) {
  return (name || "anonymous").replace(/\s/g, "_").toLowerCase();
}

export default function SocialPostCard({ post, onDelete }) {
  const [liked, setLiked] = React.useState(false);
  const [likeCount, setLikeCount] = React.useState(post.likes || 0);
  const [saved, setSaved] = React.useState(isSaved(post.id));
  const [showComments, setShowComments] = React.useState(false);
  const [shareCount, setShareCount] = React.useState(post.shares || 0);
  const [following, setFollowing] = React.useState(isFollowing(post.author_name));
  const isOwn = post.author_name === getCurrentUser();
  const [caption, setCaption] = React.useState(post.caption || "");
  const [tags, setTags] = React.useState(post.tags || "");
  const [showEdit, setShowEdit] = React.useState(false);
  const [showTag, setShowTag] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [previewComments, setPreviewComments] = React.useState([]);
  const [commentCount, setCommentCount] = React.useState(null);
  const [quickComment, setQuickComment] = React.useState("");

  const loadPreview = () => {
    base44.entities.Comment.filter({ post_id: post.id }, "created_date", 3).then((c) => {
      setPreviewComments(c);
      setCommentCount(c.length);
    });
  };
  React.useEffect(loadPreview, [post.id, showComments]);

  const onLike = async () => {
    const wasLiked = liked;
    const nowLiked = !wasLiked;
    const baseLikes = post.likes || 0;
    const newCount = nowLiked ? baseLikes + 1 : baseLikes;
    setLiked(nowLiked);
    setLikeCount(newCount);
    try {
      await base44.entities.CommunityPost.update(post.id, { likes: newCount });
      if (nowLiked && !isOwn) {
        base44.entities.Notification.create({ type: "like", from_name: getCurrentUser() || "Anonymous", to_name: post.author_name, post_id: post.id, text: "liked your post", read: false });
      }
    } catch {
      setLiked(wasLiked);
      setLikeCount(baseLikes);
    }
  };

  const onDoubleTapLike = () => { if (!liked) onLike(); };

  const onSave = () => setSaved(toggleSaved(post.id));

  const onShare = async () => {
    const newCount = shareCount + 1;
    setShareCount(newCount);
    base44.entities.CommunityPost.update(post.id, { shares: newCount });
    const shareUrl = `${window.location.origin}/community`;
    if (navigator.share) {
      navigator.share({ title: "HondaHub", text: post.caption || "Check out this post!", url: shareUrl }).catch(() => {});
    } else {
      try { await navigator.clipboard.writeText(shareUrl); toast({ title: "Link copied!" }); } catch { toast({ title: "Share", description: shareUrl }); }
    }
  };

  const handleDelete = async () => {
    await base44.entities.CommunityPost.delete(post.id);
    if (onDelete) onDelete(post.id);
  };

  const onFollow = async () => {
    const nowFollowing = toggleFollow(post.author_name);
    setFollowing(nowFollowing);
    const me = getCurrentUser() || "Anonymous";
    if (nowFollowing) {
      await base44.entities.Follow.create({ follower_name: me, following_name: post.author_name });
      base44.entities.Notification.create({ type: "follow", from_name: me, to_name: post.author_name, text: "started following you", read: false });
    } else {
      const records = await base44.entities.Follow.filter({ follower_name: me, following_name: post.author_name });
      if (records[0]) await base44.entities.Follow.delete(records[0].id);
    }
  };

  const submitQuickComment = async () => {
    if (!quickComment.trim()) return;
    const name = getCurrentUser() || "Anonymous";
    const c = await base44.entities.Comment.create({ post_id: post.id, author_name: name, text: quickComment, likes: 0 });
    if (post.author_name && post.author_name !== name) {
      base44.entities.Notification.create({ type: "comment", from_name: name, to_name: post.author_name, post_id: post.id, text: "commented on your post", read: false });
    }
    setPreviewComments((pc) => [...pc, c]);
    setCommentCount((cc) => (cc || 0) + 1);
    setQuickComment("");
  };

  const photos = post.photos || [];
  const isTextOnly = !post.video_url && photos.length === 0;

  return (
    <article className="w-full bg-background" style={{ contain: "layout style paint" }}>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Link to={`/user/${encodeURIComponent(post.author_name)}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-primary/10 text-sm font-bold text-primary">
          {(post.author_name || "?").charAt(0).toUpperCase()}
        </Link>
        <div className="flex flex-1 items-center gap-1.5 overflow-hidden">
          <Link to={`/user/${encodeURIComponent(post.author_name)}`} className="truncate text-sm font-semibold hover:underline">
            {handleToUsername(post.author_name)}
          </Link>
          <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
          {post.engine_family && post.engine_family !== "Other" && (
            <>
              <span className="shrink-0 text-muted-foreground">•</span>
              <span className="shrink-0 text-xs font-bold text-primary">{post.engine_family}-CLUB</span>
            </>
          )}
          <span className="shrink-0 text-muted-foreground">•</span>
          <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(post.created_date)}</span>
        </div>
        {!isOwn && (
          <button onClick={onFollow} className={`shrink-0 rounded-lg px-3 py-1 text-xs font-bold transition ${following ? "bg-secondary text-muted-foreground" : "bg-primary text-primary-foreground"}`}>
            {following ? "Following" : "Follow"}
          </button>
        )}
        <PostMenu
          isOwn={isOwn}
          onEdit={() => setShowEdit(true)}
          onTag={() => setShowTag(true)}
          onDelete={handleDelete}
          onCopyLink={() => navigator.clipboard?.writeText(window.location.href)}
        />
      </div>

      {/* Media */}
      {isTextOnly ? (
        <div className="flex aspect-square w-full items-center justify-center bg-gradient-to-br from-primary/20 via-primary/10 to-secondary p-8" onDoubleClick={onDoubleTapLike}>
          <p className="text-center text-lg font-medium leading-relaxed">{renderCaption(caption)}</p>
        </div>
      ) : post.video_url ? (
        <SmartVideo src={post.video_url} onDoubleTap={onDoubleTapLike} />
      ) : photos.length === 1 ? (
        <div onDoubleClick={onDoubleTapLike}>
          <LazyImage src={photos[0]} className="aspect-square w-full" />
        </div>
      ) : photos.length > 1 ? (
        <PhotoCarousel photos={photos} onDoubleTap={onDoubleTapLike} />
      ) : null}

      {/* Action bar */}
      <div className="flex items-center gap-4 px-3 py-2">
        <button onClick={onLike} className="active:scale-90 transition-transform">
          <motion.div animate={liked ? { scale: [1, 1.3, 1] } : {}} transition={{ duration: 0.3 }}>
            <Heart className="h-6 w-6" style={liked ? { fill: "#E60012", color: "#E60012" } : { color: "hsl(var(--foreground))" }} />
          </motion.div>
        </button>
        <button onClick={() => setShowComments((s) => !s)} className="active:scale-90 transition-transform">
          <MessageCircle className="h-6 w-6 text-foreground" />
        </button>
        <button onClick={onShare} className="active:scale-90 transition-transform">
          <Share2 className="h-6 w-6 text-foreground" />
        </button>
        <button onClick={onSave} className="ml-auto active:scale-90 transition-transform">
          <Bookmark className={`h-6 w-6 transition ${saved ? "fill-foreground text-foreground" : "text-foreground"}`} />
        </button>
      </div>

      {/* Likes count */}
      <div className="px-3">
        <p className="text-sm font-bold">{likeCount.toLocaleString()} {likeCount === 1 ? "like" : "likes"}</p>
      </div>

      {/* Caption */}
      {!isTextOnly && caption && (
        <div className="px-3 pt-1">
          <p className="text-sm leading-relaxed">
            <Link to={`/user/${encodeURIComponent(post.author_name)}`} className="mr-1.5 font-bold">{handleToUsername(post.author_name)}</Link>
            {expanded || caption.length <= 100 ? (
              <span>{renderCaption(caption)}</span>
            ) : (
              <>
                <span>{renderCaption(caption.slice(0, 100))}… </span>
                <button onClick={() => setExpanded(true)} className="text-muted-foreground">more</button>
              </>
            )}
          </p>
        </div>
      )}

      {/* Comments */}
      <div className="px-3 pt-1 pb-3">
        {commentCount !== null && commentCount >= 3 && !showComments && (
          <button onClick={() => setShowComments(true)} className="text-sm text-muted-foreground hover:text-foreground">
            View all comments
          </button>
        )}
        {!showComments && previewComments.slice(0, 2).map((c) => (
          <p key={c.id} className="text-sm leading-relaxed">
            <span className="mr-1.5 font-semibold text-muted-foreground">{c.author_name}</span>
            {c.text}
          </p>
        ))}
        {showComments && <CommentThread postId={post.id} postAuthorName={post.author_name} />}

        {/* Quick comment input — always visible when comments are collapsed */}
        {!showComments && (
          <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-muted-foreground">
              {(getCurrentUser() || "A").charAt(0).toUpperCase()}
            </div>
            <input
              value={quickComment}
              onChange={(e) => setQuickComment(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              onKeyDown={(e) => e.key === "Enter" && submitQuickComment()}
            />
            {quickComment.trim() && (
              <button onClick={submitQuickComment} className="text-sm font-bold text-primary active:opacity-60">
                Post
              </button>
            )}
          </div>
        )}

        <p className="pt-2 text-[10px] uppercase tracking-wide text-muted-foreground">{timeAgo(post.created_date)} ago</p>
      </div>

      {showEdit && (
        <EditPostModal
          post={{ ...post, caption, tags }}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => { setCaption(updated.caption || ""); setTags(updated.tags || ""); setShowEdit(false); }}
        />
      )}
      {showTag && (
        <TagSomeoneModal
          post={{ ...post, tags }}
          onClose={() => setShowTag(false)}
          onSaved={(updated) => setTags(updated.tags || "")}
        />
      )}
    </article>
  );
}