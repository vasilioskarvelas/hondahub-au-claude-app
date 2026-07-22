import React from "react";
import { base44 } from "@/api/base44Client";
import { Star, TrendingUp, AlertTriangle, Home, Crown, Gavel, RefreshCw } from "lucide-react";

const PROMOTIONS = [
  { key: "feature_listing", label: "Feature Listing", desc: "FEATURED badge on your listing", price: 9.99, icon: Star },
  { key: "top_search", label: "Top of Search", desc: "Boost to top of search results", price: 9.99, icon: TrendingUp },
  { key: "urgent_badge", label: "Urgent Sale Badge", desc: "URGENT badge to attract quick buyers", price: 4.99, icon: AlertTriangle },
  { key: "homepage_feature", label: "Homepage Feature", desc: "Show your listing on the homepage", price: 14.99, icon: Home },
];

export default function PromoteListing({ listing }) {
  const [promoting, setPromoting] = React.useState(null);

  const handleCheckout = async (items, relist = false) => {
    if (window.self !== window.top) {
      alert("Checkout is only available from the published app. Please open the app in a new tab.");
      return;
    }
    setPromoting(items.join(","));
    try {
      const payload = { listing_id: listing.id, mode: "features", items };
      if (relist) payload.relist = true;
      const res = await base44.functions.invoke("create-checkout-session", payload);
      const checkoutUrl = res.data?.url || res.url;
      if (!checkoutUrl) throw new Error("No checkout URL returned");
      window.location.href = checkoutUrl;
    } catch (err) {
      alert("Could not start checkout. Please try again.");
    } finally {
      setPromoting(null);
    }
  };

  const isActive = (key) => {
    if (key === "feature_listing") return listing.featured;
    if (key === "top_search") return listing.top_of_search;
    if (key === "urgent_badge") return listing.urgent;
    if (key === "homepage_feature") return listing.homepage_feature;
    return false;
  };

  const isAuction = listing.selling_format === "auction";
  const needsAuctionPayment = isAuction && listing.auction_status === "pending";
  const canRelist = isAuction && (listing.auction_status === "ended_reserve_not_met" || listing.auction_status === "ended_sold");

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Crown className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Promote Your Listing</h2>
      </div>

      {/* Pending auction payment */}
      {needsAuctionPayment && (
        <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="flex items-center gap-2">
            <Gavel className="h-4 w-4 text-amber-400" />
            <div className="flex-1">
              <div className="text-sm font-bold text-amber-400">Complete Auction Payment</div>
              <div className="text-xs text-muted-foreground">
                {listing.auction_duration === 14 ? "$14.99" : "$9.99"} — {listing.auction_duration} day auction
              </div>
            </div>
            <button
              onClick={() => handleCheckout([listing.auction_duration === 14 ? "auction_14" : "auction_7"])}
              disabled={promoting}
              className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-black disabled:opacity-50"
            >
              {promoting === (listing.auction_duration === 14 ? "auction_14" : "auction_7") ? "..." : "Pay Now"}
            </button>
          </div>
        </div>
      )}

      {/* Relist button */}
      {canRelist && (
        <div className="mb-3 rounded-xl border border-border bg-secondary p-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-primary" />
            <div className="flex-1">
              <div className="text-sm font-bold">Relist Auction</div>
              <div className="text-xs text-muted-foreground">
                {listing.auction_duration === 14 ? "$14.99" : "$9.99"} — start a new {listing.auction_duration}-day auction
              </div>
            </div>
            <button
              onClick={() => handleCheckout([listing.auction_duration === 14 ? "auction_14" : "auction_7"], true)}
              disabled={promoting}
              className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              {promoting && promoting.includes("auction") ? "..." : "Relist"}
            </button>
          </div>
        </div>
      )}

      {/* Regular promotions */}
      <div className="space-y-2">
        {PROMOTIONS.map((promo) => {
          const active = isActive(promo.key);
          const Icon = promo.icon;
          const disabledByPro = listing.auction_pro && (promo.key === "feature_listing" || promo.key === "top_search");
          return (
            <div key={promo.key} className={`flex items-center gap-3 rounded-xl border border-border bg-secondary p-3 ${disabledByPro ? "opacity-50" : ""}`}>
              <Icon className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold">{promo.label}</div>
                <div className="truncate text-xs text-muted-foreground">{promo.desc}</div>
              </div>
              {active ? (
                <span className="shrink-0 rounded-lg bg-green-500/15 px-3 py-1.5 text-xs font-bold text-green-400">ACTIVE</span>
              ) : disabledByPro ? (
                <span className="shrink-0 rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-400">IN PRO</span>
              ) : (
                <button
                  onClick={() => handleCheckout([promo.key])}
                  disabled={promoting === promo.key}
                  className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
                >
                  {promoting === promo.key ? "..." : `$${promo.price}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}