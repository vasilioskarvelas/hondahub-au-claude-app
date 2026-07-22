import React from "react";
import { MoreVertical, Pencil, AtSign, Link2, Trash2 } from "lucide-react";

export default function PostMenu({ isOwn, onEdit, onTag, onDelete, onCopyLink }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground active:scale-90 transition"
      >
        <MoreVertical className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
          {isOwn && (
            <MenuItem icon={Pencil} label="Edit Post" onClick={() => { setOpen(false); onEdit(); }} />
          )}
          {isOwn && (
            <MenuItem icon={AtSign} label="Tag Someone" onClick={() => { setOpen(false); onTag(); }} />
          )}
          <MenuItem icon={Link2} label="Copy Link" onClick={() => { setOpen(false); onCopyLink(); }} />
          {isOwn && (
            <MenuItem icon={Trash2} label="Delete Post" danger onClick={() => { setOpen(false); onDelete(); }} />
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium transition active:bg-secondary ${danger ? "text-destructive" : "text-foreground hover:bg-secondary"}`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}