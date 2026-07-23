import React from "react";
import { Plus, X } from "lucide-react";

const MAX = 10;

// ADR-045 §1 — bounded, display-only supplementary label/value editor.
// Max 10 entries; label ≤ 40 chars; value ≤ 100 chars. Empty rows are dropped
// on save (server-side). Not used for search or filtering.
export default function AdditionalSpecsEditor({ specs, setSpecs }) {
  const update = (i, key, val) => setSpecs((s) => s.map((e, idx) => (idx === i ? { ...e, [key]: val } : e)));
  const add = () => setSpecs((s) => (s.length < MAX ? [...s, { label: "", value: "" }] : s));
  const remove = (i) => setSpecs((s) => s.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {specs.map((e, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={e.label}
            onChange={(ev) => update(i, "label", ev.target.value)}
            maxLength={40}
            placeholder="Label (e.g. Bore size)"
            className="w-2/5 rounded-lg border border-border bg-background px-2.5 py-2 text-xs outline-none focus:border-primary"
          />
          <input
            value={e.value}
            onChange={(ev) => update(i, "value", ev.target.value)}
            maxLength={100}
            placeholder="Value"
            className="flex-1 rounded-lg border border-border bg-background px-2.5 py-2 text-xs outline-none focus:border-primary"
          />
          <button onClick={() => remove(i)} className="flex items-center justify-center rounded-lg border border-border px-2 text-muted-foreground hover:text-destructive">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {specs.length < MAX && (
        <button onClick={add} className="inline-flex items-center gap-1 text-xs font-bold text-primary">
          <Plus className="h-3.5 w-3.5" /> Add spec
        </button>
      )}
      <p className="text-[10px] text-muted-foreground">Optional — up to 10 label/value pairs. Not used for search.</p>
    </div>
  );
}