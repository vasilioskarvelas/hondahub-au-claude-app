import React from "react";
import { base44 } from "@/api/base44Client";
import { Gavel, Clock, TrendingUp, Crown } from "lucide-react";
import { getCurrentUser } from "@/lib/userIdentity";

export default function AuctionBidding({ listing }) {
  const [bids, setBids] = React.useState([]);
  const [bidAmount, setBidAmount] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [now, setNow] = React.useState(Date.now());
  const [endedProcessed, setEndedProcessed] = React.useState(false);
  const [localBid, setLocalBid] = React.useState(null);

  React.useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    base44.entities.Bid.filter({ listing_id: listing.id }, "-amount", 50).then(setBids);
  }, [listing.id]);

  const endDate = listing.auction_end_date ? new Date(listing.auction_end_date).getTime() : 0;
  const timeLeft = endDate - now;
  const ended = timeLeft <= 0 && listing.auction_status !== "pending";

  // Auto-update auction status when countdown ends
  React.useEffect(() => {
    if (!endedProcessed && listing.auction_status === "active" && listing.auction_end_date) {
      if (Date.now() >= endDate) {
        setEndedProcessed(true);
        const reserveMet = !listing.reserve_price || (listing.current_highest_bid || 0) >= listing.reserve_price;
        const newStatus = reserveMet ? "ended_sold" : "ended_reserve_not_met";
        base44.entities.Listing.update(listing.id, { auction_status: newStatus });
        if (listing.seller_name) {
          base44.entities.Notification.create({
            type: "mention",
            from_name: "HondaHub",
            to_name: listing.seller_name,
            post_id: listing.id,
            text: `Your auction "${listing.title}" has ended. ${reserveMet ? "Reserve met!" : "Reserve not met."}`,
          });
        }
      }
    }
  }, [now, endedProcessed, listing, endDate]);

  const currentBid = localBid ?? listing.current_highest_bid ?? listing.price ?? 0;
  const minBid = currentBid + (currentBid >= 1000 ? 50 : currentBid >= 100 ? 10 : 5);

  const formatCountdown = () => {
    if (ended) return "Auction Ended";
    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((timeLeft % (1000 * 60)) / 1000);
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const placeBid = async () => {
    const amount = Number(bidAmount);
    if (amount < minBid) {
      alert(`Minimum bid is $${minBid.toLocaleString()}`);
      return;
    }
    const name = getCurrentUser() || "Guest";
    setLoading(true);
    try {
      if (listing.highest_bidder_name && listing.highest_bidder_name !== name) {
        await base44.entities.Notification.create({
          type: "mention",
          from_name: name,
          to_name: listing.highest_bidder_name,
          post_id: listing.id,
          text: `You've been outbid on "${listing.title}". Current bid: $${amount.toLocaleString()}`,
        });
      }

      const newBid = await base44.entities.Bid.create({
        listing_id: listing.id,
        listing_title: listing.title,
        bidder_name: name,
        amount,
      });

      await base44.entities.Listing.update(listing.id, {
        current_highest_bid: amount,
        highest_bidder_name: name,
      });

      setBids((prev) => [newBid, ...prev]);
      setLocalBid(amount);
      setBidAmount("");
    } catch (err) {
      alert("Failed to place bid. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (listing.auction_status === "pending") {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center text-sm text-amber-300">
        Auction pending payment — complete checkout to activate.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Countdown + Current Bid */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-secondary p-3">
        <div>
          <div className="flex items-center gap-1 text-[10px] font-medium uppercase text-muted-foreground">
            <Clock className="h-3 w-3" /> {ended ? "Ended" : "Ends In"}
          </div>
          <div className={`text-lg font-black ${ended ? "text-muted-foreground" : "text-primary"}`}>
            {formatCountdown()}
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1 text-[10px] font-medium uppercase text-muted-foreground">
            <Gavel className="h-3 w-3" /> {bids.length > 0 ? "Current Bid" : "Starting Bid"}
          </div>
          <div className="text-2xl font-black text-primary">
            ${currentBid.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Reserve price info */}
      {listing.reserve_price && !ended && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {currentBid >= listing.reserve_price ? (
            <span className="text-green-400">✓ Reserve met</span>
          ) : (
            <span>Reserve not met</span>
          )}
        </div>
      )}

      {/* Bid history */}
      {bids.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="mb-2 text-[10px] font-bold uppercase text-muted-foreground">
            Bid History ({bids.length})
          </div>
          <div className="space-y-1.5">
            {bids.slice(0, 5).map((bid, i) => (
              <div key={bid.id} className="flex items-center justify-between text-sm">
                <span className={i === 0 ? "font-bold text-primary" : "text-muted-foreground"}>
                  {i === 0 && "👑 "}{bid.bidder_name}
                </span>
                <span className="font-bold">${bid.amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bid input or ended state */}
      {!ended ? (
        <div>
          <div className="flex gap-2">
            <input
              type="number"
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
              placeholder={`Min $${minBid.toLocaleString()}`}
              className="flex-1 rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={placeBid}
              disabled={loading || !bidAmount}
              className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {loading ? "..." : "Bid"}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Enter ${minBid.toLocaleString()} or more
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-secondary p-4 text-center">
          {listing.highest_bidder_name ? (
            <>
              <p className="text-sm font-bold">Auction Ended</p>
              <p className="text-xs text-muted-foreground">
                Winner: {listing.highest_bidder_name} at ${currentBid.toLocaleString()}
                {listing.reserve_price && currentBid >= listing.reserve_price
                  ? " — Reserve met ✓"
                  : listing.reserve_price
                  ? " — Reserve not met"
                  : ""}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No bids placed</p>
          )}
        </div>
      )}

      {listing.auction_pro && (
        <div className="flex items-center gap-1.5 text-xs text-amber-400">
          <Crown className="h-3 w-3" /> Auction Pro
        </div>
      )}
    </div>
  );
}