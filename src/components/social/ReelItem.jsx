import React from "react";
import { base44 } from "@/api/base44Client";
import { Heart, MessageCircle, Share2, BadgeCheck, Send, Volume2, VolumeX, Play } from "lucide-react";
import { motion } from "framer-motion";
import { getCurrentUser } from "@/lib/userIdentity";
import { toast } from "@/components/ui/use-toast";

export default function ReelItem({ reel }) {
  const [liked, setLiked] = React.useState(false);
  const [likeCount, setLikeCount] = React.useState(reel.likes || 0);
  const [showComment, setShowComment] = React.useState(false);
  const [comments, setComments] = React.useState([]);
  const [text, setText] = React.useState("");
  const [muted, setMuted] = React.useState(true);
  const [playing, setPlaying] = React.useState(false);
  const [showHeart, setShowHeart] = React.useState(false);
  const videoRef = React.useRef(null);

  const onLike = async () => {
    const wasLiked = liked;
    const nowLiked = !wasLiked;
    const baseLikes = reel.likes || 0;
    const newCount = nowLiked ? baseLikes + 1 : baseLikes;
    setLiked(nowLiked);
    setLikeCount(newCount);
    try {
      await base44.entities.CommunityPost.update(reel.id, { likes: newCount });
    } catch {
      setLiked(wasLiked);
      setLikeCount(baseLikes);
    }
  };

  const handleDoubleTap = () => {
    setShowHeart(true);
    setTimeout(() => setShowHeart(false), 800);
    if (!liked) onLike();
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  };

  const loadComments = () => base44.entities.Comment.filter({ post_id: reel.id }, "created_date", 50).then(setComments);

  const toggleComments = () => {
    if (!showComment) loadComments();
    setShowComment((s) => !s);
  };

  const submitComment = async () => {
    if (!text.trim()) return;
    const name = getCurrentUser() || "Anonymous";
    const c = await base44.entities.Comment.create({ post_id: reel.id, author_name: name, text, likes: 0 });
    setComments((cs) => [...cs, c]);
    setText("");
  };

  const onShare = async () => {
    const shareUrl = `${window.location.origin}/community`;
    if (navigator.share) {
      navigator.share({ title: "HondaHub", text: reel.caption || "Check out this reel!", url: shareUrl }).catch(() => {});
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast({ title: "Link copied!" });
      } catch {}
    }
  };

  return (
    <div className="relative aspect-[9/16] w-full overflow-hidden bg-black select-none">
      {/* Video */}
      <video
        ref={videoRef}
        src={reel.video_url}
        className="h-full w-full object-cover"
        muted={muted}
        playsInline
        loop
        onClick={togglePlay}
        onDoubleClick={handleDoubleTap}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />

      {/* Play overlay */}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center" onClick={togglePlay}>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
            <Play className="ml-0.5 h-7 w-7 fill-white text-white" />
          </div>
        </div>
      )}

      {/* Heart burst on double-tap */}
      {showHeart && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1.2, opacity: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <Heart className="h-20 w-20 fill-white text-white drop-shadow-lg" />
        </motion.div>
      )}

      {/* Mute toggle */}
      <button
        onClick={() => setMuted((m) => !m)}
        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm"
      >
        {muted ? <VolumeX className="h-4 w-4 text-white" /> : <Volume2 className="h-4 w-4 text-white" />}
      </button>

      {/* Bottom gradient + author info */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-16 bg-gradient-to-t from-black/80 to-transparent pb-4 pt-16">
        <div className="px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/30 text-sm font-bold text-white">
              {(reel.author_name || "?").charAt(0).toUpperCase()}
            </div>
            <span className="flex items-center gap-1 text-sm font-bold text-white">
              {(reel.author_name || "anonymous").replace(/\s/g, "_").toLowerCase()}
              <BadgeCheck className="h-3.5 w-3.5 text-primary" />
            </span>
            {reel.engine_family && reel.engine_family !== "Other" && (
              <span className="rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">{reel.engine_family}</span>
            )}
          </div>
          {reel.caption && <p className="mt-1.5 text-sm text-white/90">{reel.caption}</p>}
        </div>
      </div>

      {/* Right action bar — Instagram Reels style */}
      <div className="absolute bottom-6 right-3 flex flex-col items-center gap-5">
        <button onClick={onLike} className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
          <Heart className="h-7 w-7" style={liked ? { fill: "#E60012", color: "#E60012" } : { color: "#fff" }} />
          <span className="text-xs font-semibold text-white">{likeCount}</span>
        </button>
        <button onClick={toggleComments} className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
          <MessageCircle className="h-7 w-7 text-white" />
          <span className="text-xs font-semibold text-white">{comments.length || ""}</span>
        </button>
        <button onClick={onShare} className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
          <Share2 className="h-7 w-7 text-white" />
          <span className="text-xs font-semibold text-white">Share</span>
        </button>
      </div>

      {/* Comment overlay */}
      {showComment && (
        <div className="absolute bottom-0 left-0 right-0 max-h-[50%] overflow-y-auto border-t border-white/10 bg-black/95 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-bold text-white">{comments.length} Comments</span>
            <button onClick={() => setShowComment(false)} className="text-white/60 hover:text-white">✕</button>
          </div>
          {comments.map((c) => (
            <div key={c.id} className="mb-3 flex gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white">
                {(c.author_name || "?").charAt(0).toUpperCase()}
              </div>
              <div>
                <span className="text-xs font-bold text-white/80">{c.author_name}</span>
                <p className="text-sm text-white/90">{c.text}</p>
              </div>
            </div>
          ))}
          {comments.length === 0 && <p className="text-xs text-white/50">No comments yet.</p>}
          <div className="mt-3 flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 rounded-lg bg-white/10 px-3 py-2 text-sm text-white outline-none"
              onKeyDown={(e) => e.key === "Enter" && submitComment()}
            />
            <button onClick={submitComment} className="rounded-lg bg-primary px-3 py-2">
              <Send className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}