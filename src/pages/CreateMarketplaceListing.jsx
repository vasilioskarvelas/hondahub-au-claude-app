import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Car } from "lucide-react";
import CategoryAttributesForm from "@/components/marketplace/CategoryAttributesForm";
import { applicableCategoryFields, DEFAULT_ATTRS, EMPTY_ATTRS } from "@/components/marketplace/categoryAttrs";

const CATEGORIES = [
  { v: "vehicle", l: "Vehicle" }, { v: "engine", l: "Engine" }, { v: "transmission", l: "Transmission" },
  { v: "forced_induction", l: "Forced Induction" }, { v: "wheels_tyres", l: "Wheels & Tyres" },
  { v: "suspension", l: "Suspension" }, { v: "brakes", l: "Brakes" }, { v: "electronics", l: "Electronics" },
  { v: "interior", l: "Interior" }, { v: "exterior", l: "Exterior" }, { v: "performance_part", l: "Performance Part" },
  { v: "tools_equipment", l: "Tools & Equipment" }, { v: "other", l: "Other" },
];
const CONDITIONS = [
  { v: "new", l: "New" }, { v: "used", l: "Used" }, { v: "for_parts_or_repair", l: "For parts or repair" },
];
const PRICE_TYPES = [
  { v: "fixed", l: "Fixed" }, { v: "negotiable", l: "Negotiable" }, { v: "poa", l: "Price on ask" }, { v: "free", l: "Free" },
];

export default function CreateMarketplaceListing() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = !!id;
  const [vehicles, setVehicles] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [f, setF] = useState({
    listing_type: "for_sale", category: "engine", title: "", description: "",
    price_type: "fixed", price: "", condition: "used", quantity: "1",
    primary_vehicle_id: "", compatible_make: "", compatible_model: "", compatible_chassis_code: "",
    compatible_year_from: "", compatible_year_to: "", location_general: "", photo_urls: [],
    ...DEFAULT_ATTRS, ...EMPTY_ATTRS,
  });

  useEffect(() => {
    (async () => {
      try {
        const vs = await base44.entities.Vehicle.list();
        setVehicles(vs || []);
      } catch {}
      if (editing) {
        const res = await base44.functions.invoke("marketplace", { action: "getListing", listing_id: id });
        const l = res.data?.listing;
        if (l) setF((prev) => ({
          ...prev, listing_type: l.listing_type || "for_sale", category: l.category || "engine", title: l.title || "",
          description: l.description || "", price_type: l.price_type || "fixed",
          price: l.price_cents != null ? String(l.price_cents / 100) : "", condition: l.condition || "used",
          quantity: String(l.quantity ?? 1), primary_vehicle_id: l.primary_vehicle_id || "",
          compatible_make: l.compatible_make || "", compatible_model: l.compatible_model || "",
          compatible_chassis_code: l.compatible_chassis_code || "",
          compatible_year_from: l.compatible_year_from ?? "", compatible_year_to: l.compatible_year_to ?? "",
          location_general: l.location_general || "", photo_urls: l.photo_urls || [],
          ...DEFAULT_ATTRS, ...EMPTY_ATTRS,
          brand: l.brand || "",
          oem_or_aftermarket: l.oem_or_aftermarket || "",
          shipping_available: l.shipping_available ?? false,
          pickup_available: l.pickup_available ?? true,
          shipping_cost: l.shipping_cost_cents != null ? String(l.shipping_cost_cents / 100) : "",
          wheel_diameter_inches: l.wheel_diameter_inches ?? "",
          wheel_width_inches: l.wheel_width_inches ?? "",
          wheel_offset_mm: l.wheel_offset_mm ?? "",
          wheel_pcd: l.wheel_pcd || "",
          wheel_quantity: l.wheel_quantity ?? "",
          tyres_included: l.tyres_included ?? false,
          tyre_tread_percentage: l.tyre_tread_percentage ?? "",
          component_kilometres: l.component_kilometres ?? "",
          tested_before_listing: l.tested_before_listing || "",
          warranty_included: l.warranty_included ?? false,
          lock_status: l.lock_status || "",
          tuned: l.tuned ?? false,
        }));
      }
    })();
  }, [id]);

  const isVehicleForSale = f.category === "vehicle" && f.listing_type === "for_sale";
  const showCompat = f.category !== "vehicle";
  const showPrice = f.price_type === "fixed" || f.price_type === "negotiable";

  const field = (k, v) => setF({ ...f, [k]: v });

  // Switching category resets every category-attribute field so no stale value
  // is ever submitted for a category it no longer applies to (ADR-042 §4).
  const setCategory = (cat) => setF({ ...f, category: cat, ...DEFAULT_ATTRS, ...EMPTY_ATTRS });

  const submit = async (publish) => {
    if (!f.title.trim() || busy) return;
    setBusy(publish ? "publish" : "draft"); setError("");
    try {
      const payload = {
        listing_type: f.listing_type, category: f.category, title: f.title.trim(),
        description: f.description.trim() || undefined, price_type: f.price_type, condition: f.condition,
        quantity: Number(f.quantity) || 1, location_general: f.location_general.trim() || undefined,
        primary_vehicle_id: f.primary_vehicle_id || undefined,
        compatible_year_from: f.compatible_year_from === "" ? undefined : Number(f.compatible_year_from),
        compatible_year_to: f.compatible_year_to === "" ? undefined : Number(f.compatible_year_to),
      };
      if (showPrice) {
        const dollars = f.price === "" ? NaN : Number(f.price);
        if (Number.isNaN(dollars) || dollars < 0) { setError("Enter a valid price."); setBusy(""); return; }
        payload.price_cents = Math.round(dollars * 100);
      } else {
        payload.price_cents = null;
      }
      if (showCompat) {
        payload.compatible_make = f.compatible_make.trim() || undefined;
        payload.compatible_model = f.compatible_model.trim() || undefined;
        payload.compatible_chassis_code = f.compatible_chassis_code.trim() || undefined;
      }
      // ADR-042 category attributes — only send fields applicable to the
      // selected category. shipping_cost maps to shipping_cost_cents.
      const applicable = applicableCategoryFields(f.category);
      for (const key of applicable) {
        if (key === "shipping_cost_cents") {
          payload.shipping_cost_cents = f.shipping_available ? Math.round((Number(f.shipping_cost) || 0) * 100) : null;
          continue;
        }
        const val = f[key];
        if (val === "" || val === undefined) continue; // skip empty textual/numeric fields
        payload[key] = val;
      }
      let res;
      if (editing) {
        res = await base44.functions.invoke("marketplace", { action: "updateListing", listing_id: id, ...payload });
        if (publish && res.data?.ok) res = await base44.functions.invoke("marketplace", { action: "publishListing", listing_id: id });
      } else {
        res = await base44.functions.invoke("marketplace", { action: "createListingDraft", ...payload });
        if (publish && res.data?.ok) res = await base44.functions.invoke("marketplace", { action: "publishListing", listing_id: res.data.listing_id });
      }
      if (res.data?.ok) navigate(`/marketplace/${res.data.listing_id || id}`);
      else setError(res.data?.details?.message || res.data?.error || "Failed");
    } catch (e) { setError(e.message); } finally { setBusy(""); }
  };

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link to="/marketplace" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Marketplace</Link>
      <div>
        <h1 className="text-2xl font-black tracking-tighter">{editing ? "Edit listing" : "Post a listing"}</h1>
        <p className="text-sm text-muted-foreground">Trusted Member+ publishes straight to active; New Member submits for review.</p>
      </div>
      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <div className="grid grid-cols-2 gap-2">
          {[{ v: "for_sale", l: "For sale" }, { v: "wanted", l: "Wanted" }].map((o) => (
            <button key={o.v} type="button" onClick={() => field("listing_type", o.v)} className={`rounded-xl border p-3 text-sm font-bold ${f.listing_type === o.v ? "border-primary bg-primary/10" : "border-border"}`}>{o.l}</button>
          ))}
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Category</label>
          <select value={f.category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary">
            {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Title</label>
          <input value={f.title} onChange={(e) => field("title", e.target.value)} maxLength={140} placeholder="e.g. B16 cylinder head" className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Description</label>
          <textarea value={f.description} onChange={(e) => field("description", e.target.value)} rows={4} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Price type</label>
            <select value={f.price_type} onChange={(e) => field("price_type", e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary">
              {PRICE_TYPES.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Condition</label>
            <select value={f.condition} onChange={(e) => field("condition", e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary">
              {CONDITIONS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
            </select>
          </div>
        </div>
        {showPrice && (
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Price (AUD)</label>
            <input type="number" value={f.price} onChange={(e) => field("price", e.target.value)} placeholder="0" className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
          </div>
        )}
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Quantity</label>
          <input type="number" min="1" value={f.quantity} onChange={(e) => field("quantity", e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
        </div>

        {isVehicleForSale && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
            <label className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-primary"><Car className="h-3.5 w-3.5" /> Vehicle (required)</label>
            <select value={f.primary_vehicle_id} onChange={(e) => field("primary_vehicle_id", e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary">
              <option value="">Select your vehicle...</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.year} {v.make} {v.model}{v.nickname ? ` — ${v.nickname}` : ""}</option>)}
            </select>
            {vehicles.length === 0 && <p className="mt-1 text-xs text-destructive">Add a vehicle to your garage first.</p>}
          </div>
        )}

        {showCompat && (
          <div className="space-y-3 rounded-xl border border-border p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Compatibility (optional)</p>
            <div className="grid grid-cols-2 gap-2">
              <input value={f.compatible_make} onChange={(e) => field("compatible_make", e.target.value)} placeholder="Make" className="rounded-lg border border-border bg-background px-2.5 py-2 text-xs outline-none focus:border-primary" />
              <input value={f.compatible_model} onChange={(e) => field("compatible_model", e.target.value)} placeholder="Model" className="rounded-lg border border-border bg-background px-2.5 py-2 text-xs outline-none focus:border-primary" />
              <input value={f.compatible_chassis_code} onChange={(e) => field("compatible_chassis_code", e.target.value)} placeholder="Chassis code" className="rounded-lg border border-border bg-background px-2.5 py-2 text-xs outline-none focus:border-primary" />
              <div className="flex gap-1">
                <input type="number" value={f.compatible_year_from} onChange={(e) => field("compatible_year_from", e.target.value)} placeholder="Year from" className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs outline-none focus:border-primary" />
                <input type="number" value={f.compatible_year_to} onChange={(e) => field("compatible_year_to", e.target.value)} placeholder="to" className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs outline-none focus:border-primary" />
              </div>
            </div>
          </div>
        )}

        <CategoryAttributesForm category={f.category} values={f} onChange={field} />

        <input value={f.location_general} onChange={(e) => field("location_general", e.target.value)} placeholder="City/region" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
      </div>

      <div className="flex gap-2">
        <button disabled={!!busy || !f.title.trim()} onClick={() => submit(false)} className="flex-1 rounded-xl border border-border py-3 text-sm font-bold disabled:opacity-50">{busy === "draft" ? "Saving..." : "Save draft"}</button>
        <button disabled={!!busy || !f.title.trim()} onClick={() => submit(true)} className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground glow-red disabled:opacity-50">{busy === "publish" ? "Publishing..." : "Publish"}</button>
      </div>
    </div>
  );
}