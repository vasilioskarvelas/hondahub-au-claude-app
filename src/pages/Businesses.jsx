import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Store, Search, BadgeCheck, MapPin, Star, Loader2 } from "lucide-react";

/**
 * Businesses — public directory of business partners.
 *
 * The entry point to storefronts: browse the businesses selling on Honda Hub and
 * click into one to see its catalogue. Member-posted listings never appear here;
 * a storefront only shows listings attributed to that business.
 */

function rating(b) {
  if (!b?.review_count) return null;
  return (b.rating_sum / b.review_count).toFixed(1);
}

export default function Businesses() {
  const [businesses, setBusinesses] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    base44.entities.Business.list()
      .then((b) => setBusinesses(Array.isArray(b) ? b : []))
      .catch(() => setBusinesses([]))
      .finally(() => setLoading(false));
  }, []);

  // `pending` is an unreviewed signup request and `rejected` was refused — neither
  // belongs in a public directory, or a stranger could self-list simply by signing
  // up. `unverified` businesses created by trusted members are still shown.
  const visible = businesses
    .filter((b) => b.status === "active")
    .filter((b) => b.verification_status !== "pending" && b.verification_status !== "rejected")
    .filter((b) => {
      if (!q.trim()) return true;
      const hay = `${b.name || ""} ${b.category || ""} ${b.about || ""} ${b.location_general || ""}`.toLowerCase();
      return hay.includes(q.trim().toLowerCase());
    });

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-20">
      <header className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/15 p-2">
          <Store className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight">Businesses</h1>
          <p className="text-sm text-muted-foreground">
            Honda specialists, workshops and parts suppliers selling on Honda Hub.
          </p>
        </div>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search businesses…"
          className="w-full rounded-xl border border-input bg-background py-2 pl-9 pr-3 text-sm"
        />
      </div>

      {loading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading businesses…
        </p>
      )}

      <div className="rounded-2xl border border-dashed border-border p-4 text-sm">
        <p className="font-bold">Own a Honda business?</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Get a storefront and import your product catalogue.
        </p>
        <Link to="/welcome" className="mt-2 inline-block text-xs font-bold text-primary hover:underline">
          List your business →
        </Link>
      </div>

      {!loading && visible.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {q.trim() ? "No businesses match that search." : "No businesses yet."}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map((b) => {
          const r = rating(b);
          return (
            <Link
              key={b.id}
              to={`/business/${b.id}`}
              className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-bold">{b.name}</h2>
                {b.verification_status === "verified" && (
                  <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-500" />
                )}
              </div>
              {b.category && (
                <span className="mt-1 inline-block rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                  {b.category}
                </span>
              )}
              {b.about && (
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{b.about}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {b.location_general && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {b.location_general}
                  </span>
                )}
                {r && (
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3 text-amber-500" /> {r} ({b.review_count})
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
