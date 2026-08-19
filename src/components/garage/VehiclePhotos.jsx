import React from "react";
import { base44 } from "@/api/base44Client";
import { callGarage, resolveMediaUrl } from "@/lib/garage";
import { ImagePlus, X, Car } from "lucide-react";
import GaragePhotoCarousel from "@/components/garage/GaragePhotoCarousel";

/**
 * Displays a vehicle's photo gallery (multiple photos) and, for the owner,
 * lets them add/remove photos. Falls back to cover_media_id for legacy
 * vehicles that predate photo_media_ids.
 */
export default function VehiclePhotos({ vehicle, isOwner, onChanged }) {
  const [photos, setPhotos] = React.useState([]); // [id, url]
  const [uploading, setUploading] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    (async () => {
      const ids = vehicle?.photo_media_ids?.length
        ? vehicle.photo_media_ids
        : (vehicle?.cover_media_id ? [vehicle.cover_media_id] : []);
      const entries = await Promise.all(ids.map(async (id) => [id, await resolveMediaUrl(id)]));
      if (active) setPhotos(entries.filter(([, u]) => u));
    })();
    return () => { active = false; };
  }, [vehicle]);

  const addPhoto = async (file) => {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const mediaRes = await base44.functions.invoke("media", { action: "create", file_url, media_type: "image", source: "user" });
      const mediaId = mediaRes.data?.media?.id;
      if (mediaId) await callGarage("vehicle", { action: "addPhoto", vehicle_id: vehicle.id, media_id: mediaId });
      onChanged?.();
    } catch {
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async (mediaId) => {
    try {
      await callGarage("vehicle", { action: "removePhoto", vehicle_id: vehicle.id, media_id: mediaId });
      onChanged?.();
    } catch {}
  };

  const urls = photos.map(([, u]) => u);

  return (
    <>
      <div className="relative">
        {urls.length > 0 ? (
          <GaragePhotoCarousel photos={urls} alt={vehicle?.nickname || "build"} />
        ) : (
          <div className="flex h-40 items-center justify-center carbon-bg">
            <Car className="h-8 w-8 text-muted-foreground/40" />
          </div>
        )}
        {isOwner && (
          <label className="absolute bottom-3 right-3 inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border bg-card/80 px-2.5 py-1.5 text-xs font-medium backdrop-blur">
            <ImagePlus className="h-3.5 w-3.5" /> {uploading ? "Uploading…" : "Add Photo"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) addPhoto(f); }} />
          </label>
        )}
      </div>
      {isOwner && photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-t border-border p-3 scrollbar-hide">
          {photos.map(([id, url]) => (
            <div key={id} className="relative shrink-0">
              <img src={url} alt="" className="h-16 w-16 rounded-lg object-cover" />
              <button onClick={() => removePhoto(id)} className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground shadow">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}