import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Car } from "lucide-react";

const CATEGORIES = [
  { v: "vehicle", l: "Vehicle" }, { v: "parts", l: "Parts" }, { v: "wheels_tyres", l: "Wheels & Tyres" },
  { v: "accessories", l: "Accessories" }, { v: "audio", l: "Audio" }, { v: "tools", l: "Tools" }, { v: "other", l: "Other" },
];
const STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];

export default function CreateMarketplaceListing() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = !!id;
  const [vehicles, setVehicles] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [f, setF] = useState({
    listing_type: "for_sale", category: "parts", title: "", description: "", price: "", condition: "used",
    primary_vehicle_id: "", compatible_make: "", compatible_model: "", compatible_chassis_code: "",
    compatible_year_from: "", compatible_year_to: "", location_general: "", location_state: "",
    postage_available: false, pickup: true, swap_accepted: false, photo_urls: [],
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
        if (l) setF((prev) => ({ ...prev, ...l, price: l.price ?? "", compatible_year_from: l.compatible_year_from ?? "", compatible_year_to: l.compatible_year_to ?? "", photo_urls: l.photo_urls || [] }));
      }
    })();
  }, [id]);

  const isVehicleForSale = f.category === "vehicle" && f.listing_type === "for_sale";
  const showCompat = f.category !== "vehicle";

  const submit = async (publish) => {
    if (!f.title.trim() || busy) return;
    setBusy(publish ? "publish" : "draft"); setError("");
    try {
      const payload = { ...f, price: f.price === "" ? undefined : Number(f.price), compatible_year_from: f.compatible_year_from === "" ? undefined : Number(f.compatible_year_from), compatible_year_to: f.compatible_year_to === "" ? undefined : Number(f.compatible_year_to) };
      let res;
      if (editing) {
        res = await base44.functions.invoke("marketplace", { action: "updateListing", listing_id: id, ...payload });
        if (publish && res.data?.ok) res = await base44.functions.invoke("marketplace", { action: "publishListing", listing_id: id });
      } else {
        res = await base44.functions.invoke("marketplace", { action: "createListingDraft", ...payload });
        if (publish && res.data?.ok) res = await base44.functions.invoke("marketplace", { action: "publishListing", listing_id: res.data.listing_id });
      }
      if (res.data?.ok) navigate(`/marketplace/${res.data.listing_id || id}`);
      else setError(res.data?.error || "Failed");
    } catch (e) { setError(e.message); } finally { setBusy(""); }
  };

  const field = (k, v) => setF({ ...f, [k]: v });

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link to="/marketplace" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Marketplace</Link>
      <div>
        <h1 className="text-2xl font-black tracking-tighter">{editing ? "Edit listing" : "Post a listing"}</h1>
        <p className="text-sm text-muted-foreground">Trusted Member+ required to publish. Drafts save at any tier.</p>
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
          <select value={f.category} onChange={(e) => field("category", e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary">
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
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Price (AUD)</label>
            <input type="number" value={f.price} onChange={(e) => field("price", e.target.value)} placeholder="0" className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Condition</label>
            <select value={f.condition} onChange={(e) => field("condition", e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary">
              <option value="used">Used</option><option value="new">New</option><option value="refurbished">Refurbished</option><option value="for_parts">For parts</option>
            </select>
          </div>
        </div>

        {/* Vehicle selector (required for vehicle for_sale) */}
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

        {/* Compatibility fields (only non-vehicle) */}
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

        <div className="grid grid-cols-2 gap-3">
          <input value={f.location_general} onChange={(e) => field("location_general", e.target.value)} placeholder="City/region" className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
          <select value={f.location_state} onChange={(e) => field("location_state", e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary">
            <option value="">State</option>
            {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-4">
          {[{ k: "postage_available", l: "Postage available" }, { k: "pickup", l: "Pickup" }, { k: "swap_accepted", l: "Swap accepted" }].map((o) => (
            <label key={o.k} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={!!f[o.k]} onChange={(e) => field(o.k, e.target.checked)} /> {o.l}</label>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button disabled={!!busy || !f.title.trim()} onClick={() => submit(false)} className="flex-1 rounded-xl border border-border py-3 text-sm font-bold disabled:opacity-50">{busy === "draft" ? "Saving..." : "Save draft"}</button>
        <button disabled={!!busy || !f.title.trim()} onClick={() => submit(true)} className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground glow-red disabled:opacity-50">{busy === "publish" ? "Publishing..." : "Publish"}</button>
      </div>
    </div>
  );
}