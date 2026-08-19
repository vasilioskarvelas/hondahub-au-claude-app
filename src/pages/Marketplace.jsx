import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Search, Plus, Tag, Package, Wrench, Cog, Car, Cpu, Wind, Zap, Circle, Armchair, Settings } from "lucide-react";

const CATEGORIES = [
  { v: "vehicle", l: "Vehicles", i: Car },
  { v: "engine", l: "Engines", i: Cog },
  { v: "transmission", l: "Transmissions", i: Settings },
  { v: "forced_induction", l: "Forced Induction", i: Wind },
  { v: "wheels_tyres", l: "Wheels & Tyres", i: Circle },
  { v: "suspension", l: "Suspension", i: Cog },
  { v: "brakes", l: "Brakes", i: Cog },
  { v: "electronics", l: "Electronics", i: Cpu },
  { v: "interior", l: "Interior", i: Armchair },
  { v: "exterior", l: "Exterior", i: Car },
  { v: "performance_part", l: "Performance", i: Zap },
  { v: "tools_equipment", l: "Tools", i: Wrench },
  { v: "other", l: "Other", i: Package },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.v, c.l]));
const OEM_OPTIONS = [{ v: "", l: "Any OEM/aftermarket" }, { v: "oem", l: "OEM" }, { v: "aftermarket", l: "Aftermarket" }, { v: "not_applicable", l: "N/A" }];
const SORT_OPTIONS = [
  { v: "", l: "Newest" },
  { v: "price_asc", l: "Price: low to high" },
  { v: "price_desc", l: "Price: high to low" },
  { v: "views", l: "Most viewed" },
];
const FILTER_MODELS = [{ v: "civic", l: "Civic" }, { v: "integra", l: "Integra" }, { v: "accord", l: "Accord" }, { v: "crv", l: "CR-V" }, { v: "s2000", l: "S2000" }, { v: "nsx", l: "NSX" }, { v: "other", l: "Other" }];
const FILTER_CHASSIS = [{ v: "eg", l: "EG" }, { v: "ek", l: "EK" }, { v: "dc2", l: "DC2" }, { v: "dc5", l: "DC5" }, { v: "ep3", l: "EP3" }, { v: "fn2", l: "FN2" }, { v: "cl7", l: "CL7" }, { v: "cl9", l: "CL9" }, { v: "fd2", l: "FD2" }, { v: "fk8", l: "FK8" }, { v: "fl5", l: "FL5" }, { v: "other", l: "Other" }];
const FILTER_ENGINES = [{ v: "d_series", l: "D-Series" }, { v: "b_series", l: "B-Series" }, { v: "k_series", l: "K-Series" }, { v: "j_series", l: "J-Series" }, { v: "f_series", l: "F-Series" }, { v: "h_series", l: "H-Series" }, { v: "other", l: "Other" }];

function priceLabel(l) {
  if (l.price_type === "free") return "Free";
  if (l.price_type === "poa" || l.price_cents == null) return "POA";
  return `$${(l.price_cents / 100).toLocaleString()}`;
}

export default function Marketplace() {
  const navigate = useNavigate();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    listing_type: "", category: "", search: "",
    compatible_models: [], compatible_chassis_codes: [], compatible_engine_families: [], compatible_year: "",
    brand: "", oem_or_aftermarket: "", shipping_available: false, pickup_available: false, sort: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      const args = { action: "listListings" };
      if (filters.listing_type) args.listing_type = filters.listing_type;
      if (filters.category) args.category = filters.category;
      if (filters.search) args.search = filters.search;
      if (filters.compatible_models?.length) args.compatible_models = filters.compatible_models;
      if (filters.compatible_chassis_codes?.length) args.compatible_chassis_codes = filters.compatible_chassis_codes;
      if (filters.compatible_engine_families?.length) args.compatible_engine_families = filters.compatible_engine_families;
      if (filters.compatible_year) args.compatible_year = Number(filters.compatible_year);
      if (filters.brand) args.brand = filters.brand;
      if (filters.oem_or_aftermarket) args.oem_or_aftermarket = filters.oem_or_aftermarket;
      if (filters.shipping_available) args.shipping_available = true;
      if (filters.pickup_available) args.pickup_available = true;
      if (filters.sort) args.sort = filters.sort;
      const res = await base44.functions.invoke("marketplace", args);
      setListings(res.data?.listings || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const showAttrFilters = filters.category && filters.category !== "vehicle";

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tighter">Marketplace</h1>
          <p className="text-sm text-muted-foreground">Parts, cars and tools from the community.</p>
        </div>
        <button onClick={() => navigate("/marketplace/create")} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground glow-red">
          <Plus className="h-4 w-4" /> Post a listing
        </button>
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Search listings..." className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:border-primary" />
          </div>
          <select value={filters.listing_type} onChange={(e) => setFilters({ ...filters, listing_type: e.target.value })} className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">
            <option value="">All types</option>
            <option value="for_sale">For sale</option>
            <option value="wanted">Wanted</option>
          </select>
          <select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })} className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">
            {SORT_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          <button onClick={load} className="rounded-xl bg-secondary px-4 py-2 text-sm font-bold">Search</button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Category:</span>
          <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })} className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
          </select>
        </div>
        {(filters.category && filters.category !== "vehicle") && (
          <div className="space-y-2 border-t border-border pt-3">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Compatibility:</span>
            <div className="flex flex-wrap gap-1.5">
              {FILTER_MODELS.map((o) => { const sel = filters.compatible_models.includes(o.v); return (
                <button key={o.v} onClick={() => setFilters((f) => ({ ...f, compatible_models: sel ? f.compatible_models.filter((v) => v !== o.v) : [...f.compatible_models, o.v] }))} className={`rounded-full px-2.5 py-1 text-xs font-bold transition ${sel ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>{o.l}</button>
              ); })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FILTER_CHASSIS.map((o) => { const sel = filters.compatible_chassis_codes.includes(o.v); return (
                <button key={o.v} onClick={() => setFilters((f) => ({ ...f, compatible_chassis_codes: sel ? f.compatible_chassis_codes.filter((v) => v !== o.v) : [...f.compatible_chassis_codes, o.v] }))} className={`rounded-full px-2.5 py-1 text-xs font-bold transition ${sel ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>{o.l}</button>
              ); })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FILTER_ENGINES.map((o) => { const sel = filters.compatible_engine_families.includes(o.v); return (
                <button key={o.v} onClick={() => setFilters((f) => ({ ...f, compatible_engine_families: sel ? f.compatible_engine_families.filter((v) => v !== o.v) : [...f.compatible_engine_families, o.v] }))} className={`rounded-full px-2.5 py-1 text-xs font-bold transition ${sel ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>{o.l}</button>
              ); })}
            </div>
            <input value={filters.compatible_year} onChange={(e) => setFilters({ ...filters, compatible_year: e.target.value })} placeholder="Year" className="w-24 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary" />
          </div>
        )}
        {showAttrFilters && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Details:</span>
            <input value={filters.brand} onChange={(e) => setFilters({ ...filters, brand: e.target.value })} placeholder="Brand" className="w-36 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary" />
            <select value={filters.oem_or_aftermarket} onChange={(e) => setFilters({ ...filters, oem_or_aftermarket: e.target.value })} className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary">
              {OEM_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
            <label className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <input type="checkbox" checked={filters.shipping_available} onChange={(e) => setFilters({ ...filters, shipping_available: e.target.checked })} /> Ships
            </label>
            <label className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <input type="checkbox" checked={filters.pickup_available} onChange={(e) => setFilters({ ...filters, pickup_available: e.target.checked })} /> Pickup
            </label>
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading listings...</div>
      ) : listings.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-16 text-center">
          <Package className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm font-bold">No listings found</p>
          <p className="text-xs text-muted-foreground">Try adjusting your filters or post the first one.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => (
            <Link key={l.id} to={`/marketplace/${l.id}`} className="group overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary">
              <div className="aspect-video bg-secondary">
                {l.photo_urls?.[0] ? <img src={l.photo_urls[0]} alt={l.title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Package className="h-8 w-8 text-muted-foreground" /></div>}
              </div>
              <div className="p-3">
                <div className="flex items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${l.listing_type === "wanted" ? "bg-blue-500/15 text-blue-400" : "bg-primary/15 text-primary"}`}>{l.listing_type === "wanted" ? "Wanted" : "For sale"}</span>
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">{CATEGORY_LABEL[l.category] || l.category}</span>
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
          ))}
        </div>
      )}
    </div>
  );
}