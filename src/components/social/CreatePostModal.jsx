import React from "react";
import { X, Car } from "lucide-react";
import { base44 } from "@/api/base44Client";
import MediaField from "@/components/identity/MediaField";

export default function CreatePostModal({ open, onClose, onCreated }) {
  const [caption, setCaption] = React.useState("");
  const [mediaId, setMediaId] = React.useState(null);
  const [mediaUrl, setMediaUrl] = React.useState(null);
  const [vehicles, setVehicles] = React.useState([]);
  const [vehicleId, setVehicleId] = React.useState("");
  const [visibility, setVisibility] = React.useState("public");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (open) {
      base44.functions.invoke("vehicle", { action: "listMine" })
        .then((r) => setVehicles(r.data?.vehicles || []))
        .catch(() => setVehicles([]));
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      setCaption(""); setMediaId(null); setMediaUrl(null); setVehicleId(""); setVisibility("public"); setError(null);
    }
  }, [open]);

  const submit = async () => {
    if (!caption.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await base44.functions.invoke("social", {
        action: "createPost",
        caption: caption.trim(),
        media_id: mediaId || undefined,
        primary_vehicle_id: vehicleId || undefined,
        visibility,
      });
      if (res.data?.ok) {
        onCreated?.(res.data.post);
        onClose();
      } else {
        setError(res.data?.error || "Failed to create post");
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-t-2xl border border-border bg-card sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-base font-bold">Create Post</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary"><X className="h-5 w-5" /></button>
        </div>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
          {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Share your build, a find, or ask the community..."
            rows={4}
            maxLength={2000}
            className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm"
          />
          <MediaField
            label="Photo / Video (optional)"
            kind="media"
            source="user"
            mediaId={mediaId}
            onUpdated={(id, url) => { setMediaId(id); setMediaUrl(url); }}
            onCleared={() => { setMediaId(null); setMediaUrl(null); }}
          />
          {vehicles.length > 0 && (
            <div>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Car className="h-3.5 w-3.5" /> Link a vehicle (your garage)</span>
              <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                <option value="">No vehicle</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.nickname || `${v.year} ${v.make} ${v.model}`}{v.chassis_code ? ` · ${v.chassis_code}` : ""}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <span className="text-xs font-semibold text-muted-foreground">Visibility</span>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
              <option value="public">Public</option>
              <option value="followers">Followers</option>
              <option value="approved_connections">Approved connections</option>
              <option value="private">Private</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 border-t border-border p-4">
          <button onClick={submit} disabled={!caption.trim() || busy} className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
            {busy ? "Posting..." : "Post"}
          </button>
          <button onClick={onClose} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium">Cancel</button>
        </div>
      </div>
    </div>
  );
}