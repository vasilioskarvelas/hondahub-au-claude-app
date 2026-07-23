import React from "react";
import { inputCls } from "./constants";

export default function LocationStep({ f, field }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black tracking-tight">Location</h2>
        <p className="text-sm text-muted-foreground">City or region only — no exact address.</p>
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Location</label>
        <input value={f.location_general} onChange={(e) => field("location_general", e.target.value)} placeholder="e.g. Melbourne, VIC" className={inputCls} />
      </div>
    </div>
  );
}