import React from "react";
import { Tag, MapPin, CheckCircle2, Loader2 } from "lucide-react";
import QualityScore from "@/components/marketplace/QualityScore";
import { CATEGORY_LABEL, CONDITIONS } from "./constants";

function priceDisplay(f) {
  if (f.price_type === "free") return "Free";
  if (f.price_type === "poa" || f.price === "") return "Price on ask";
  return `$${Number(f.price).toLocaleString()}${f.price_type === "negotiable" ? " negotiable" : ""}`;
}

function detailRows(f) {
  const rows = [];
  if (f.brand) rows.push(["Brand", f.brand]);
  if (f.oem_or_aftermarket) rows.push(["OEM/Aftermarket", f.oem_or_aftermarket.replace(/_/g, " ")]);
  if (f.wheel_diameter_inches) rows.push(["Diameter", `${f.wheel_diameter_inches} in`]);
  if (f.wheel_pcd) rows.push(["PCD", f.wheel_pcd]);
  if (f.component_kilometres != null && f.component_kilometres !== "") rows.push(["Component km", Number(f.component_kilometres).toLocaleString()]);
  if (f.tested_before_listing) rows.push(["Tested", f.tested_before_listing.replace(/_/g, " ")]);
  if (f.lock_status) rows.push(["Lock status", f.lock_status.replace(/_/g, " ")]);
  if (f.tuned) rows.push(["Tuned", "Yes"]);
  return rows;
}

export default function ReviewStep({ f, vehicles, quality, busy, onPublish }) {
  const vehicle = f.flow === "vehicle" ? vehicles.find((v) => v.id === f.primary_vehicle_id) : null;
  const rows = detailRows(f);
  const conditionLabel = CONDITIONS.find((c) => c.v === f.condition)?.l || f.condition;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black tracking-tight">Preview & publish</h2>
        <p className="text-sm text-muted-foreground">Review your listing before it goes live.</p>
      </div>

      <QualityScore score={quality.score} checklist={quality.checklist} />

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {f.photo_urls?.length > 0 ? (
          <div className="grid grid-cols-3 gap-0.5 bg-border">
            {f.photo_urls.slice(0, 6).map((u, i) => (
              <div key={i} className="aspect-square bg-secondary"><img src={u} alt="" className="h-full w-full object-cover" /></div>
            ))}
          </div>
        ) : (
          <div className="flex aspect-video items-center justify-center bg-secondary"><Tag className="h-8 w-8 text-muted-foreground" /></div>
        )}
        {f.video_urls?.map((u, i) => <video key={`v${i}`} src={u} controls className="w-full bg-black" />)}
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${f.listing_type === "wanted" ? "bg-blue-500/15 text-blue-400" : "bg-primary/15 text-primary"}`}>{f.listing_type === "wanted" ? "Wanted" : "For sale"}</span>
          <span className="text-xs font-bold text-muted-foreground">{CATEGORY_LABEL[f.category] || f.category}</span>
        </div>
        <h3 className="text-lg font-black tracking-tight">{f.title || "Untitled listing"}</h3>
        <div className="text-lg font-black">{priceDisplay(f)}</div>
        {f.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{f.description}</p>}

        {vehicle && (
          <div className="rounded-xl bg-secondary/40 p-3 text-xs">
            <p className="font-bold">{vehicle.year} {vehicle.make} {vehicle.model}{vehicle.chassis_code ? ` (${vehicle.chassis_code})` : ""}</p>
            <p className="text-muted-foreground">
              {vehicle.odometer_km != null ? `${vehicle.odometer_km.toLocaleString()} km` : ""}
              {vehicle.engine_code ? ` · ${vehicle.engine_code}` : ""}
              {vehicle.transmission ? ` · ${vehicle.transmission}` : ""}
            </p>
          </div>
        )}

        {f.flow === "part" && (f.compatible_make || f.compatible_model || f.compatible_chassis_code) && (
          <p className="text-xs text-muted-foreground">
            <span className="font-bold">Fits:</span> {f.compatible_make || "Honda"} {f.compatible_model || ""} {f.compatible_chassis_code || ""}
            {f.compatible_year_from ? ` (${f.compatible_year_from}${f.compatible_year_to ? `–${f.compatible_year_to}` : "+"})` : ""}
          </p>
        )}

        {rows.length > 0 && (
          <dl className="grid grid-cols-2 gap-1.5">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between rounded-lg bg-secondary/40 px-2.5 py-1.5 text-xs">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-bold capitalize">{v}</dd>
              </div>
            ))}
          </dl>
        )}

        {f.additional_specifications?.length > 0 && (
          <dl className="grid grid-cols-2 gap-1.5">
            {f.additional_specifications.map((s, i) => (
              <div key={i} className="flex justify-between rounded-lg bg-secondary/40 px-2.5 py-1.5 text-xs">
                <dt className="text-muted-foreground">{s.label}</dt>
                <dd className="font-bold">{s.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="flex flex-wrap gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
          <span className="font-bold capitalize">{conditionLabel}</span>
          {f.quantity > 1 && <span>Qty {f.quantity}</span>}
          {f.location_general && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {f.location_general}</span>}
          {f.shipping_available && <span>Ships</span>}
          {f.pickup_available !== false && <span>Pickup</span>}
        </div>
      </div>

      <button
        disabled={!!busy}
        onClick={onPublish}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground glow-red disabled:opacity-50"
      >
        {busy === "publish" ? <><Loader2 className="h-4 w-4 animate-spin" /> Publishing…</> : <><CheckCircle2 className="h-4 w-4" /> Publish listing</>}
      </button>
    </div>
  );
}