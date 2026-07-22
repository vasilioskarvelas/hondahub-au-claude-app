import React from "react";
import { Heart, Volume2, VolumeX, Play } from "lucide-react";
import { motion } from "framer-motion";

let currentlyPlayingEl = null;

export function pauseAllSmartVideos() {
  if (currentlyPlayingEl && currentlyPlayingEl.pause) {
    currentlyPlayingEl.pause();
    currentlyPlayingEl = null;
  }
}

export default function SmartVideo({ src, onDoubleTap }) {
  const containerRef = React.useRef(null);
  const videoRef = React.useRef(null);
  const clickTimeoutRef = React.useRef(null);
  const [inView, setInView] = React.useState(false);
  const [hasPlayed, setHasPlayed] = React.useState(false);
  const [muted, setMuted] = React.useState(true);
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [showHeart, setShowHeart] = React.useState(false);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setInView(entry.intersectionRatio >= 0.6),
      { threshold: [0, 0.6, 1.0] }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (inView && muted) {
      if (currentlyPlayingEl && currentlyPlayingEl !== v) currentlyPlayingEl.pause();
      v.play().then(() => { currentlyPlayingEl = v; setHasPlayed(true); }).catch(() => {});
    } else if (!inView) {
      v.pause();
    }
  }, [inView, muted]);

  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => { if (v.duration) setProgress((v.currentTime / v.duration) * 100); };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("timeupdate", onTime);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("timeupdate", onTime);
    };
  }, []);

  const handleTap = () => {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      setShowHeart(true);
      setTimeout(() => setShowHeart(false), 800);
      if (onDoubleTap) onDoubleTap();
    } else {
      clickTimeoutRef.current = setTimeout(() => {
        const v = videoRef.current;
        if (!v) { clickTimeoutRef.current = null; return; }
        if (muted) {
          setMuted(false);
          v.play().catch(() => {});
        } else {
          if (v.paused) v.play(); else v.pause();
        }
        clickTimeoutRef.current = null;
      }, 250);
    }
  };

  return (
    <div ref={containerRef} className="relative aspect-square w-full overflow-hidden bg-secondary select-none" onClick={handleTap}>
      <video ref={videoRef} src={src} className="h-full w-full object-cover" muted={muted} playsInline loop preload="none" />

      {!hasPlayed && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
            <Play className="ml-0.5 h-7 w-7 fill-white text-white" />
          </div>
        </div>
      )}

      {hasPlayed && (
        <div className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
          {muted ? <VolumeX className="h-4 w-4 text-white" /> : <Volume2 className="h-4 w-4 text-white" />}
        </div>
      )}

      {hasPlayed && !playing && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
            <Play className="ml-0.5 h-6 w-6 fill-white text-white" />
          </div>
        </div>
      )}

      {hasPlayed && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20">
          <div className="h-full bg-primary transition-[width] duration-100" style={{ width: `${progress}%` }} />
        </div>
      )}

      {showHeart && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1.2, opacity: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          style={{ willChange: "transform" }}
        >
          <Heart className="h-20 w-20 drop-shadow-lg" style={{ fill: "#E60012", color: "#E60012" }} />
        </motion.div>
      )}
    </div>
  );
}