import React from "react";
import { base44 } from "@/api/base44Client";
import { ImagePlus, Trash2, Loader2 } from "lucide-react";

/**
 * EventCoverUploader — uploads a 16:9 cover photo for an event via the
 * MediaService pipeline (UploadFile → media.create) and returns the media_id.
 */
export default function EventCoverUploader({ mediaId, fileUrl, onChange }) {
  const [busy, setBusy] = React.useState(false);
  const [preview, setPreview] = React.useState(fileUrl || null);
  const inputRef = React.useRef(null);

  React.useEffect(() => { setPreview(fileUrl || null); }, [fileUrl]);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const up = await base44.integrations.Core.UploadFile({ file });
      const created = await base44.functions.invoke("media", {
        action: "create",
        file_url: up.file_url,
        media_type: "image",
        mime_type: file.type,
        source: "event",
      });
      const media = created.data?.media;
      if (media) {
        setPreview(media.file_url);
        onChange?.(media.id, media.file_url);
      }
    } catch (err) {
      console.error("cover upload failed", err);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleClear = () => {
    setPreview(null);
    onChange?.(null, null);
  };

  return (
    <div>
      <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Cover Photo (optional)</label>
      <div className="mt-1 overflow-hidden rounded-xl border border-border bg-secondary">
        {busy ? (
          <div className="flex aspect-video items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : preview ? (
          <div className="relative aspect-video">
            <img src={preview} alt="Event cover" className="h-full w-full object-cover" />
            <div className="absolute bottom-2 right-2 flex gap-2">
              <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/80 px-3 py-1.5 text-xs font-medium backdrop-blur">
                <ImagePlus className="h-3.5 w-3.5" /> Change
              </button>
              <button type="button" onClick={handleClear} className="inline-flex items-center rounded-lg border border-border bg-background/80 px-2 py-1.5 text-xs text-muted-foreground backdrop-blur hover:text-foreground">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => inputRef.current?.click()} className="flex aspect-video w-full flex-col items-center justify-center gap-2 text-muted-foreground transition hover:text-primary">
            <ImagePlus className="h-8 w-8" />
            <span className="text-xs font-medium">Upload cover photo</span>
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
    </div>
  );
}