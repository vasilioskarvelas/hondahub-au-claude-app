import React from "react";
import { base44 } from "@/api/base44Client";
import { DollarSign, Repeat, Clock, Check, X, ArrowLeftRight } from "lucide-react";

export default function OffersSection({ listingId }) {
  const [offers, setOffers] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(() => {
    base44.entities.Offer.filter({ listing_id: listingId }, "-created_date", 50).then((o) => {
      setOffers(o);
      setLoading(false);
    });
  }, [listingId]);

  React.useEffect(() => { load(); }, [load]);

  if (loading) return null;
  if (offers.length === 0) return null;

  const pending = offers.filter((o) => o.status === "pending" || o.status === "countered");
  const resolved = offers.filter((o) => o.status === "accepted" || o.status === "declined");

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        <Clock className="h-4 w-4" /> Offers ({offers.length})
      </h2>

      {pending.length > 0 && (
        <div className="space-y-2">
          {pending.map((o) => <OfferRow key={o.id} offer={o} onAction={load} />)}
        </div>
      )}

      {resolved.length > 0 && (
        <>
          {pending.length > 0 && <div className="my-3 border-t border-border" />}
          <div className="space-y-2 opacity-60">
            {resolved.map((o) => <OfferRow key={o.id} offer={o} onAction={load} />)}
          </div>
        </>
      )}
    </div>
  );
}

function OfferRow({ offer, onAction }) {
  const isCash = offer.type === "cash";
  const [showCounter, setShowCounter] = React.useState(false);
  const [counterAmount, setCounterAmount] = React.useState("");

  const statusStyles = {
    pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    accepted: "bg-green-500/15 text-green-400 border-green-500/30",
    declined: "bg-red-500/15 text-red-400 border-red-500/30",
    countered: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  };

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
    <div className="rounded-xl border border-border bg-secondary p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
            {isCash ? <DollarSign className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
          </div>
          <div>
            <div className="text-sm font-semibold">{offer.buyer_name || "Anonymous buyer"}</div>
            <div className="text-xs text-muted-foreground">
              {isCash ? (
                <>Cash offer: <span className="font-bold text-primary">${offer.amount?.toLocaleString()}</span></>
              ) : (
                <>Trade: <span className="font-bold text-foreground">{offer.offered_listing_title || "Item"}</span>
                {offer.cash_difference > 0 && <> + <span className="font-bold text-primary">${offer.cash_difference?.toLocaleString()}</span></>}
                </>
              )}
            </div>
          </div>
        </div>
        <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${statusStyles[offer.status]}`}>
          {offer.status}
        </span>
      </div>

      {offer.message && <p className="mt-2 text-sm text-muted-foreground">{offer.message}</p>}

      {/* Counter offer display */}
      {offer.status === "countered" && offer.counter_amount && (
        <div className="mt-2 rounded-lg border border-sky-500/30 bg-sky-500/10 p-2">
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

      {/* Pending offer actions */}
      {offer.status === "pending" && (
        <>
          <div className="mt-3 flex gap-2">
            <button onClick={() => respond("accepted")} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-green-500/15 py-1.5 text-xs font-bold text-green-400 hover:bg-green-500/25">
              <Check className="h-3.5 w-3.5" /> Accept
            </button>
            <button onClick={() => respond("declined")} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-red-500/15 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/25">
              <X className="h-3.5 w-3.5" /> Decline
            </button>
            <button onClick={() => setShowCounter(!showCounter)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-sky-500/15 py-1.5 text-xs font-bold text-sky-400 hover:bg-sky-500/25">
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
                className="flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm outline-none focus:border-primary"
              />
              <button
                onClick={sendCounter}
                disabled={!counterAmount}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
              >
                Send
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}