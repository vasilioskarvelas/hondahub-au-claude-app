import React from "react";
import { base44 } from "@/api/base44Client";
import { Gavel, Clock, Crown, TrendingUp } from "lucide-react";

/**
 * AuctionBidding — bidding interface for auction-type MarketplaceListings.
 * Uses the marketplace backend's placeBid / listBids actions (not the legacy
 * Listing entity). Shown to non-owners on the listing detail page.
 */
export default function AuctionBidding({ listing, me, onBidPlaced }) {
  const [bids, setBids] = React.useState([]);
  const [bidAmount, setBidAmount] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadBids = React.useCallback(async () => {
    try {
      const res = await base44.functions.invoke("marketplace", { action: "listBids", listing_id: listing.id });
      setBids(res.data?.bids || []);
    } catch {}
  }, [listing.id]);

  React.useEffect(() => { loadBids(); }, [loadBids]);

  const endsAt = listing.auction_ends_at ? new Date(listing.auction_ends_at).getTime() : 0;
  const timeLeft = endsAt - now;
  const ended = timeLeft <= 0;

  const currentBid = listing.current_bid_cents || 0;
  const minNextBid = currentBid > 0 ? currentBid + 100 : listing.auction_min_bid_cents || 0;
  const reserveMet = listing.auction_reserve_cents ? currentBid >= listing.auction_reserve_cents : true;

  const formatCountdown = () => {
    if (ended) return "Auction ended";
    const d = Math.floor(timeLeft / 86400000);
    const h = Math.floor((timeLeft % 86400000) / 3600000);
    const m = Math.floor((timeLeft % 3600000) / 60000);
    const s = Math.floor((timeLeft % 60000) / 1000);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  const placeBid = async () => {
    const dollars = Number(bidAmount);
    if (!dollars || dollars <= 0) return;
    const cents = Math.round(dollars * 100);
    setLoading(true); setError("");
    try {
      const res = await base44.functions.invoke("marketplace", {
        action: "placeBid", listing_id: listing.id, amount_cents: cents,
      });
      if (res.data?.ok) {
        setBidAmount("");
        await loadBids();
        onBidPlaced?.();
      } else {
        const e = res.data?.error;
        if (e?.code === "AUCTION_REQUIRES_PREMIUM") setError("A premium subscription is required to bid.");
        else if (e?.code === "BID_TOO_LOW") setError(`Minimum bid is $${(e.details?.minimum_cents / 100 || 0).toLocaleString()}.`);
        else if (e?.code === "AUCTION_ENDED") setError("This auction has ended.");
        else if (e?.code === "CANNOT_BID_ON_OWN_LISTING") setError("You can't bid on your own listing.");
        else setError(e?.message || e?.code || "Failed to place bid.");
      }
    } catch (e) {
      setError(e.message || "Failed to place bid.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      {/* Countdown + Current bid */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            <Clock className="h-3 w-3" /> {ended ? "Ended" : "Ends in"}
          </div>
          <div className={`text-lg font-black ${ended ? "text-muted-foreground" : "text-primary"}`}>
            {formatCountdown()}
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            <Gavel className="h-3 w-3" /> {bids.length > 0 ? "Current bid" : "Starting bid"}
          </div>
          <div className="text-2xl font-black text-primary">
            ${(currentBid / 100).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Reserve status */}
      {listing.auction_reserve_cents && !ended && (
        <div className="text-xs">
          {reserveMet
            ? <span className="font-bold text-emerald-400">✓ Reserve met</span>
            : <span className="text-muted-foreground">Reserve not met</span>
          }
        </div>
      )}

      {/* Bid history */}
      {bids.length > 0 && (
        <div className="rounded-xl border border-border bg-secondary/40 p-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Bid history ({bids.length})
          </div>
          <div className="space-y-1.5">
            {bids.slice(0, 5).map((bid, i) => (
              <div key={bid.id} className="flex items-center justify-between text-sm">
                <span className={i === 0 ? "font-bold text-primary" : "text-muted-foreground"}>
                  {i === 0 && <Crown className="mr-1 inline h-3 w-3" />}
                  {bid.bidder_name}
                </span>
                <span className="font-bold">${(bid.amount_cents / 100).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}

      {/* Bid input or ended state */}
      {!ended ? (
        <div>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="1"
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
              placeholder={`Min $${(minNextBid / 100).toLocaleString()}`}
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={placeBid}
              disabled={loading || !bidAmount}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              <TrendingUp className="h-4 w-4" /> {loading ? "..." : "Place bid"}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Enter ${(minNextBid / 100).toLocaleString()} or more
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-secondary p-3 text-center">
          {listing.current_bidder_id ? (
            <>
              <p className="text-sm font-bold">Auction ended</p>
              <p className="text-xs text-muted-foreground">
                Final bid: ${(currentBid / 100).toLocaleString()}
                {listing.auction_reserve_cents ? (reserveMet ? " — Reserve met ✓" : " — Reserve not met") : ""}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No bids were placed</p>
          )}
        </div>
      )}
    </div>
  );
}