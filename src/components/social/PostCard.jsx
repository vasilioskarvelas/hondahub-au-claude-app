import React from "react";
import { Link } from "react-router-dom";
import { Heart, MessageCircle, Car } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import FollowButton from "@/components/social/FollowButton";
import { ReportButton } from "@/components/moderation/ReportDialog";

export default function PostCard({ post, onLiked, compact }) {
  const [liked, setLiked] = React.useState(!!post.liked);
  const [likeCount, setLikeCount] = React.useState(post.like_count || 0);
  const [busy, setBusy] = React.useState(false);
  const { user } = useAuth();

  const author = post.author || {};
  const authorName = author.display_name || author.handle || author.full_name || "Honda Enthusiast";
  const authorHandle = author.handle;
  const avatarLetter = (authorName || "?").charAt(0).toUpperCase();

  const toggleLike = async () => {
    if (busy) return;
    setBusy(true);
    const prevLiked = liked;
    setLiked(!prevLiked);
    setLikeCount((c) => c + (prevLiked ? -1 : 1));
    try {
      const action = prevLiked ? "unlikePost" : "likePost";
      const res = await base44.functions.invoke("social", { action, post_id: post.id });
      const newCount = res.data?.like_count;
      if (typeof newCount === "number") setLikeCount(newCount);
      setLiked(res.data?.liked ?? !prevLiked);
      onLiked?.(post.id, res.data?.liked ?? !prevLiked, newCount);
    } catch {
      setLiked(prevLiked);
      setLikeCount((c) => c + (prevLiked ? 1 : -1));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-3 p-4">
        <Link to={authorHandle ? `/user/${encodeURIComponent(authorHandle)}` : "#"} className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-black text-primary-foreground">
          {author.avatar_url ? <img src={author.avatar_url} alt={authorName} className="h-full w-full object-cover" style={{ objectPosition: author.avatar_position || "50% 50%" }} /> : avatarLetter}
        </Link>
        <div className="flex-1 min-w-0">
          <Link to={authorHandle ? `/user/${encodeURIComponent(authorHandle)}` : "#"} className="block truncate text-sm font-bold hover:text-primary">{authorName}</Link>
          {authorHandle && <p className="truncate text-xs text-muted-foreground">@{authorHandle}</p>}
        </div>
        {user && author.id && author.id !== user.id && (
          <FollowButton targetType="user" targetId={author.id} initialFollowing={!!post.following} />
        )}
        <span className="text-xs text-muted-foreground">{timeAgo(post.created_date)}</span>
      </div>

      {!compact && post.caption && (
        <p className="whitespace-pre-wrap px-4 pb-3 text-sm leading-relaxed">{post.caption}</p>
      )}

      {post.media_url && (
        <div className="border-y border-border bg-background">
          <img src={post.media_url} alt={post.caption || "post"} className="max-h-[520px] w-full object-cover" />
        </div>
      )}

      {post.hashtags?.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pt-3">
          {post.hashtags.map((t) => (
            <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-primary">{t}</span>
          ))}
        </div>
      )}

      {post.vehicle && (
        <Link to={`/vehicle/${post.vehicle.id}`} className="mx-4 mt-3 flex items-center gap-2 rounded-xl border border-border bg-secondary/40 p-2.5 text-sm hover:border-primary/40">
          <Car className="h-4 w-4 text-primary" />
          <span className="font-semibold">{post.vehicle.nickname || `${post.vehicle.year} ${post.vehicle.make} ${post.vehicle.model}`}</span>
          {post.vehicle.chassis_code && <span className="text-muted-foreground">· {post.vehicle.chassis_code}</span>}
        </Link>
      )}

      <div className="flex items-center gap-4 p-4">
        <button onClick={toggleLike} disabled={busy} className="flex items-center gap-1.5 text-sm font-medium transition hover:text-primary">
          <Heart className={`h-5 w-5 ${liked ? "fill-primary text-primary" : "text-muted-foreground"}`} />
          <span className={liked ? "text-primary" : "text-muted-foreground"}>{likeCount}</span>
        </button>
        <Link to={`/post/${post.id}`} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-primary">
          <MessageCircle className="h-5 w-5" />
          <span>{post.comment_count || 0}</span>
        </Link>
        <ReportButton targetType="post" targetId={post.id} className="ml-auto" />
      </div>
    </article>
  );
}

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}