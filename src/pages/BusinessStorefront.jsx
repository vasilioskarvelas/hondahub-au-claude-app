import React from "react";
import { Link, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Store, BadgeCheck, MapPin, Globe, Star, Loader2, PackageSearch, ArrowLeft } from "lucide-react";

/**
 * BusinessStorefront — a business's public catalogue page.
 *
 * Shows only listings attributed to this business via MarketplaceListing
 * .business_id, which the import-approval path stamps. Listings posted by
 * individual members have a null business_id and so never appear in anyone's
 * storefront, which is what keeps the two kinds of seller distinct.
 */

const money = (l) => {
  if (l.price_type === "free") return "Free";
  if (l.price_type === "poa") return "POA";
  if (l.price_cents == null) return "—";
  return `$${(l.price_cents / 100).toFixed(2)}`;
};

export default function BusinessStorefront() {
  const { id } = useParams();
  const [business, setBusiness] = React.useState(null);
  const [listings, setListings] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const b = await base44.entities.Business.get(id);
        if (cancelled) return;
        setBusiness(b);
        const res = await base44.functions.invoke("marketplace", {
          action: "listListings",
          business_id: id,
        });
        if (cancelled) return;
        const data = res?.data || res;
        setListings(Array.isArray(data?.listings) ? data.listings : []);
      } catch (e) {
        if (!cancelled) setError(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const avg = business?.review_count ? (business.rating_sum / business.review_count).toFixed(1) : null;

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl py-20 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !business) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <Store className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
        <h2 className="text-lg font-bold">Business not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {error || "This business may have been removed."}
        </p>
        <Link to="/businesses" className="mt-4 inline-block text-sm text-primary hover:underline">
          Browse all businesses
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-20">
      <Link to="/businesses" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> All businesses
      </Link>

      <header className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">{business.name}</h1>
              {business.verification_status === "verified" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
                  <BadgeCheck className="h-3 w-3" /> Verified
                </span>
              )}
            </div>
            {business.category && (
              <p className="mt-1 text-sm text-muted-foreground">{business.category}</p>
            )}
          </div>
        </div>

        {business.about && <p className="mt-3 text-sm text-muted-foreground">{business.about}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          {business.location_general && (
            <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {business.location_general}</span>
          )}
          {business.website && (
            <a
              href={/^https?:\/\//i.test(business.website) ? business.website : `https://${business.website}`}
              target="_blank"
              rel="noreferrer noopener nofollow"
              className="flex items-center gap-1 hover:text-foreground"
            >
              <Globe className="h-3.5 w-3.5" /> Website
            </a>
          )}
          {avg && (
            <span className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5 text-amber-500" /> {avg} ({business.review_count} reviews)
            </span>
          )}
        </div>
      </header>

      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">
          {listings.length} item{listings.length === 1 ? "" : "s"} for sale
        </h2>
      </div>

      {listings.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <PackageSearch className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            This business hasn't listed anything yet.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {listings.map((l) => (
          <Link
            key={l.id}
            to={`/marketplace/${l.id}`}
            className="overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/50"
          >
            {l.photo_urls?.[0] ? (
              <img
                src={l.photo_urls[0]}
                alt=""
                className="h-36 w-full object-cover"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            ) : (
              <div className="flex h-36 w-full items-center justify-center bg-muted">
                <PackageSearch className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div className="p-3">
              <p className="line-clamp-2 text-sm font-bold">{l.title}</p>
              <p className="mt-1 text-sm text-primary">{money(l)}</p>
              {l.brand && <p className="mt-0.5 text-xs text-muted-foreground">{l.brand}</p>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
