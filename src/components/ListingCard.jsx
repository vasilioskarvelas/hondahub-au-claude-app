import React from "react";
import { Link } from "react-router-dom";
import { MapPin, BadgeCheck, Zap, Repeat } from "lucide-react";

export default function ListingCard({ listing }) {
  const photo = listing.photos && listing.photos[0];
  return (
    <Link
      to={`/listing/${listing.id}`}
      className="group block overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary/50"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        {photo ? (
          <>
            <div className="absolute inset-0 carbon-bg" />
            <div className="absolute inset-0 bg-gradient-to-br from-background via-secondary to-background" />
            <img src={photo} alt={listing.title} className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-105" style={{ padding: "8px", objectFit: "contain" }} />
            <div className="absolute bottom-1 right-1 rounded bg-black/50 px-1 py-0.5 text-[7px] font-bold text-white/70 backdrop-blur">HondaHub</div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center carbon-bg text-muted-foreground">No photo</div>
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {listing.selling_format === "auction" && (
            <span className="rounded-md bg-purple-600 px-2 py-0.5 text-[10px] font-bold text-white">AUCTION</span>
          )}
          {listing.urgent && (
            <span className="rounded-md bg-destructive px-2 py-0.5 text-[10px] font-bold text-white">URGENT</span>
          )}
          {listing.featured && (
            <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold text-white">FEATURED</span>
          )}
          {listing.status === "sold" && (
            <span className="rounded-md bg-foreground px-2 py-0.5 text-[10px] font-bold text-background">SOLD</span>
          )}
        </div>
        <div className="absolute right-2 top-2">
          <span className="rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase text-white backdrop-blur">
            {listing.type}
          </span>
        </div>
      </div>
      <div className="p-3">
        <h3 className="line-clamp-1 text-sm font-semibold">{listing.title}</h3>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          {(listing.chassis_code || listing.engine_code) && (
            <span className="font-mono text-primary">{listing.chassis_code || listing.engine_code}</span>
          )}
          {listing.swap_accepted && (
            <span className="inline-flex items-center gap-0.5 text-amber-400">
              <Repeat className="h-3 w-3" /> Swap
            </span>
          )}
          {listing.is_turbo && (
            <span className="inline-flex items-center gap-0.5 text-sky-400">
              <Zap className="h-3 w-3" /> Turbo
            </span>
          )}
        </div>
        <div className="mt-2 flex items-end justify-between">
          <span className="text-lg font-black text-primary">
            {listing.selling_format === "auction" ? (
              <span><span className="text-[10px] font-medium text-muted-foreground">BID </span>${(listing.current_highest_bid || listing.price)?.toLocaleString()}</span>
            ) : (
              "$" + (listing.price?.toLocaleString() || "0")
            )}
          </span>
          <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" /> {listing.state}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
          {listing.seller_verified && <BadgeCheck className="h-3.5 w-3.5 text-primary" />}
          <span className="line-clamp-1">{listing.seller_name || "Private seller"}</span>
          {listing.seller_rating && (
            <span className="ml-auto text-amber-400">★ {listing.seller_rating?.toFixed(1)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}