import React from "react";
import CategoryAttributesForm from "@/components/marketplace/CategoryAttributesForm";
import { CATEGORY_LABEL, inputCls } from "./constants";

// ADR-044 — Part details step. Title + category-specific attributes. Shipping
// is intentionally NOT shown here (showShipping=false) — it has its own step.
export default function DetailsStep({ f, field }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black tracking-tight">Part details</h2>
        <p className="text-sm text-muted-foreground">{CATEGORY_LABEL[f.category] || "Part"} — tell buyers what it is.</p>
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Listing title *</label>
        <input
          value={f.title}
          onChange={(e) => field("title", e.target.value)}
          maxLength={140}
          placeholder="e.g. B16 cylinder head"
          className={inputCls}
        />
      </div>
      <CategoryAttributesForm category={f.category} values={f} onChange={field} showShipping={false} />
    </div>
  );
}