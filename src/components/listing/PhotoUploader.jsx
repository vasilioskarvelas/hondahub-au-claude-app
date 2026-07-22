import React from "react";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import { X, ImagePlus, Loader2, GripVertical } from "lucide-react";

export default function PhotoUploader({ photos, setPhotos }) {
  const [uploading, setUploading] = React.useState(false);

  const handleFiles = async (files) => {
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        setPhotos((p) => [...p, file_url]);
      }
    } finally {
      setUploading(false);
    }
  };

  const remove = (idx) => setPhotos((p) => p.filter((_, i) => i !== idx));

  return (
    <div className="space-y-3">
      {/* Upload dropzone — only visible when no photos or as a compact add tile */}
      <label className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed transition ${photos.length === 0 ? "h-44" : "h-auto py-3"} border-border bg-secondary/50 hover:border-primary hover:bg-secondary active:scale-[0.99]`}>
        {uploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        ) : (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <ImagePlus className="h-5 w-5 text-primary" />
            </div>
            {photos.length === 0 ? (
              <div className="text-center">
                <p className="text-sm font-semibold">Tap to upload photos</p>
                <p className="text-xs text-muted-foreground">Up to 10 photos</p>
              </div>
            ) : (
              <span className="text-xs font-semibold text-primary">Add more</span>
            )}
          </>
        )}
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files.length && handleFiles(e.target.files)}
          disabled={uploading}
        />
      </label>

      {/* Photo grid — Instagram-style */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <AnimatePresence>
            {photos.map((p, i) => (
              <motion.div
                key={p}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                className="group relative aspect-square overflow-hidden rounded-xl bg-secondary"
              >
                <img src={p} alt="" className="h-full w-full object-cover" />
                {/* Cover badge */}
                {i === 0 && (
                  <span className="absolute bottom-1 left-1 rounded-md bg-primary px-1.5 py-0.5 text-[8px] font-bold text-white">
                    COVER
                  </span>
                )}
                {/* Delete */}
                <button
                  onClick={() => remove(i)}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white opacity-100 backdrop-blur-sm transition group-hover:scale-110 active:scale-90 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}