import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Send, EyeOff, Trash2, Heart } from "lucide-react";
import { ReportButton } from "@/components/moderation/ReportDialog";

export default function CommentSection({ postId, initialComments, isPostAuthor, isModerator, currentUserId }) {
  const [comments, setComments] = React.useState(initialComments || []);
  const [text, setText] = React.useState("");
  const [replyTo, setReplyTo] = React.useState(null); // comment id being replied to
  const [replyText, setReplyText] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => { setComments(initialComments || []); }, [initialComments]);

  const toggleCommentLike = async (comment) => {
    const wasLiked = comment.liked;
    setComments((cs) => cs.map((x) => x.id === comment.id ? { ...x, liked: !wasLiked, like_count: (x.like_count || 0) + (wasLiked ? -1 : 1) } : x));
    try {
      await base44.functions.invoke("social", { action: wasLiked ? "unlikeComment" : "likeComment", comment_id: comment.id });
    } catch {
      setComments((cs) => cs.map((x) => x.id === comment.id ? { ...x, liked: wasLiked, like_count: (x.like_count || 0) + (wasLiked ? 1 : -1) } : x));
    }
  };

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const res = await base44.functions.invoke("social", { action: "createComment", post_id: postId, text: text.trim() });
      if (res.data?.ok) {
        setComments((c) => [{ ...res.data.comment, author: null }, ...c]);
        setText("");
      }
    } finally { setBusy(false); }
  };

  const submitReply = async (parentId) => {
    if (!replyText.trim() || busy) return;
    setBusy(true);
    try {
      const res = await base44.functions.invoke("social", { action: "createComment", post_id: postId, text: replyText.trim(), parent_comment_id: parentId });
      if (res.data?.ok) {
        setComments((c) => [{ ...res.data.comment, author: null, parent_comment_id: parentId }, ...c]);
        setReplyText(""); setReplyTo(null);
      }
    } finally { setBusy(false); }
  };

  const removeOwn = async (commentId) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await base44.functions.invoke("social", { action: "removeOwnComment", comment_id: commentId });
      if (res.data?.ok) setComments((c) => c.map((x) => x.id === commentId ? { ...x, status: "removed_by_author" } : x));
    } finally { setBusy(false); }
  };

  const hideComment = async (commentId) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await base44.functions.invoke("social", { action: "hideCommentAsPostAuthor", comment_id: commentId });
      if (res.data?.ok) setComments((c) => c.map((x) => x.id === commentId ? { ...x, status: "hidden_by_post_author" } : x));
    } finally { setBusy(false); }
  };

  const topLevel = comments.filter((c) => !c.parent_comment_id);
  const repliesOf = (id) => comments.filter((c) => c.parent_comment_id === id);

  if (comments.length === 0 && !text) {
    return (
      <div className="space-y-4">
        <Composer value={text} onChange={setText} onSubmit={submit} busy={busy} />
        <p className="py-8 text-center text-sm text-muted-foreground">No comments yet — start the conversation.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Composer value={text} onChange={setText} onSubmit={submit} busy={busy} />

      <div className="space-y-3">
        {topLevel.map((c) => (
          <div key={c.id} className="space-y-2">
            <CommentRow
              c={c}
              currentUserId={currentUserId}
              isPostAuthor={isPostAuthor}
              isModerator={isModerator}
              onRemoveOwn={removeOwn}
              onHide={hideComment}
              onReply={() => setReplyTo(replyTo === c.id ? null : c.id)}
              onLike={() => toggleCommentLike(c)}
            />
            {replyTo === c.id && (
              <div className="pl-12">
                <Composer value={replyText} onChange={setReplyText} onSubmit={() => submitReply(c.id)} busy={busy} small />
              </div>
            )}
            {repliesOf(c.id).map((r) => (
              <div key={r.id} className="pl-12">
                <CommentRow
                  c={r}
                  currentUserId={currentUserId}
                  isPostAuthor={isPostAuthor}
                  isModerator={isModerator}
                  onRemoveOwn={removeOwn}
                  onHide={hideComment}
                  onLike={() => toggleCommentLike(r)}
                  isReply
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function CommentRow({ c, currentUserId, isPostAuthor, isModerator, onRemoveOwn, onHide, onReply, onLike, isReply }) {
  const author = c.author || {};
  const authorName = author.display_name || author.handle || author.full_name || "Member";
  const authorHandle = author.handle;
  const isOwn = c.created_by_id === currentUserId;
  const hidden = c.status === "hidden_by_post_author";
  const removed = c.status === "removed_by_author" || c.status === "removed_by_moderation";

  return (
    <div className="flex gap-2.5">
      <Link to={authorHandle ? `/user/${authorHandle}/garage` : "#"} className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-xs font-bold">
        {author.avatar_url ? <img src={author.avatar_url} alt={authorName} className="h-full w-full object-cover" style={{ objectPosition: author.avatar_position || "50% 50%" }} /> : (authorName || "?").charAt(0).toUpperCase()}
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Link to={authorHandle ? `/user/${authorHandle}/garage` : "#"} className="text-sm font-bold hover:text-primary">{authorName}</Link>
          <span className="text-xs text-muted-foreground">{timeAgo(c.created_date)}</span>
          {hidden && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-500"><EyeOff className="h-2.5 w-2.5" /> Hidden</span>}
          {removed && <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-bold text-destructive">Removed</span>}
        </div>
        {removed && c.status === "removed_by_author" && isOwn ? (
          <p className="mt-0.5 text-sm text-muted-foreground line-through">{c.text}</p>
        ) : removed ? (
          <p className="mt-0.5 text-sm italic text-muted-foreground">[comment removed]</p>
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap text-sm">{c.text}</p>
        )}
        <div className="mt-1 flex items-center gap-3">
          {!removed && !hidden && (
            <button onClick={onLike} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition hover:text-primary">
              <Heart className={`h-3 w-3 ${c.liked ? "fill-primary text-primary" : ""}`} />
              {(c.like_count || 0) > 0 && <span>{c.like_count}</span>}
            </button>
          )}
          {!removed && !hidden && !isReply && (
            <button onClick={onReply} className="text-xs font-semibold text-muted-foreground hover:text-foreground">Reply</button>
          )}
          {!removed && isOwn && (
            <button onClick={() => onRemoveOwn(c.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /> Remove</button>
          )}
          {!removed && !hidden && isPostAuthor && !isOwn && (
            <button onClick={() => onHide(c.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-amber-500"><EyeOff className="h-3 w-3" /> Hide</button>
          )}
          {!removed && !isOwn && <ReportButton targetType="comment" targetId={c.id} />}
        </div>
      </div>
    </div>
  );
}

function Composer({ value, onChange, onSubmit, busy, small }) {
  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); }}
        placeholder="Add a comment..."
        className={`flex-1 rounded-full border border-border bg-background px-4 ${small ? "py-1.5 text-xs" : "py-2.5 text-sm"}`}
      />
      <button onClick={onSubmit} disabled={!value.trim() || busy} className="rounded-full bg-primary p-2.5 text-primary-foreground disabled:opacity-50">
        <Send className="h-4 w-4" />
      </button>
    </div>
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