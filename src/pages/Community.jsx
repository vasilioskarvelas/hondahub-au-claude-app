import React from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Home, Video, Compass, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReelItem from "@/components/social/ReelItem";
import { getSavedPosts } from "@/lib/userIdentity";
import StoriesBar from "@/components/social/StoriesBar";
import SocialPostCard from "@/components/social/SocialPostCard";
import CreatePostModal from "@/components/social/CreatePostModal";
import FeedSkeleton from "@/components/social/FeedSkeleton";
import ExploreGrid from "@/components/social/ExploreGrid";

const ENGINE_CLUBS = ["All", "K-Club", "B-Club", "D-Club", "H-Club", "F-Club", "Other"];

export default function Community() {
  const [posts, setPosts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);
  const [activeClub, setActiveClub] = React.useState("All");
  const [view, setView] = React.useState("feed");
  const [visibleCount, setVisibleCount] = React.useState(10);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const sentinelRef = React.useRef(null);

  // Pull-to-refresh state
  const pullStartY = React.useRef(0);
  const pullDistRef = React.useRef(0);
  const [pullDist, setPullDist] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const p = await base44.entities.CommunityPost.list("-created_date", 50);
      setPosts(p);
      if (isRefresh) setVisibleCount(10);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setPullDist(0);
      pullDistRef.current = 0;
    }
  };
  React.useEffect(() => { load(); }, []);

  // Infinite scroll
  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el || loading) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && visibleCount < filtered.length) {
          setLoadingMore(true);
          setTimeout(() => {
            setVisibleCount((c) => Math.min(c + 10, filtered.length));
            setLoadingMore(false);
          }, 400);
        }
      },
      { rootMargin: "300px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visibleCount, loading, posts.length]);

  // Pull-to-refresh
  React.useEffect(() => {
    let active = false;
    const onStart = (e) => {
      if (window.scrollY <= 0 && !refreshing) {
        pullStartY.current = e.touches[0].clientY;
        active = true;
      }
    };
    const onMove = (e) => {
      if (!active || refreshing) return;
      const diff = e.touches[0].clientY - pullStartY.current;
      if (diff > 0 && window.scrollY <= 0) {
        const d = Math.min(diff * 0.4, 100);
        pullDistRef.current = d;
        setPullDist(d);
      }
    };
    const onEnd = async () => {
      if (!active) return;
      active = false;
      if (pullDistRef.current >= 80) {
        setRefreshing(true);
        setPullDist(80);
        await load(true);
      } else {
        setPullDist(0);
        pullDistRef.current = 0;
      }
      pullStartY.current = 0;
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [refreshing]);

  const clubToFamily = (club) => (club === "All" ? null : club.replace("-Club", ""));
  const filtered = posts.filter((p) => {
    const family = clubToFamily(activeClub);
    if (family && p.engine_family !== family) return false;
    return true;
  });
  const displayPosts = filtered;
  const reelPosts = filtered.filter((p) => p.video_url);
  const visiblePosts = displayPosts.slice(0, visibleCount);
  const hasMore = visibleCount < displayPosts.length;

  return (
    <div className="mx-auto min-h-screen max-w-[600px] bg-background">
      {/* Header */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur-xl">
        <h1 className="text-xl font-black tracking-tighter">Honda Social</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => setView("feed")} className={`transition active:scale-90 ${view === "feed" ? "text-primary" : "text-muted-foreground"}`}>
            <Home className="h-6 w-6" />
          </button>
          <button onClick={() => setView("reels")} className={`transition active:scale-90 ${view === "reels" ? "text-primary" : "text-muted-foreground"}`}>
            <Video className="h-6 w-6" />
          </button>
          <button onClick={() => setView("explore")} className={`transition active:scale-90 ${view === "explore" ? "text-primary" : "text-muted-foreground"}`}>
            <Compass className="h-6 w-6" />
          </button>
          <button onClick={() => setShowCreate(true)} className="text-primary transition active:scale-90">
            <Plus className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* Pull-to-refresh indicator */}
      {(pullDist > 0 || refreshing) && (
        <div className="flex items-center justify-center overflow-hidden transition-[height] duration-100" style={{ height: refreshing ? 40 : pullDist }}>
          <RefreshCw className={`h-5 w-5 text-primary ${refreshing ? "animate-spin" : ""}`} style={refreshing ? undefined : { transform: `rotate(${pullDist * 3}deg)` }} />
        </div>
      )}

      <AnimatePresence mode="wait">
        {view === "feed" && (
          <motion.div key="feed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <StoriesBar />

            {/* Engine club chips */}
            <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-2 scrollbar-hide">
              {ENGINE_CLUBS.map((club) => (
                <button
                  key={club}
                  onClick={() => { setActiveClub(club); setVisibleCount(10); }}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-bold transition ${activeClub === club ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground"}`}
                >
                  {club}
                </button>
              ))}
            </div>

            {/* Feed */}
            {loading ? (
              <FeedSkeleton />
            ) : visiblePosts.length === 0 ? (
              <div className="p-12 text-center">
                <Video className="mx-auto h-10 w-10 text-muted-foreground" />
                <h3 className="mt-3 font-bold">No posts yet</h3>
                <p className="mt-1 text-sm text-muted-foreground">Be the first to share your Honda build.</p>
                <button onClick={() => setShowCreate(true)} className="mt-4 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Create Post</button>
              </div>
            ) : (
              <>
                <div className="divide-y divide-border border-b border-border">
                  {visiblePosts.map((p) => (
                    <SocialPostCard key={p.id} post={p} onDelete={(id) => setPosts((ps) => ps.filter((x) => x.id !== id))} />
                  ))}
                </div>
                {hasMore && (
                  <div ref={sentinelRef} className="flex justify-center py-4">
                    {loadingMore && <div className="h-6 w-6 animate-spin rounded-full border-2 border-secondary border-t-primary" />}
                  </div>
                )}
                {!hasMore && displayPosts.length > 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">You're all caught up ✓</p>
                )}
              </>
            )}
          </motion.div>
        )}

        {view === "reels" && (
          <motion.div key="reels" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            {reelPosts.length === 0 ? (
              <div className="p-12 text-center">
                <Video className="mx-auto h-10 w-10 text-muted-foreground" />
                <h3 className="mt-3 font-bold">No reels found</h3>
                <p className="mt-1 text-sm text-muted-foreground">Share a video post to see it here.</p>
                <button onClick={() => setShowCreate(true)} className="mt-4 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Share a Video</button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {reelPosts.map((r) => <ReelItem key={r.id} reel={r} />)}
              </div>
            )}
          </motion.div>
        )}

        {view === "explore" && (
          <motion.div key="explore" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <ExploreGrid posts={displayPosts} onDelete={(id) => setPosts((ps) => ps.filter((x) => x.id !== id))} />
          </motion.div>
        )}
      </AnimatePresence>

      {showCreate && <CreatePostModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}