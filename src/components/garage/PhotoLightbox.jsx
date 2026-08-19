import React from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Fullscreen photo viewer. Swipe left/right to move between photos,
 * swipe down to dismiss. Keyboard arrows + Esc supported on desktop.
 */
export default function PhotoLightbox({ photos, index, onClose, onIndex }) {
  const touch = React.useRef(null);
  const clamp = (i) => Math.max(0, Math.min(photos.length - 1, i));
  const go = (n) => onIndex(clamp(index + n));

  const onTouchStart = (e) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx < -50) go(1);
      else if (dx > 50) go(-1);
    } else if (dy > 80) {
      onClose();
    }
    touch.current = null;
  };

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index]);

  return (
    <div
      className="fixed inset-0 z-[100] flex touch-none items-center justify-center bg-black/95"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <img src={photos[index]} alt="" draggable={false} className="max-h-full max-w-full object-contain" />

      <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white backdrop-blur transition hover:bg-white/20">
        <X className="h-5 w-5" />
      </button>

      {photos.length > 1 && (
        <>
          <button onClick={() => go(-1)} className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white backdrop-blur transition hover:bg-white/20">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button onClick={() => go(1)} className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white backdrop-blur transition hover:bg-white/20">
            <ChevronRight className="h-6 w-6" />
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white backdrop-blur">
            {index + 1} / {photos.length}
          </div>
        </>
      )}
    </div>
  );
}