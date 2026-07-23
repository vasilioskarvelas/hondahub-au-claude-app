import React from "react";
import { inputCls } from "./constants";

export default function ShippingStep({ f, field }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black tracking-tight">Shipping & pickup</h2>
        <p className="text-sm text-muted-foreground">Let buyers know how they can receive the part.</p>
      </div>
      <label className="flex items-center gap-3 rounded-xl border-2 border-border p-3">
        <input type="checkbox" checked={!!f.shipping_available} onChange={(e) => field("shipping_available", e.target.checked)} className="h-4 w-4" />
        <span className="text-sm font-bold">Shipping available</span>
      </label>
      {f.shipping_available && (
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Shipping cost (AUD)</label>
          <input type="number" min="0" step="0.01" value={f.shipping_cost || ""} onChange={(e) => field("shipping_cost", e.target.value)} placeholder="0 = free shipping" className={inputCls} />
        </div>
      )}
      <label className="flex items-center gap-3 rounded-xl border-2 border-border p-3">
        <input type="checkbox" checked={f.pickup_available !== false} onChange={(e) => field("pickup_available", e.target.checked)} className="h-4 w-4" />
        <span className="text-sm font-bold">Pickup available</span>
      </label>
    </div>
  );
}