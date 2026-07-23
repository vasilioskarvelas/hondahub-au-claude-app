import React from "react";
import { inputCls } from "./constants";

export default function PricingStep({ f, field }) {
  const showPrice = f.price_type === "fixed" || f.price_type === "negotiable";
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black tracking-tight">Pricing</h2>
        <p className="text-sm text-muted-foreground">Set your price in AUD.</p>
      </div>
      {showPrice && (
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Price (AUD) *</label>
          <input type="number" min="0" step="0.01" value={f.price} onChange={(e) => field("price", e.target.value)} placeholder="0.00" className={inputCls} />
        </div>
      )}
      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Quantity</label>
        <input type="number" min="1" value={f.quantity} onChange={(e) => field("quantity", e.target.value)} className={inputCls} />
      </div>
    </div>
  );
}