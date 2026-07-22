import React from "react";
import { base44 } from "@/api/base44Client";
import { ImagePlus, Trash2, Loader2 } from "lucide-react";

/**
 * MediaField (Phase 02) — resolves a media_id pointer into its file_url and
 * lets the owner upload a replacement via the MediaService pipeline:
 *   UploadFile → MediaService.create → onUpdated(media_id, file_url).
 *
 * The parent persists the returned media_id on the owning entity (e.g.
 * User.avatar_media_id) via its own update path.
 */
export default function MediaField({
  label,
  mediaId,
  kind = "avatar",
  source = "user",
  onUpdated,
  onCleared,
}) {
  const [fileUrl, setFileUrl] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef(null);

  const resolve = React.useCallback(async (id) => {
    if (!id) { setFileUrl(null); setLoading(false); return; }
    try {
      const res = await base44.functions.invoke("media", { action: "get", media_id: id });
      setFileUrl(res.data?.media?.file_url || null);
    } catch {
      setFileUrl(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    setLoading(Boolean(mediaId));
    resolve(mediaId);
  }, [mediaId, resolve]);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !onUpdated) return;
    setBusy(true);
    try {
      const up = await base44.integrations.Core.UploadFile({ file });
      const file_url = up.file_url;
      const created = await base44.functions.invoke("media", {
        action: "create",
        file_url,
        media_type: file.type?.startsWith("video/") ? "video" : "image",
        mime_type: file.type,
        source,
      });
      const media = created.data?.media;
      if (media) {
        setFileUrl(media.file_url);
        onUpdated(media.id, media.file_url);
      }
    } catch (err) {
      console.error("media upload failed", err);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleClear = async () => {
    setFileUrl(null);
    if (onCleared) onCleared();
  };

  const isAvatar = kind === "avatar";

  return (
    <div className="flex items-center gap-3">
      <div
        className={
          isAvatar
            ? "relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary"
            : "relative h-16 w-28 shrink-0 overflow-hidden rounded-xl border border-border bg-secondary"
        }
      >
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : fileUrl ? (
          <img src={fileUrl} alt={label} className="h-full w-full object-cover" />
        ) : (
          <ImagePlus className="h-5 w-5 text-muted-foreground/50" />
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy || !onUpdated}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
            {fileUrl ? "Change" : "Upload"}
          </button>
          {fileUrl && onCleared && (
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={isAvatar ? "image/*" : "image/*"}
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
}