import React from "react";
import { base44 } from "@/api/base44Client";
import { callGarage, resolveMediaUrl } from "@/lib/garage";
import { Heart, MessageCircle, Send, Trash2 } from "lucide-react";

function timeAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return d.toLocaleDateString();
}

export default function VehicleEngagement({ vehicleId, initialLiked, initialLikeCount, comments: initialComments, currentUserId }) {
  const [liked, setLiked] = React.useState(!!initialLiked);
  const [likeCount, setLikeCount] = React.useState(initialLikeCount || 0);
  const [comments, setComments] = React.useState(initialComments || []);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [avatars, setAvatars] = React.useState({});

  React.useEffect(() => {
    setLiked(!!initialLiked);
    setLikeCount(initialLikeCount || 0);
    setComments(initialComments || []);
  }, [initialLiked, initialLikeCount, initialComments]);

  React.useEffect(() => {
    let active = true;
    (async () => {
      const ids = [...new Set(comments.map((c) => c.author?.avatar_media_id).filter(Boolean))];
      const entries = await Promise.all(ids.map(async (id) => [id, await resolveMediaUrl(id)]));
      if (active) setAvatars(Object.fromEntries(entries.filter(([, u]) => u)));
    })();
    return () => { active = false; };
  }, [comments]);

  const toggleLike = async () => {
    const prev = liked;
    setLiked(!prev);
    setLikeCount((c) => (prev ? c - 1 : c + 1));
    try {
      const res = await callGarage("vehicle", { action: prev ? "unlikeVehicle" : "likeVehicle", vehicle_id: vehicleId });
      if (res?.ok) { setLiked(res.liked); setLikeCount(res.like_count); }
    } catch {
      setLiked(prev);
      setLikeCount((c) => (prev ? c + 1 : c - 1));
    }
  };

  const submitComment = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const res = await callGarage("vehicle", { action: "addComment", vehicle_id: vehicleId, text: text.trim() });
      if (res?.ok) {
        setComments((c) => [res.comment, ...c]);
        setText("");
      }
    } finally {
      setBusy(false);
    }
  };

  const deleteComment = async (id) => {
    try {
      await callGarage("vehicle", { action: "removeComment", comment_id: id });
      setComments((c) => c.filter((x) => x.id !== id));
    } catch {}
  };

  const renderAvatar = (author) => {
    const url = author?.avatar_media_id ? avatars[author.avatar_media_id] : null;
    const name = author?.display_name || author?.handle || "M";
    if (url) return <img src={url} alt={name} className="h-7 w-7 shrink-0 rounded-full object-cover" />;
    return <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-black">{name.charAt(0).toUpperCase()}</div>;
  };

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-4">
        <button onClick={toggleLike} className={`inline-flex items-center gap-1.5 text-sm font-bold transition ${liked ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
          <Heart className={`h-4 w-4 ${liked ? "fill-primary" : ""}`} /> {likeCount}
        </button>
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
          <MessageCircle className="h-4 w-4" /> {comments.length}
        </span>
      </div>

      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment about this build…"
          className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          onKeyDown={(e) => { if (e.key === "Enter") submitComment(); }}
        />
        <button onClick={submitComment} disabled={!text.trim() || busy} className="rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
          <Send className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2.5">
        {comments.length === 0 ? (
          <p className="text-xs text-muted-foreground">No comments yet — start the conversation.</p>
        ) : comments.map((c) => (
          <div key={c.id} className="flex gap-2">
            {renderAvatar(c.author)}
            <div className="flex-1 rounded-2xl border border-border bg-background p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold">{c.author?.display_name || c.author?.handle || "Member"}</span>
                  <span className="text-[10px] text-muted-foreground">{timeAgo(c.created_date)}</span>
                </div>
                {c.created_by_id === currentUserId && (
                  <button onClick={() => deleteComment(c.id)} className="text-muted-foreground transition hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
              <p className="mt-1 text-sm">{c.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}