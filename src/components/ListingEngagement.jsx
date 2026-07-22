import React from "react";
import { base44 } from "@/api/base44Client";
import { Heart, MessageCircle, Send } from "lucide-react";
import { getCurrentUser } from "@/lib/userIdentity";

export default function ListingEngagement({ listingId }) {
  const [likes, setLikes] = React.useState(0);
  const [liked, setLiked] = React.useState(false);
  const [comments, setComments] = React.useState([]);
  const [commentText, setCommentText] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  const storageKey = `hondahub_listing_likes_${listingId}`;

  React.useEffect(() => {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '{"count":0,"liked":false}');
    setLikes(stored.count || 0);
    setLiked(stored.liked || false);
    base44.entities.Comment.filter({ post_id: listingId }, "-created_date", 50)
      .then(setComments)
      .finally(() => setLoading(false));
  }, [listingId]);

  const toggleLike = () => {
    const newLiked = !liked;
    const newCount = newLiked ? likes + 1 : Math.max(0, likes - 1);
    setLiked(newLiked);
    setLikes(newCount);
    localStorage.setItem(storageKey, JSON.stringify({ count: newCount, liked: newLiked }));
  };

  const submitComment = async () => {
    if (!commentText.trim()) return;
    const name = getCurrentUser() || "Guest";
    const comment = await base44.entities.Comment.create({
      post_id: listingId,
      author_name: name,
      text: commentText.trim(),
    });
    setComments((prev) => [comment, ...prev]);
    setCommentText("");
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-4 border-b border-border pb-3">
        <button onClick={toggleLike} className="flex items-center gap-2 text-sm font-bold">
          <Heart className={`h-5 w-5 ${liked ? "fill-primary text-primary" : "text-muted-foreground"}`} />
          {likes}
        </button>
        <span className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
          <MessageCircle className="h-5 w-5" /> {comments.length}
        </span>
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitComment()}
          placeholder="Add a comment..."
          className="flex-1 rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm outline-none focus:border-primary"
        />
        <button onClick={submitComment} disabled={!commentText.trim()} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
          <Send className="h-4 w-4" />
        </button>
      </div>
      {comments.length > 0 && (
        <div className="mt-4 space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                {c.author_name?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="text-sm">
                  <span className="font-bold">{c.author_name}</span>
                  <span className="ml-2 text-muted-foreground">{c.text}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}