import React from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Plus, TrendingUp, Flame } from "lucide-react";
import ListingCard from "@/components/ListingCard";
import Filters from "@/components/Filters";

export default function Market() {
  const [listings, setListings] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [filters, setFilters] = React.useState({ type: "" });
  const [applied, setApplied] = React.useState({ type: "" });
  const [refreshing, setRefreshing] = React.useState(false);
  const [touchStart, setTouchStart] = React.useState(0);

  const handleTouchStart = (e) => setTouchStart(e.touches[0].clientY);
  const handleTouchEnd = async (e) => {
    const diff = e.changedTouches[0].clientY - touchStart;
    if (diff > 80 && window.scrollY === 0 && !refreshing) {
      setRefreshing(true);
      await load();
      setRefreshing(false);
    }
  };

  const load = React.useCallback(() => {
    setLoading(true);
    const query = {};
    Object.entries(applied).forEach(([k, v]) => {
      if (v === "" || v === false || v === undefined || v === null) return;
      if (typeof v === "boolean") query[k] = true;
      else query[k] = v;
    });
    base44.entities.Listing.filter(query, "-created_date", 60).then((l) => {
      setListings(l);
      setLoading(false);
    });
  }, [applied]);

  React.useEffect(() => { load(); }, [load]);

  const featuredCars = listings.filter((l) => l.type === "car" && l.featured);
  const featuredParts = listings.filter((l) => l.type === "part" && l.featured);
  const cars = listings.filter((l) => l.type === "car");
  const parts = listings.filter((l) => l.type === "part");

  return (
    <div className="space-y-6" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {refreshing && (
        <div className="flex items-center justify-center py-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-secondary border-t-primary" />
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tighter">Marketplace</h1>
          <p className="text-sm text-muted-foreground">Browse cars and parts from Honda enthusiasts across Australia.</p>
        </div>
        <Link to="/create" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground glow-red">
          <Plus className="h-4 w-4" /> List
        </Link>
      </div>

      <div className="sticky top-14 z-30 -mx-4 bg-background/95 px-4 py-2 backdrop-blur lg:mx-0 lg:px-0 lg:py-0">
        <Filters filters={filters} setFilters={setFilters} onSearch={() => setApplied(filters)} onTypeChange={(type) => { const f = { ...filters, type }; setFilters(f); setApplied(f); }} />
      </div>

      {(!applied.type || applied.type === "car") && featuredCars.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Flame className="h-5 w-5 fill-primary text-primary" />
            <h2 className="text-lg font-bold">Featured Cars</h2>
            <span className="ml-auto rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">Premium</span>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {featuredCars.map((l) => <ListingCard key={l.id} listing={l} />)}
          </div>
        </section>
      )}

      {(!applied.type || applied.type === "part") && featuredParts.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Flame className="h-5 w-5 fill-primary text-primary" />
            <h2 className="text-lg font-bold">Featured Parts</h2>
            <span className="ml-auto rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">Premium</span>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {featuredParts.map((l) => <ListingCard key={l.id} listing={l} />)}
          </div>
        </section>
      )}

      {(!applied.type || applied.type === "car") && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <span className="h-5 w-1 rounded-full bg-primary" />
            <h2 className="text-lg font-bold">All Cars</h2>
            <span className="ml-auto rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground">{cars.length} cars</span>
          </div>
          {loading ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl bg-secondary" />)}
            </div>
          ) : cars.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">No cars listed yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {cars.map((l) => <ListingCard key={l.id} listing={l} />)}
            </div>
          )}
        </section>
      )}

      {(!applied.type || applied.type === "part") && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <span className="h-5 w-1 rounded-full bg-primary" />
            <h2 className="text-lg font-bold">All Parts</h2>
            <span className="ml-auto rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground">{parts.length} parts</span>
          </div>
          {loading ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl bg-secondary" />)}
            </div>
          ) : parts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">No parts listed yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {parts.map((l) => <ListingCard key={l.id} listing={l} />)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}