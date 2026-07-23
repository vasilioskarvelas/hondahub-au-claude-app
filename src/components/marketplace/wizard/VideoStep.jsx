import React from "react";
import VideoUploader from "@/components/marketplace/VideoUploader";

export default function VideoStep({ f, setVideos }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black tracking-tight">Video</h2>
        <p className="text-sm text-muted-foreground">Optional — a short walkaround video boosts your listing.</p>
      </div>
      <VideoUploader videos={f.video_urls} setVideos={setVideos} />
    </div>
  );
}