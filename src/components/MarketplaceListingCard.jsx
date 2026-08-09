import React from "react";
import { Link } from "react-router-dom";
import { Package } from "lucide-react";

const CATEGORY_LABELS = {
  vehicle: "Vehicle", engine: "Engine", transmission: "Transmission", forced_induction: "Forced Induction",
  wheels_tyres: "Wheels & Tyres", suspension: "Suspension", brakes: "Brakes", electronics: "Electronics",
  interior: "Interior", exterior: "Exterior", performance_part: "Performance Part", tools_equipment: "Tools", other: "Other",
};

function priceLabel(l) {
  if (l.price_type === "free") return "Free";
  if (l.price_type === "poa" || l.price_cents == null) return "POA";
  return `$${(l.price_cents / 100).toLocaleString()}`;
}

export default function MarketplaceListingCard({ listing: l }) {
  return (
    <Link to={`/marketplace/${l.id}`} className="group overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary">
      <div className="aspect-video bg-secondary">
        {l.photo_urls?.[0] ? <img src={l.photo_urls[0]} alt={l.title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Package className="h-8 w-8 text-muted-foreground" /></div>}
      </div>
      <div className="p-3">
        <div className="flex items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${l.listing_type === "wanted" ? "bg-blue-500/15 text-blue-400" : "bg-primary/15 text-primary"}`}>{l.listing_type === "wanted" ? "Wanted" : "For sale"}</span>
          <span className="text-[10px] font-bold uppercase text-muted-foreground">{CATEGORY_LABELS[l.category] || l.category}</span>
          {l.shipping_available && <span className="text-[10px] text-muted-foreground">· ships</span>}
        </div>
        <h3 className="mt-1.5 line-clamp-1 text-sm font-bold">{l.title}</h3>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-sm font-black">{priceLabel(l)}</span>
          <span className="truncate text-xs text-muted-foreground">{l.location_general || ""}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">by {l.poster_name}</p>
      </div>
    </Link>
  );
}