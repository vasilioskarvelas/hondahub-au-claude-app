import React from "react";
import { Move } from "lucide-react";

/**
 * AvatarReposition — lets the user drag their avatar image within a circular
 * frame to control which part is centered. Stores the result as a CSS
 * object-position string (e.g. "50% 30%") via onPositionChange.
 */
function parsePosition(p) {
  if (!p) return { x: 50, y: 50 };
  const parts = p.split(/\s+/).map((v) => parseFloat(v));
  return { x: isNaN(parts[0]) ? 50 : parts[0], y: isNaN(parts[1]) ? 50 : parts[1] };
}

export default function AvatarReposition({ src, position = "50% 50%", onPositionChange }) {
  const [pos, setPos] = React.useState(() => parsePosition(position));
  const containerRef = React.useRef(null);
  const dragRef = React.useRef(null);

  React.useEffect(() => {
    setPos(parsePosition(position));
  }, [position]);

  const handlePointerDown = (e) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPos: { ...pos } };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const deltaX = e.clientX - dragRef.current.startX;
    const deltaY = e.clientY - dragRef.current.startY;
    // Convert pixel delta to percentage of container size.
    const dx = (deltaX / rect.width) * 100;
    const dy = (deltaY / rect.height) * 100;
    // Drag right → image moves right → see more of the left → position-x decreases.
    const newX = Math.max(0, Math.min(100, dragRef.current.startPos.x - dx));
    const newY = Math.max(0, Math.min(100, dragRef.current.startPos.y - dy));
    setPos({ x: newX, y: newY });
    onPositionChange?.(`${Math.round(newX)}% ${Math.round(newY)}%`);
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  if (!src) return null;

  return (
    <div className="flex items-center gap-3">
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative h-20 w-20 shrink-0 cursor-grab touch-none select-none overflow-hidden rounded-full border border-border bg-secondary active:cursor-grabbing"
      >
        <img
          src={src}
          alt="Reposition avatar"
          draggable={false}
          className="h-full w-full object-cover pointer-events-none"
          style={{ objectPosition: `${pos.x}% ${pos.y}%` }}
        />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
          <Move className="h-3 w-3" /> Position
        </span>
        <span className="text-[11px] text-muted-foreground">Drag to recenter</span>
        <button
          type="button"
          onClick={() => { setPos({ x: 50, y: 50 }); onPositionChange?.("50% 50%"); }}
          className="mt-1 w-fit rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          Reset
        </button>
      </div>
    </div>
  );
}