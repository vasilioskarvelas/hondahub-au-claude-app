import React from "react";
import { base44 } from "@/api/base44Client";
import { Camera, Trash2, Loader2 } from "lucide-react";

/**
 * ProfileAvatarEditor — an all-in-one avatar control rendered in place of the
 * profile header avatar while editing. Combines upload, drag-to-reposition,
 * and remove into the single circular avatar (no separate edit sections).
 */
function parsePosition(p) {
  if (!p) return { x: 50, y: 50 };
  const parts = p.split(/\s+/).map((v) => parseFloat(v));
  return { x: isNaN(parts[0]) ? 50 : parts[0], y: isNaN(parts[1]) ? 50 : parts[1] };
}

export default function ProfileAvatarEditor({ avatarUrl, position, name, onUpdated, onCleared, onPositionChange }) {
  const [url, setUrl] = React.useState(avatarUrl || null);
  const [busy, setBusy] = React.useState(false);
  const [pos, setPos] = React.useState(() => parsePosition(position));
  const inputRef = React.useRef(null);
  const containerRef = React.useRef(null);
  const dragRef = React.useRef(null);

  React.useEffect(() => { setUrl(avatarUrl || null); }, [avatarUrl]);
  React.useEffect(() => { setPos(parsePosition(position)); }, [position]);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const up = await base44.integrations.Core.UploadFile({ file });
      const created = await base44.functions.invoke("media", {
        action: "create",
        file_url: up.file_url,
        media_type: file.type?.startsWith("video/") ? "video" : "image",
        mime_type: file.type,
        source: "user",
      });
      const media = created.data?.media;
      if (media) {
        setUrl(media.file_url);
        onUpdated?.(media.id, media.file_url);
      }
    } catch (err) {
      console.error("avatar upload failed", err);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleClear = () => {
    setUrl(null);
    onCleared?.();
  };

  const handlePointerDown = (e) => {
    if (!url) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPos: { ...pos } };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };
  const handlePointerMove = (e) => {
    if (!dragRef.current || !containerRef.current || !url) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragRef.current.startX) / rect.width) * 100;
    const dy = ((e.clientY - dragRef.current.startY) / rect.height) * 100;
    const newX = Math.max(0, Math.min(100, dragRef.current.startPos.x - dx));
    const newY = Math.max(0, Math.min(100, dragRef.current.startPos.y - dy));
    setPos({ x: newX, y: newY });
    onPositionChange?.(`${Math.round(newX)}% ${Math.round(newY)}%`);
  };
  const handlePointerUp = () => { dragRef.current = null; };

  const initial = (name || "?").charAt(0).toUpperCase();

  return (
    <div className="relative shrink-0">
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`relative h-20 w-20 overflow-hidden rounded-full border-4 border-card bg-secondary ${url ? "cursor-grab touch-none select-none active:cursor-grabbing" : ""}`}
      >
        {busy ? (
          <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : url ? (
          <img src={url} alt={name} draggable={false} className="pointer-events-none h-full w-full object-cover" style={{ objectPosition: `${pos.x}% ${pos.y}%` }} />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-primary text-2xl font-black text-primary-foreground">{initial}</div>
        )}
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground disabled:opacity-50"
        aria-label="Change avatar"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
      </button>

      {url && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-secondary text-muted-foreground hover:text-destructive"
          aria-label="Remove avatar"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}

      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
    </div>
  );
}