import React from "react";
import { base44 } from "@/api/base44Client";
import { Heart, Send, CornerDownRight } from "lucide-react";
import { getCurrentUser, isLiked, toggleLiked } from "@/lib/userIdentity";

function renderText(text) {
  if (!text) return null;
  return text.split(/(#\w+|@\w+)/g).map((p, i) =>
    p.startsWith("#") || p.startsWith("@")
      ? <span key={i} className="text-primary font-medium">{p}</span>
      : <span key={i}>{p}</span>
  );
}

export default function CommentThread({ postId, postAuthorName }) {
  const [comments, setComments] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [text, setText] = React.useState("");
  const [name, setName] = React.useState(getCurrentUser());
  const [replyTo, setReplyTo] = React.useState(null);
  const [replyText, setReplyText] = React.useState("");

  const load = () => {
    base44.entities.Comment.filter({ post_id: postId }, "created_date", 50).then((c) => {
      setComments(c);
      setLoading(false);
    });
  };
  React.useEffect(load, [postId]);

  const topLevel = comments.filter((c) => !c.parent_comment_id);
  const repliesOf = (id) => comments.filter((c) => c.parent_comment_id === id);

  const submit = async () => {
    if (!text.trim()) return;
    const n = name || "Anonymous";
    const c = await base44.entities.Comment.create({ post_id: postId, author_name: n, text, likes: 0 });
    setComments((cs) => [...cs, c]);
    setText("");
    if (postAuthorName && postAuthorName !== n) {
      base44.entities.Notification.create({ type: "comment", from_name: n, to_name: postAuthorName, post_id: postId, text: "commented on your post", read: false });
    }
    (text.match(/@\w+/g) || []).forEach((m) => {
      const mentioned = m.substring(1);
      if (mentioned !== n && mentioned !== postAuthorName) {
        base44.entities.Notification.create({ type: "mention", from_name: n, to_name: mentioned, post_id: postId, text: "mentioned you in a comment", read: false });
      }
    });
  };

  const submitReply = async (parentId, parentAuthor) => {
    if (!replyText.trim()) return;
    const n = name || "Anonymous";
    const c = await base44.entities.Comment.create({ post_id: postId, author_name: n, text: replyText, parent_comment_id: parentId, likes: 0 });
    setComments((cs) => [...cs, c]);
    setReplyText("");
    setReplyTo(null);
    if (parentAuthor && parentAuthor !== n) {
      base44.entities.Notification.create({ type: "reply", from_name: n, to_name: parentAuthor, post_id: postId, text: "replied to your comment", read: false });
    }
  };

  const likeComment = (c) => {
    const nowLiked = toggleLiked(c.id);
    const newLikes = (c.likes || 0) + (nowLiked ? 1 : -1);
    setComments((cs) => cs.map((x) => (x.id === c.id ? { ...x, likes: newLikes } : x)));
    base44.entities.Comment.update(c.id, { likes: newLikes });
  };

  if (loading) return <p className="py-2 text-xs text-muted-foreground">Loading comments...</p>;

  return (
    <div className="mt-2 space-y-2">
      {topLevel.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
      {topLevel.map((c) => (
        <div key={c.id} className="space-y-1">
          <CommentItem c={c} onLike={() => likeComment(c)} liked={isLiked(c.id)} onReply={() => { setReplyTo(c.id); setReplyText(""); }} />
          {repliesOf(c.id).map((r) => (
            <div key={r.id} className="ml-6">
              <CommentItem c={r} onLike={() => likeComment(r)} liked={isLiked(r.id)} onReply={() => { setReplyTo(r.id); setReplyText(""); }} isReply />
            </div>
          ))}
          {replyTo === c.id && (
            <div className="ml-6 flex gap-2 pt-1">
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={`Reply to ${c.author_name}...`}
                className="flex-1 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                onKeyDown={(e) => e.key === "Enter" && submitReply(c.id, c.author_name)}
                autoFocus
              />
              <button onClick={() => submitReply(c.id, c.author_name)} className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-bold text-primary-foreground">
                <Send className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      ))}
      {/* Add comment input — Instagram style */}
      <div className="flex items-center gap-2 border-t border-border pt-2">
        {!getCurrentUser() && (
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="w-24 rounded-lg border border-border bg-secondary px-2 py-1.5 text-xs outline-none focus:border-primary" />
        )}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment..."
          className="flex-1 bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {text.trim() && (
          <button onClick={submit} className="text-sm font-bold text-primary active:opacity-60">
            Post
          </button>
        )}
      </div>
    </div>
  );
}

function CommentItem({ c, onLike, liked, onReply, isReply }) {
  return (
    <div className="flex items-start gap-2">
      {!isReply && <CornerDownRight className="mt-1 h-3 w-3 shrink-0 text-muted-foreground/40" />}
      <div className="flex-1">
        <p className="text-sm leading-relaxed">
          <span className="mr-1.5 font-semibold">{c.author_name}</span>
          {renderText(c.text)}
        </p>
        <div className="mt-0.5 flex items-center gap-4 pl-0">
          <button onClick={onLike} className="text-muted-foreground transition hover:text-primary">
            <Heart className={`h-3 w-3 ${liked ? "fill-primary text-primary" : ""}`} />
            {(c.likes || 0) > 0 && <span className="ml-1 text-[10px]">{c.likes}</span>}
          </button>
          <button onClick={onReply} className="text-[10px] text-muted-foreground transition hover:text-primary">Reply</button>
        </div>
      </div>
    </div>
  );
}