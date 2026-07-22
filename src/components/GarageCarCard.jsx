import React from "react";
import { Link } from "react-router-dom";
import { Instagram, Gauge, Flag } from "lucide-react";
import GaragePhotoCarousel from "@/components/garage/GaragePhotoCarousel";

export default function GarageCarCard({ car }) {
  const hasPhotos = car.photos && car.photos.length > 0;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative aspect-video bg-secondary">
        {hasPhotos ? (
          <GaragePhotoCarousel photos={car.photos} alt={car.model} />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">No photo</div>
        )}
        {car.is_featured && (
          <span className="absolute left-2 top-2 z-10 rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold text-white">FEATURED BUILD</span>
        )}
      </div>
      <Link to={car.id ? `/garage/${car.id}` : "/garage"} className="block p-4" onClick={(e) => { if (!car.id) e.preventDefault(); }}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold">{car.model}</h3>
            <div className="mt-0.5 flex flex-wrap gap-1.5">
              {car.chassis_code && <span className="font-mono text-xs text-primary">{car.chassis_code}</span>}
              {car.engine_code && <span className="font-mono text-xs text-primary">{car.engine_code}</span>}
              {car.year && <span className="text-xs text-muted-foreground">{car.year}</span>}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {car.engine_family && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">{car.engine_family} Series</span>}
              {car.induction_type && <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">{car.induction_type === "fi" ? "FI" : "NA"}</span>}
            </div>
          </div>
          {car.dyno_kw && (
            <div className="text-right">
              <div className="text-lg font-black text-primary">{car.dyno_kw}kW</div>
              <div className="text-[10px] text-muted-foreground">dyno</div>
            </div>
          )}
        </div>
        {car.modifications && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{car.modifications}</p>}
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          {car.gearbox && <span className="inline-flex items-center gap-1"><Gauge className="h-3 w-3" /> {car.gearbox}</span>}
          {car.track_time && (
            <span className="inline-flex items-center gap-1">
              <Flag className="h-3 w-3" /> {car.track_time}
              {car.track_name && <span className="text-muted-foreground">· {car.track_name}</span>}
              {car.time_verified === "pending" && <span className="rounded bg-amber-500/15 px-1 text-[9px] font-bold text-amber-500">PENDING</span>}
              {car.time_verified === "verified" && <span className="rounded bg-green-500/15 px-1 text-[9px] font-bold text-green-500">VERIFIED</span>}
            </span>
          )}
          {car.instagram && <span className="inline-flex items-center gap-1 text-pink-400"><Instagram className="h-3 w-3" /> {car.instagram}</span>}
        </div>
      </Link>
    </div>
  );
}