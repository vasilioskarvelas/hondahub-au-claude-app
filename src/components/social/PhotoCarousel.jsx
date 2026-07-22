import React from "react";
import { Heart } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function PhotoCarousel({ photos, onDoubleTap }) {
  const [idx, setIdx] = React.useState(0);
  const [showHeart, setShowHeart] = React.useState(false);
  const [dragStart, setDragStart] = React.useState(null);
  const [isDragging, setIsDragging] = React.useState(false);

  if (!photos || photos.length === 0) return null;

  if (photos.length === 1) {
    return (
      <div
        className="relative aspect-square w-full overflow-hidden bg-black select-none"
        onDoubleClick={handleDoubleTap}
      >
        <img src={photos[0]} alt="" loading="lazy" className="h-full w-full object-cover" />
        <HeartBurst show={showHeart} />
      </div>
    );
  }

  function handleDoubleTap() {
    setShowHeart(true);
    setTimeout(() => setShowHeart(false), 800);
    if (onDoubleTap) onDoubleTap();
  }

  const goNext = () => setIdx((i) => Math.min(i + 1, photos.length - 1));
  const goPrev = () => setIdx((i) => Math.max(i - 1, 0));

  return (
    <div
      className="relative aspect-square w-full overflow-hidden bg-black select-none"
      onDoubleClick={handleDoubleTap}
      onPointerDown={(e) => {
        setDragStart({ x: e.clientX, y: e.clientY, time: Date.now() });
        setIsDragging(false);
      }}
      onPointerMove={(e) => {
        if (!dragStart) return;
        const dx = Math.abs(e.clientX - dragStart.x);
        const dy = Math.abs(e.clientY - dragStart.y);
        if (dx > 8 && dx > dy) setIsDragging(true);
      }}
      onPointerUp={(e) => {
        if (!dragStart) return;
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        const dt = Date.now() - dragStart.time;

        // Swipe
        if (isDragging && Math.abs(dx) > 40) {
          if (dx < 0) goNext();
          else goPrev();
        } else if (!isDragging && dt < 300) {
          // Tap — navigate based on position
          const tapX = e.clientX;
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = (tapX - rect.left) / rect.width;
          if (relX < 0.33) goPrev();
          else if (relX > 0.67) goNext();
        }

        setDragStart(null);
        setIsDragging(false);
      }}
    >
      {/* Image track */}
      <motion.div
        className="flex h-full"
        animate={{ x: `-${idx * 100}%` }}
        transition={{ type: "spring", stiffness: 400, damping: 40, mass: 0.5 }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        onDragEnd={(e, info) => {
          if (info.offset.x < -50 || info.velocity.x < -300) goNext();
          else if (info.offset.x > 50 || info.velocity.x > 300) goPrev();
        }}
      >
        {photos.map((src, i) => (
          <div key={i} className="h-full w-full shrink-0">
            <img src={src} alt="" loading="lazy" className="h-full w-full object-cover pointer-events-none" draggable={false} />
          </div>
        ))}
      </motion.div>

      {/* Heart burst on double-tap */}
      <HeartBurst show={showHeart} />

      {/* Page dots */}
      <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
        {photos.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full bg-white transition-all duration-200 ${i === idx ? "w-2 opacity-100" : "w-1.5 opacity-40"}`}
          />
        ))}
      </div>

      {/* Count badge */}
      <div className="absolute right-2 top-2 z-10 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
        {idx + 1}/{photos.length}
      </div>

      {/* Desktop arrow buttons */}
      {idx > 0 && (
        <button
          onClick={goPrev}
          className="absolute left-1 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60 sm:flex"
        >
          ‹
        </button>
      )}
      {idx < photos.length - 1 && (
        <button
          onClick={goNext}
          className="absolute right-1 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60 sm:flex"
        >
          ›
        </button>
      )}
    </div>
  );
}

function HeartBurst({ show }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1.2, opacity: 1 }}
          exit={{ scale: 1.4, opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <Heart className="h-20 w-20 drop-shadow-lg" style={{ fill: "#E60012", color: "#E60012" }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}