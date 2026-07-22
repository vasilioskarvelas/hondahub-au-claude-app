import React from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { DollarSign, Repeat, ArrowLeftRight, Check, X, Clock, Inbox, Send } from "lucide-react";
import { getCurrentUser } from "@/lib/userIdentity";

const STATUS_STYLES = {
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  accepted: "bg-green-500/15 text-green-400 border-green-500/30",
  declined: "bg-red-500/15 text-red-400 border-red-500/30",
  countered: "bg-sky-500/15 text-sky-400 border-sky-500/30",
};

export default function ProfileOffers() {
  const [tab, setTab] = React.useState("made");
  const [offers, setOffers] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const userName = getCurrentUser();

  const load = React.useCallback(async () => {
    if (!userName) { setLoading(false); return; }
    setLoading(true);
    try {
      const all = await base44.entities.Offer.list("-created_date", 50);
      if (tab === "made") {
        setOffers(all.filter((o) => o.buyer_name === userName));
      } else {
        // Offers received on MY listings — filter by listing titles I own
        const myListings = await base44.entities.Listing.filter({ seller_name: userName }, "-created_date", 50);
        const myListingIds = new Set(myListings.map((l) => l.id));
        setOffers(all.filter((o) => myListingIds.has(o.listing_id)));
      }
    } catch (e) {
      console.error("Failed to load offers:", e);
    } finally {
      setLoading(false);
    }
  }, [tab, userName]);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      {/* Sub-toggle: Made vs Received */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab("made")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-bold transition ${tab === "made" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
        >
          <Send className="h-3.5 w-3.5" /> Made
        </button>
        <button
          onClick={() => setTab("received")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-bold transition ${tab === "received" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
        >
          <Inbox className="h-3.5 w-3.5" /> Received
        </button>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-secondary border-t-primary" />
        </div>
      ) : offers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {tab === "made"
            ? "No offers made yet. Find a listing and make an offer to get started!"
            : "No offers received yet. Your listings are waiting for offers!"}
        </div>
      ) : (
        <div className="space-y-2">
          {offers.map((offer) => (
            <OfferCard key={offer.id} offer={offer} view={tab} onAction={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function OfferCard({ offer, view, onAction }) {
  const isCash = offer.type === "cash";
  const [showCounter, setShowCounter] = React.useState(false);
  const [counterAmount, setCounterAmount] = React.useState("");

  const respond = async (status) => {
    await base44.entities.Offer.update(offer.id, { status });
    onAction();
  };

  const sendCounter = async () => {
    await base44.entities.Offer.update(offer.id, {
      status: "countered",
      counter_amount: Number(counterAmount),
    });
    setShowCounter(false);
    setCounterAmount("");
    onAction();
  };

  return (
    <Link
      to={offer.listing_id ? `/listing/${offer.listing_id}` : "#"}
      className="block rounded-xl border border-border bg-card p-3 transition hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            {isCash ? <DollarSign className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">
              {view === "made" ? offer.listing_title || "Listing" : offer.buyer_name || "Buyer"}
            </div>
            <div className="text-xs text-muted-foreground">
              {isCash ? (
                <>Cash: <span className="font-bold text-primary">${offer.amount?.toLocaleString()}</span></>
              ) : (
                <>
                  Trade: <span className="font-semibold text-foreground">{offer.offered_listing_title || "Item"}</span>
                  {offer.cash_difference > 0 && <> + <span className="font-bold text-primary">${offer.cash_difference?.toLocaleString()}</span></>}
                </>
              )}
            </div>
          </div>
        </div>
        <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLES[offer.status]}`}>
          {offer.status}
        </span>
      </div>

      {offer.message && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{offer.message}</p>}

      {/* Counter offer display */}
      {offer.status === "countered" && offer.counter_amount && (
        <div className="mt-2 rounded-lg border border-sky-500/30 bg-sky-500/10 p-2" onClick={(e) => e.preventDefault()}>
          <div className="text-xs text-sky-400">
            Seller countered: <span className="font-bold">${offer.counter_amount?.toLocaleString()}</span>
          </div>
          <div className="mt-2 flex gap-2">
            <button onClick={() => respond("accepted")} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-green-500/15 py-1.5 text-xs font-bold text-green-400 hover:bg-green-500/25">
              <Check className="h-3.5 w-3.5" /> Accept
            </button>
            <button onClick={() => respond("declined")} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-red-500/15 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/25">
              <X className="h-3.5 w-3.5" /> Decline
            </button>
          </div>
        </div>
      )}

      {/* Pending offer actions (only for received offers) */}
      {view === "received" && offer.status === "pending" && (
        <div className="mt-3" onClick={(e) => e.preventDefault()}>
          <div className="flex gap-2">
            <button onClick={() => respond("accepted")} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-green-500/15 py-1.5 text-xs font-bold text-green-400 hover:bg-green-500/25">
              <Check className="h-3.5 w-3.5" /> Accept
            </button>
            <button onClick={() => respond("declined")} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-red-500/15 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/25">
              <X className="h-3.5 w-3.5" /> Reject
            </button>
            <button onClick={() => setShowCounter(!showCounter)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-amber-500/15 py-1.5 text-xs font-bold text-amber-400 hover:bg-amber-500/25">
              <ArrowLeftRight className="h-3.5 w-3.5" /> Counter
            </button>
          </div>
          {showCounter && (
            <div className="mt-2 flex gap-2">
              <input
                type="number"
                value={counterAmount}
                onChange={(e) => setCounterAmount(e.target.value)}
                placeholder="Counter amount $"
                className="flex-1 rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm outline-none focus:border-primary"
              />
              <button onClick={sendCounter} disabled={!counterAmount} className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50">
                Send
              </button>
            </div>
          )}
        </div>
      )}
    </Link>
  );
}