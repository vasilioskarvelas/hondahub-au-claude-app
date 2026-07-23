import React from "react";
import { inputCls } from "./constants";

// ADR-044 — for the Vehicle flow this step also holds the (auto-generated,
// editable) title; for the Part flow the title was set on the details step.
export default function DescriptionStep({ f, field, flow }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black tracking-tight">{flow === "vehicle" ? "Title & description" : "Description"}</h2>
        <p className="text-sm text-muted-foreground">
          {flow === "vehicle" ? "Review the auto-generated title and describe your vehicle." : "Describe the part — condition, history, anything buyers should know."}
        </p>
      </div>
      {flow === "vehicle" && (
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Listing title *</label>
          <input value={f.title} onChange={(e) => field("title", e.target.value)} maxLength={140} className={inputCls} />
        </div>
      )}
      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Description</label>
        <textarea value={f.description} onChange={(e) => field("description", e.target.value)} rows={6} className={inputCls} />
        <p className="mt-1 text-right text-[10px] text-muted-foreground">{f.description.length} chars · {f.description.length >= 150 ? "great" : "150+ recommended"}</p>
      </div>
    </div>
  );
}