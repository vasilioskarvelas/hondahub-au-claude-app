import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Search, Plus, Tag, Package, Wrench, Cog, Car, Music } from "lucide-react";

const CATEGORIES = [
  { v: "vehicle", l: "Vehicles", i: Car },
  { v: "parts", l: "Parts", i: Cog },
  { v: "wheels_tyres", l: "Wheels & Tyres", i: Package },
  { v: "accessories", l: "Accessories", i: Tag },
  { v: "audio", l: "Audio", i: Music },
  { v: "tools", l: "Tools", i: Wrench },
];

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.v, c.l]));

export default function Marketplace() {
  const navigate = useNavigate();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ listing_type: "", category: "", search: "", compatible_make: "", compatible_year: "" });

  const load = async () => {
    setLoading(true);
    try {
      const args = { action: "listListings" };
      if (filters.listing_type) args.listing_type = filters.listing_type;
      if (filters.category) args.category = filters.category;
      if (filters.search) args.search = filters.search;
      if (filters.compatible_make) args.compatible_make = filters.compatible_make;
      if (filters.compatible_year) args.compatible_year = filters.compatible_year;
      const res = await base44.functions.invoke("marketplace", args);
      setListings(res.data?.listings || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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

      {/* Filters */}
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
          <button onClick={load} className="rounded-xl bg-secondary px-4 py-2 text-sm font-bold">Search</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setFilters({ ...filters, category: "" })} className={`rounded-full border px-3 py-1 text-xs font-bold ${!filters.category ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>All</button>
          {CATEGORIES.map((c) => {
            const Icon = c.i;
            const sel = filters.category === c.v;
            return (
              <button key={c.v} onClick={() => setFilters({ ...filters, category: c.v })} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${sel ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                <Icon className="h-3 w-3" /> {c.l}
              </button>
            );
          })}
        </div>
        {/* Compatibility filters (only for non-vehicle categories) */}
        {filters.category && filters.category !== "vehicle" && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Compatibility:</span>
            <input value={filters.compatible_make} onChange={(e) => setFilters({ ...filters, compatible_make: e.target.value })} placeholder="Make/model" className="w-40 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary" />
            <input value={filters.compatible_year} onChange={(e) => setFilters({ ...filters, compatible_year: e.target.value })} placeholder="Year" className="w-24 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary" />
          </div>
        )}
      </div>

      {/* Results */}
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
                </div>
                <h3 className="mt-1.5 line-clamp-1 text-sm font-bold">{l.title}</h3>
                <div className="mt-1 flex items-center justify-between">
                  {l.price != null ? <span className="text-sm font-black">${Number(l.price).toLocaleString()}</span> : <span className="text-xs text-muted-foreground">Price on ask</span>}
                  <span className="text-xs text-muted-foreground">{l.location_state || ""}</span>
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