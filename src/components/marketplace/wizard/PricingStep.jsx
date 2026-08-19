import React from "react";
import { AUCTION_DURATIONS, inputCls } from "./constants";

export default function PricingStep({ f, field }) {
  const showPrice = f.price_type === "fixed" || f.price_type === "negotiable";
  const isAuction = f.price_type === "auction";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black tracking-tight">{isAuction ? "Auction pricing" : "Pricing"}</h2>
        <p className="text-sm text-muted-foreground">{isAuction ? "Set your starting bid, reserve, and duration." : "Set your price in AUD."}</p>
      </div>

      {showPrice && (
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Price (AUD) *</label>
          <input type="number" min="0" step="0.01" value={f.price} onChange={(e) => field("price", e.target.value)} placeholder="0.00" className={inputCls} />
        </div>
      )}

      {isAuction && (
        <>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Starting bid (AUD) *</label>
            <input type="number" min="0" step="1" value={f.auction_min_bid} onChange={(e) => field("auction_min_bid", e.target.value)} placeholder="e.g. 500" className={inputCls} />
            <p className="mt-1 text-xs text-muted-foreground">The minimum amount to open bidding.</p>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Reserve price (AUD)</label>
            <input type="number" min="0" step="1" value={f.auction_reserve} onChange={(e) => field("auction_reserve", e.target.value)} placeholder="Optional" className={inputCls} />
            <p className="mt-1 text-xs text-muted-foreground">You're not obligated to sell below this. Must be ≥ starting bid.</p>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Auction duration *</label>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {AUCTION_DURATIONS.map((d) => (
                <button key={d.v} type="button" onClick={() => field("auction_duration_days", d.v)} className={`rounded-xl border-2 p-2.5 text-sm font-bold ${Number(f.auction_duration_days) === d.v ? "border-primary bg-primary/5" : "border-border"}`}>
                  {d.l}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Quantity</label>
        <input type="number" min="1" value={f.quantity} onChange={(e) => field("quantity", e.target.value)} className={inputCls} />
      </div>
    </div>
  );
}