import React from "react";
import { base44 } from "@/api/base44Client";
import { Video, X, Loader2 } from "lucide-react";

// ADR-045 — minimal video uploader. Stores URLs in a `video_urls` array; any
// non-empty array satisfies the Quality Score's Video component (20 pts).
export default function VideoUploader({ videos, setVideos }) {
  const [uploading, setUploading] = React.useState(false);

  const handleFiles = async (files) => {
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 1)) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        setVideos((v) => [...v, file_url]);
      }
    } finally {
      setUploading(false);
    }
  };

  const remove = (i) => setVideos((v) => v.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {videos.length === 0 ? (
        <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border bg-secondary/50 hover:border-primary">
          {uploading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Video className="h-5 w-5 text-primary" />}
          <span className="text-xs font-semibold">Add a video</span>
          <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files.length && handleFiles(e.target.files)} disabled={uploading} />
        </label>
      ) : (
        <div className="space-y-2">
          {videos.map((v, i) => (
            <div key={v} className="relative overflow-hidden rounded-xl bg-secondary">
              <video src={v} className="h-32 w-full object-cover" controls />
              <button onClick={() => remove(i)} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white"><X className="h-3 w-3" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}