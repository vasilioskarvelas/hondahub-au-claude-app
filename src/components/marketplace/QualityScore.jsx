import React from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";

// ADR-045 §2.3 — Listing Quality Score card. Shown only to the listing's own
// poster while status = draft (the creation wizard preview / draft management).
// Accepts { score (0–100), checklist: [{ key, label, ok }] } from either the
// live client computation (src/lib/listingQuality) or the server getListing()
// response (quality_score / quality_checklist).
export default function QualityScore({ score, checklist }) {
  if (score == null) return null;
  const color = score >= 80 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-primary";
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className={`text-3xl font-black leading-none ${color}`}>
          {score}
          <span className="text-base font-bold text-muted-foreground">/100</span>
        </div>
        <div>
          <p className="text-sm font-bold">Listing quality</p>
          <p className="text-xs text-muted-foreground">A few extras can help your listing stand out.</p>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5">
        {(checklist || []).map((c) => (
          <li key={c.key} className="flex items-center gap-2 text-sm">
            {c.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <AlertCircle className="h-4 w-4 text-amber-400" />}
            <span className={c.ok ? "text-muted-foreground" : "font-semibold"}>{c.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}