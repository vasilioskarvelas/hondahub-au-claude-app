import React from "react";
import { base44 } from "@/api/base44Client";
import { X, Car } from "lucide-react";

export default function EditPostModal({ post, onClose, onSaved }) {
  const [caption, setCaption] = React.useState(post.caption || "");
  const [vehicleModel, setVehicleModel] = React.useState(post.vehicle_model || "");
  const [chassisCode, setChassisCode] = React.useState(post.chassis_code || "");
  const [engineFamily, setEngineFamily] = React.useState(post.engine_family || "Other");
  const [saving, setSaving] = React.useState(false);

  const save = async () => {
    setSaving(true);
    const hashtags = caption.match(/#\w+/g) || [];
    const tagsStr = hashtags.join(" ");
    await base44.entities.CommunityPost.update(post.id, {
      caption,
      vehicle_model: vehicleModel,
      chassis_code: chassisCode,
      engine_family: engineFamily,
      hashtags,
      tags: tagsStr,
    });
    setSaving(false);
    onSaved({
      ...post,
      caption,
      vehicle_model: vehicleModel,
      chassis_code: chassisCode,
      engine_family: engineFamily,
      hashtags,
      tags: tagsStr,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-2xl border border-border bg-background sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3" style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}>
          <button onClick={onClose} className="text-primary active:opacity-60">
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-base font-bold">Edit Post</h2>
          <button onClick={save} disabled={saving || !caption.trim()} className="text-base font-bold text-primary active:opacity-60 disabled:opacity-40">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4 space-y-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={4}
            autoFocus
            placeholder="Write a caption... Use #hashtags and @mentions"
            className="w-full resize-none rounded-lg border border-border bg-secondary p-3 text-sm outline-none focus:border-primary"
          />

          <button
            onClick={() => {}}
            className="flex w-full items-center gap-2 text-sm font-semibold text-muted-foreground"
          >
            <Car className="h-4 w-4" /> Vehicle details
          </button>
          <div className="grid grid-cols-2 gap-3">
            <input
              value={vehicleModel}
              onChange={(e) => setVehicleModel(e.target.value)}
              placeholder="Vehicle model"
              className="rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <input
              value={chassisCode}
              onChange={(e) => setChassisCode(e.target.value)}
              placeholder="Chassis code"
              className="rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Engine Club</label>
            <div className="flex flex-wrap gap-2">
              {["K", "B", "D", "H", "F", "Other"].map((f) => (
                <button
                  key={f}
                  onClick={() => setEngineFamily(f)}
                  className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${engineFamily === f ? "bg-primary text-primary-foreground" : "border border-border bg-secondary text-muted-foreground"}`}
                >
                  {f}-Club
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}