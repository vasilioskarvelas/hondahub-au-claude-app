import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Search, Plus, Package, SlidersHorizontal, X, Store } from "lucide-react";

const ENGINE_CODES = [
  { v: "d_series", l: "D" },
  { v: "b_series", l: "B" },
  { v: "k_series", l: "K" },
  { v: "h_series", l: "H" },
  { v: "j_series", l: "J" },
  { v: "f_series", l: "F" },
  { v: "other", l: "Other" },
];

const SORT_OPTIONS = [
  { v: "", l: "Newest" },
  { v: "price_asc", l: "Price: Low → High" },
  { v: "price_desc", l: "Price: High → Low" },
  { v: "views", l: "Most Viewed" },
];

const TABS = [
  { v: "", l: "All" },
  { v: "vehicle", l: "Cars" },
  { v: "parts", l: "Parts" },
];

function priceLabel(l) {
  if (l.price_type === "free") return "Free";
  if (l.price_type === "poa" || l.price_cents == null) return "POA";
  return `$${(l.price_cents / 100).toLocaleString()}`;
}

export default function Marketplace() {
  const navigate = useNavigate();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("");
  const [search, setSearch] = useState("");
  const [engines, setEngines] = useState([]);
  const [sort, setSort] = useState("");
  const [showSort, setShowSort] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const args = { action: "listListings" };
      if (tab === "vehicle") args.category = "vehicle";
      if (search.trim()) args.search = search.trim();
      if (engines.length) args.compatible_engine_families = engines;
      if (sort) args.sort = sort;
      const res = await base44.functions.invoke("marketplace", args);
      let items = res.data?.listings || [];
      // "Parts" tab = everything that's not a vehicle (client-side, since the
      // backend takes a single category value).
      if (tab === "parts") items = items.filter((l) => l.category !== "vehicle");
      setListings(items);
    } finally {
      setLoading(false);
    }
  }, [tab, search, engines, sort]);

  useEffect(() => { load(); }, [load]);

  const toggleEngine = (v) => {
    setEngines((prev) => (prev.includes(v) ? prev.filter((e) => e !== v) : [...prev, v]));
  };

  const hasFilters = engines.length > 0 || search.trim() || sort;

  const clearFilters = () => {
    setEngines([]);
    setSearch("");
    setSort("");
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Marketplace</h1>
          <p className="text-sm text-muted-foreground">Cars and parts from the community.</p>
        </div>
        <button
          onClick={() => navigate("/marketplace/create")}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> Post
        </button>
      </div>

      {/* Business catalogues live in shops, not here — a single partner can list
          thousands of products and would bury member posts. This keeps them one
          tap away without crowding the board. */}
      <Link
        to="/businesses"
        className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/50"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/15 p-2">
            <Store className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold">Shop the businesses</p>
            <p className="text-xs text-muted-foreground">
              Parts suppliers, workshops and tuners — browse their full catalogues.
            </p>
          </div>
        </div>
        <span className="text-xs font-bold text-primary">Browse →</span>
      </Link>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Search cars, parts, engine codes…"
          className="w-full rounded-2xl border border-border bg-card py-3 pl-10 pr-10 text-sm outline-none focus:border-primary"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Segmented control — All / Cars / Parts */}
      <div className="flex rounded-2xl bg-secondary p-1">
        {TABS.map((t) => (
          <button
            key={t.v}
            onClick={() => setTab(t.v)}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
              tab === t.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {/* Engine code pills */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
        <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">Engine</span>
        {ENGINE_CODES.map((e) => {
          const sel = engines.includes(e.v);
          return (
            <button
              key={e.v}
              onClick={() => toggleEngine(e.v)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-bold transition ${
                sel ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {e.l}
            </button>
          );
        })}
      </div>

      {/* Sort + active filter count */}
      <div className="flex items-center justify-between">
        <div className="relative">
          <button
            onClick={() => setShowSort(!showSort)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {SORT_OPTIONS.find((s) => s.v === sort)?.l || "Newest"}
          </button>
          {showSort && (
            <div className="absolute left-0 top-full z-30 mt-1.5 w-52 overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl">
              {SORT_OPTIONS.map((s) => (
                <button
                  key={s.v}
                  onClick={() => { setSort(s.v); setShowSort(false); }}
                  className={`block w-full px-4 py-2.5 text-left text-sm hover:bg-secondary ${sort === s.v ? "font-bold text-primary" : ""}`}
                >
                  {s.l}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasFilters && (
            <button onClick={clearFilters} className="text-xs font-semibold text-primary hover:underline">
              Clear all
            </button>
          )}
          <span className="text-xs text-muted-foreground">{loading ? "…" : `${listings.length} results`}</span>
        </div>
      </div>

      {/* Listings */}
      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
      ) : listings.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-20 text-center">
          <Package className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm font-bold">No listings found</p>
          <p className="text-xs text-muted-foreground">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => (
            <Link key={l.id} to={`/marketplace/${l.id}`} className="group overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary">
              <div className="relative aspect-video bg-secondary">
                {l.photo_urls?.[0] ? (
                  <img src={l.photo_urls[0]} alt={l.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Package className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <span className={`absolute left-2.5 top-2.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${l.listing_type === "wanted" ? "bg-blue-500/90 text-white" : "bg-primary/90 text-primary-foreground"}`}>
                  {l.listing_type === "wanted" ? "Wanted" : "For Sale"}
                </span>
              </div>
              <div className="p-3.5">
                <h3 className="line-clamp-1 text-sm font-bold">{l.title}</h3>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-sm font-black">{priceLabel(l)}</span>
                  {l.location_general && <span className="truncate text-xs text-muted-foreground">{l.location_general}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}