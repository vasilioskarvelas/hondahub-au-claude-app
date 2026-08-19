import React from "react";
import { PRICE_TYPES, AUCTION_DURATIONS, inputCls } from "./constants";
import { Crown } from "lucide-react";

// ADR-044 — Selling format sits AFTER the vehicle/category choice, never first.
export default function FormatStep({ f, field }) {
  const types = [{ v: "for_sale", l: "For sale" }, { v: "wanted", l: "Wanted" }];
  const priceCopy = {
    fixed: "Buy Now — a set price",
    negotiable: "Make Offer — open to offers",
    poa: "Price on ask",
    free: "Free",
    auction: "Set reserve — open to bids",
  };
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black tracking-tight">Selling format</h2>
        <p className="text-sm text-muted-foreground">How do you want to sell this?</p>
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Listing type</label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {types.map((o) => (
            <button key={o.v} type="button" onClick={() => field("listing_type", o.v)} className={`rounded-xl border-2 p-3 text-sm font-bold ${f.listing_type === o.v ? "border-primary bg-primary/5" : "border-border"}`}>{o.l}</button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Price type</label>
        <div className="mt-1 space-y-2">
          {PRICE_TYPES.map((p) => (
            <button key={p.v} type="button" onClick={() => field("price_type", p.v)} className={`flex w-full items-center justify-between rounded-xl border-2 p-3 text-left ${f.price_type === p.v ? "border-primary bg-primary/5" : "border-border"}`}>
              <span className="flex items-center gap-1.5 text-sm font-bold">
                {p.l}
                {p.v === "auction" && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                    <Crown className="h-2.5 w-2.5" /> Premium
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">{priceCopy[p.v]}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Condition</label>
        <select value={f.condition} onChange={(e) => field("condition", e.target.value)} className={inputCls}>
          <option value="new">New</option>
          <option value="used">Used</option>
          <option value="for_parts_or_repair">For parts or repair</option>
        </select>
      </div>
    </div>
  );
}