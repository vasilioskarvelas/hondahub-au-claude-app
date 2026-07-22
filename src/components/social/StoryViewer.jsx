import React from "react";
import { X, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { getCurrentUser } from "@/lib/userIdentity";

const PHOTO_DURATION = 5000;

export default function StoryViewer({ storyGroups, groupIndex, onClose }) {
  const [gIdx, setGIdx] = React.useState(groupIndex || 0);
  const [sIdx, setSIdx] = React.useState(0);
  const [progress, setProgress] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [duration, setDuration] = React.useState(PHOTO_DURATION);

  const elapsedRef = React.useRef(0);
  const rafRef = React.useRef(null);
  const videoRef = React.useRef(null);
  const touchStartRef = React.useRef(null);
  const advanceLockRef = React.useRef(false);

  const group = storyGroups[gIdx];
  const story = group?.stories[sIdx];

  // Track view
  React.useEffect(() => {
    if (!story) return;
    const viewer = getCurrentUser() || "Anonymous";
    if (!story.views?.includes(viewer)) {
      base44.entities.Story.update(story.id, { views: [...(story.views || []), viewer] });
    }
  }, [story?.id]);

  // Reset on story change
  React.useEffect(() => {
    elapsedRef.current = 0;
    setProgress(0);
    setPaused(false);
    advanceLockRef.current = false;
  }, [gIdx, sIdx]);

  // Set duration
  React.useEffect(() => {
    if (story?.media_type === "video") {
      setDuration(15000);
    } else {
      setDuration(PHOTO_DURATION);
    }
  }, [story?.id]);

  // Navigation (use ref to avoid stale closures in RAF)
  const navRef = React.useRef({});
  navRef.current = {
    next: () => {
      if (advanceLockRef.current) return;
      advanceLockRef.current = true;
      if (sIdx < group.stories.length - 1) {
        setSIdx(sIdx + 1);
      } else if (gIdx < storyGroups.length - 1) {
        setGIdx(gIdx + 1);
        setSIdx(0);
      } else {
        onClose();
      }
    },
    prev: () => {
      if (advanceLockRef.current) return;
      advanceLockRef.current = true;
      if (sIdx > 0) {
        setSIdx(sIdx - 1);
      } else if (gIdx > 0) {
        const prevGroup = storyGroups[gIdx - 1];
        setGIdx(gIdx - 1);
        setSIdx(prevGroup.stories.length - 1);
      } else {
        advanceLockRef.current = false;
      }
    },
    nextPerson: () => {
      if (gIdx < storyGroups.length - 1) {
        setGIdx(gIdx + 1);
        setSIdx(0);
      }
    },
    prevPerson: () => {
      if (gIdx > 0) {
        const prevGroup = storyGroups[gIdx - 1];
        setGIdx(gIdx - 1);
        setSIdx(prevGroup.stories.length - 1);
      }
    },
  };

  // Animation loop
  React.useEffect(() => {
    if (paused || !story) return;

    let lastTime = Date.now();

    const tick = () => {
      const now = Date.now();
      elapsedRef.current += now - lastTime;
      lastTime = now;

      const pct = Math.min((elapsedRef.current / duration) * 100, 100);
      setProgress(pct);

      if (pct >= 100) {
        navRef.current.next();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [paused, gIdx, sIdx, duration, story]);

  // Keyboard
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") navRef.current.next();
      else if (e.key === "ArrowLeft") navRef.current.prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Touch handlers
  const onTouchStart = (e) => {
    setPaused(true);
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
  };

  const onTouchEnd = (e) => {
    const touch = touchStartRef.current;
    setPaused(false);
    if (!touch) return;

    const dx = e.changedTouches[0].clientX - touch.x;
    const dy = e.changedTouches[0].clientY - touch.y;
    const dt = Date.now() - touch.time;

    // Swipe down to close
    if (dy > 80 && dy > Math.abs(dx)) {
      onClose();
      touchStartRef.current = null;
      return;
    }

    // Horizontal swipe → change person
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) navRef.current.prevPerson();
      else navRef.current.nextPerson();
      touchStartRef.current = null;
      return;
    }

    // Tap → navigate story based on position
    if (dt < 300 && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      const tapX = e.changedTouches[0].clientX;
      if (tapX < window.innerWidth / 3) navRef.current.prev();
      else navRef.current.next();
    }

    touchStartRef.current = null;
  };

  // Mouse handlers (desktop)
  const onMouseDown = () => setPaused(true);
  const onMouseUp = (e) => {
    setPaused(false);
    if (e.clientX < window.innerWidth / 3) navRef.current.prev();
    else navRef.current.next();
  };
  const onMouseLeave = () => setPaused(false);

  if (!group || !story) return null;

  return (
    <div className="fixed inset-0 z-50 flex select-none items-center justify-center bg-black">
      {/* Close button */}
      <button
        className="absolute right-4 top-6 z-30 text-white/90 transition hover:text-white"
        onClick={onClose}
      >
        <X className="h-7 w-7" />
      </button>

      {/* Desktop nav arrows */}
      {gIdx > 0 && (
        <button
          className="absolute left-2 top-1/2 z-30 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/10 p-2 text-white backdrop-blur transition hover:bg-white/20 sm:flex"
          onClick={() => navRef.current.prevPerson()}
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {gIdx < storyGroups.length - 1 && (
        <button
          className="absolute right-2 top-1/2 z-30 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/10 p-2 text-white backdrop-blur transition hover:bg-white/20 sm:flex"
          onClick={() => navRef.current.nextPerson()}
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* Story container */}
      <div
        className="relative h-full w-full max-w-md overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      >
        {/* Media */}
        {story.media_type === "video" ? (
          <video
            ref={videoRef}
            src={story.media_url}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
            onLoadedMetadata={(e) => setDuration(Math.max((e.target.duration || 5) * 1000, 2000))}
            onEnded={() => navRef.current.next()}
          />
        ) : (
          <img src={story.media_url} alt="" className="h-full w-full object-cover" />
        )}

        {/* Top gradient */}
        <div className="pointer-events-none absolute left-0 right-0 top-0 h-32 bg-gradient-to-b from-black/60 to-transparent" />

        {/* Progress bars */}
        <div className="absolute left-0 right-0 top-0 flex gap-1 px-3 pt-4">
          {group.stories.map((_, i) => (
            <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
              <div
                className="h-full rounded-full bg-white transition-[width] duration-75 ease-linear"
                style={{
                  width: i < sIdx ? "100%" : i === sIdx ? `${progress}%` : "0%",
                }}
              />
            </div>
          ))}
        </div>

        {/* Author info */}
        <div className="absolute left-3 top-8 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/30 text-sm font-bold text-white">
            {(story.author_name || "?").charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-semibold text-white drop-shadow-lg">
            {story.author_name}
          </span>
        </div>

        {/* Bottom gradient + views */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex items-center gap-2 bg-gradient-to-t from-black/60 to-transparent p-4">
          <Eye className="h-4 w-4 text-white/70" />
          <span className="text-xs text-white/70">{(story.views || []).length} views</span>
        </div>
      </div>
    </div>
  );
}