import React from "react";
import PhotoUploader from "@/components/listing/PhotoUploader";

export default function PhotosStep({ f, setPhotos }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black tracking-tight">Photos</h2>
        <p className="text-sm text-muted-foreground">Add up to 10 photos. The first photo is the cover.</p>
      </div>
      <PhotoUploader photos={f.photo_urls} setPhotos={setPhotos} />
    </div>
  );
}