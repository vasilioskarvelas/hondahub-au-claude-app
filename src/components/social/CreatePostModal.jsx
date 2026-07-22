import React from "react";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import { getCurrentUser, setCurrentUser } from "@/lib/userIdentity";
import { useAuth } from "@/lib/AuthContext";
import { X, Image as ImageIcon, Video, Car, ChevronRight, ChevronLeft, Check, FileText, AlertTriangle } from "lucide-react";

const DRAFT_KEY = "hondahub_post_draft";
const MAX_PHOTOS = 10;
const MAX_CAPTION = 2200;

export default function CreatePostModal({ onClose, onSaved }) {
  const { user } = useAuth();
  const [name, setName] = React.useState(getCurrentUser());
  const [step, setStep] = React.useState("select");
  const [caption, setCaption] = React.useState(() => localStorage.getItem(DRAFT_KEY) || "");
  const [vehicleModel, setVehicleModel] = React.useState("");
  const [chassisCode, setChassisCode] = React.useState("");
  const [engineFamily, setEngineFamily] = React.useState("Other");
  const [location, setLocation] = React.useState("");
  const [photos, setPhotos] = React.useState([]);
  const [videoUrl, setVideoUrl] = React.useState(null);
  const [videoSize, setVideoSize] = React.useState(0);
  const [uploading, setUploading] = React.useState(false);
  const [showDetails, setShowDetails] = React.useState(false);

  React.useEffect(() => {
    if (user) {
      const displayName = user.full_name || user.email?.split("@")[0] || "";
      if (displayName) setName(displayName);
    }
  }, [user]);

  const handlePhotos = async (files) => {
    const remaining = MAX_PHOTOS - photos.length;
    const toUpload = Array.from(files).slice(0, remaining);
    setUploading(true);
    try {
      for (const file of toUpload) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        setPhotos((p) => [...p, file_url]);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleVideo = async (file) => {
    if (!file) return;
    setVideoSize(file.size);
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setVideoUrl(file_url);
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (i) => setPhotos((ps) => ps.filter((_, x) => x !== i));
  const movePhoto = (i, dir) => {
    setPhotos((ps) => {
      const arr = [...ps];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  };

  const submit = async () => {
    if (!caption.trim()) return;
    setStep("uploading");
    try {
      const n = name || "Anonymous";
      setCurrentUser(n);
      const hashtags = caption.match(/#\w+/g) || [];
      await base44.entities.CommunityPost.create({
        author_name: n,
        caption,
        photos,
        video_url: videoUrl,
        vehicle_model: vehicleModel,
        chassis_code: chassisCode,
        engine_family: engineFamily,
        likes: 0,
        shares: 0,
        hashtags,
        tags: hashtags.join(" "),
      });
      localStorage.removeItem(DRAFT_KEY);
      setStep("success");
      setTimeout(() => onSaved(), 1500);
    } catch {
      setStep("details");
    }
  };

  const canProceedSelect = photos.length > 0 || videoUrl || caption.trim();
  const canShare = caption.trim().length > 0;
  const videoSizeMB = (videoSize / (1024 * 1024)).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" onClick={step === "uploading" || step === "success" ? undefined : onClose}>
      <div className="mx-auto flex h-full w-full max-w-lg flex-col bg-background" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3" style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}>
          {step === "select" ? (
            <button onClick={onClose} className="text-foreground active:opacity-60"><X className="h-6 w-6" /></button>
          ) : step === "details" ? (
            <button onClick={() => setStep("select")} className="flex items-center text-foreground active:opacity-60">
              <ChevronLeft className="h-6 w-6" />
            </button>
          ) : (
            <div className="w-6" />
          )}
          <h2 className="text-base font-bold">
            {step === "select" ? "New Post" : step === "details" ? "Caption & Details" : step === "uploading" ? "Posting..." : "Posted!"}
          </h2>
          {step === "select" && (
            <button
              onClick={() => setStep("details")}
              disabled={!canProceedSelect}
              className="text-sm font-bold text-primary active:opacity-60 disabled:opacity-40"
            >
              Next
            </button>
          )}
          {step === "details" && (
            <button
              onClick={submit}
              disabled={!canShare}
              className="text-sm font-bold text-primary active:opacity-60 disabled:opacity-40"
            >
              Share
            </button>
          )}
          {step !== "select" && step !== "details" && <div className="w-6" />}
        </div>

        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {step === "select" && (
              <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col">
                {/* Media preview */}
                {photos.length > 0 || videoUrl ? (
                  <div className="relative">
                    {videoUrl ? (
                      <video src={videoUrl} className="aspect-square w-full object-cover" muted playsInline />
                    ) : (
                      <img src={photos[0]} alt="" className="aspect-square w-full object-cover" />
                    )}
                    {photos.length > 0 && (
                      <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">Cover</span>
                    )}
                    {videoUrl && (
                      <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">VIDEO</span>
                    )}
                  </div>
                ) : (
                  <div className="flex aspect-square w-full flex-col items-center justify-center bg-secondary">
                    <ImageIcon className="h-12 w-12 text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">Select photos or a video</p>
                  </div>
                )}

                {/* Thumbnail strip with reorder */}
                {photos.length > 0 && (
                  <div className="flex gap-1.5 overflow-x-auto p-3 scrollbar-hide">
                    {photos.map((p, i) => (
                      <div key={i} className="relative h-16 w-16 shrink-0">
                        <img src={p} alt="" className="h-full w-full rounded-lg object-cover" />
                        {i === 0 && <span className="absolute bottom-0 left-0 rounded-tr-md bg-primary px-1 text-[8px] font-bold text-white">1st</span>}
                        <div className="absolute right-0 top-0 flex flex-col">
                          <button onClick={() => movePhoto(i, -1)} disabled={i === 0} className="bg-black/60 px-0.5 text-white disabled:opacity-30">‹</button>
                          <button onClick={() => movePhoto(i, 1)} disabled={i === photos.length - 1} className="bg-black/60 px-0.5 text-white disabled:opacity-30">›</button>
                        </div>
                        <button onClick={() => removePhoto(i)} className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-white shadow-lg">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload buttons */}
                {uploading ? (
                  <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-secondary border-t-primary" /> Uploading...
                  </div>
                ) : (
                  <div className="flex gap-2 p-3">
                    <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-secondary py-3 text-sm font-semibold active:opacity-70">
                      <ImageIcon className="h-5 w-5 text-primary" /> Photos ({photos.length}/{MAX_PHOTOS})
                      <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files.length && handlePhotos(e.target.files)} />
                    </label>
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold active:opacity-70">
                      <Video className="h-5 w-5 text-muted-foreground" /> Video
                      <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files[0] && handleVideo(e.target.files[0])} />
                    </label>
                  </div>
                )}

                {videoUrl && videoSize > 50 * 1024 * 1024 && (
                  <div className="mx-3 mb-3 flex items-center gap-2 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> Large video ({videoSizeMB}MB) — may take longer to upload
                  </div>
                )}
                {videoUrl && (
                  <button onClick={() => { setVideoUrl(null); setVideoSize(0); }} className="mx-3 mb-3 text-xs font-bold text-destructive">
                    Remove video
                  </button>
                )}

                {/* Text-only option */}
                {photos.length === 0 && !videoUrl && (
                  <button onClick={() => setStep("details")} className="mx-3 mb-3 flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm font-semibold text-muted-foreground active:opacity-70">
                    <FileText className="h-4 w-4" /> Or post text only
                  </button>
                )}
              </motion.div>
            )}

            {step === "details" && (
              <motion.div key="details" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col">
                {/* Media preview thumb */}
                {(photos.length > 0 || videoUrl) && (
                  <div className="flex gap-2 p-3">
                    {videoUrl && <video src={videoUrl} className="h-16 w-16 rounded-lg object-cover" muted />}
                    {photos.slice(0, 4).map((p, i) => (
                      <img key={i} src={p} alt="" className="h-16 w-16 rounded-lg object-cover" />
                    ))}
                  </div>
                )}

                {/* Caption */}
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value.slice(0, MAX_CAPTION))}
                  autoFocus
                  placeholder="Write a caption..."
                  className="w-full resize-none bg-transparent p-4 text-sm outline-none placeholder:text-muted-foreground"
                  style={{ minHeight: "120px" }}
                />
                <div className="px-4 pb-2 text-right text-xs text-muted-foreground">{caption.length}/{MAX_CAPTION}</div>

                {/* Name */}
                {!user && (
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name *"
                    className="border-t border-border bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
                  />
                )}

                {/* Location */}
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Add location"
                  className="border-t border-border bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
                />

                {/* Hashtag suggestions */}
                {caption.match(/#\w+/g) && (
                  <div className="flex gap-1.5 overflow-x-auto border-t border-border px-4 py-2 scrollbar-hide">
                    {caption.match(/#\w+/g).map((tag, i) => (
                      <span key={i} className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{tag}</span>
                    ))}
                  </div>
                )}

                {/* Vehicle details */}
                <button
                  onClick={() => setShowDetails((s) => !s)}
                  className="flex w-full items-center justify-between border-t border-border px-4 py-3 text-sm font-semibold text-muted-foreground active:bg-secondary"
                >
                  <span className="flex items-center gap-2"><Car className="h-4 w-4" /> Vehicle details</span>
                  <ChevronRight className={`h-4 w-4 transition-transform ${showDetails ? "rotate-90" : ""}`} />
                </button>
                <AnimatePresence>
                  {showDetails && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="grid grid-cols-2 gap-3 px-4 py-3">
                        <input value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} placeholder="Vehicle model" className="rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm outline-none focus:border-primary" />
                        <input value={chassisCode} onChange={(e) => setChassisCode(e.target.value)} placeholder="Chassis code" className="rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm outline-none focus:border-primary" />
                      </div>
                      <div className="px-4 pb-3">
                        <div className="flex flex-wrap gap-2">
                          {["K", "B", "D", "H", "F", "Other"].map((f) => (
                            <button key={f} onClick={() => setEngineFamily(f)} className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${engineFamily === f ? "bg-primary text-primary-foreground" : "border border-border bg-secondary text-muted-foreground"}`}>{f}-Club</button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="h-4" />
              </motion.div>
            )}

            {step === "uploading" && (
              <motion.div key="uploading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full flex-col items-center justify-center gap-4">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-secondary border-t-primary" />
                <p className="text-sm font-semibold text-muted-foreground">Posting...</p>
                <div className="h-1 w-48 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
                </div>
              </motion.div>
            )}

            {step === "success" && (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex h-full flex-col items-center justify-center gap-3">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }} className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500">
                  <Check className="h-8 w-8 text-white" strokeWidth={3} />
                </motion.div>
                <p className="text-lg font-bold">Posted!</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}