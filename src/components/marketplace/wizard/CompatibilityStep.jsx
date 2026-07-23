import React from "react";
import { inputCls } from "./constants";

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

export default function CompatibilityStep({ f, field }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black tracking-tight">Compatibility</h2>
        <p className="text-sm text-muted-foreground">Which vehicles does this part fit? Optional, but helps buyers find it.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Make"><input value={f.compatible_make} onChange={(e) => field("compatible_make", e.target.value)} placeholder="Honda" className={inputCls} /></Field>
        <Field label="Model"><input value={f.compatible_model} onChange={(e) => field("compatible_model", e.target.value)} placeholder="Civic" className={inputCls} /></Field>
        <Field label="Chassis code"><input value={f.compatible_chassis_code} onChange={(e) => field("compatible_chassis_code", e.target.value)} placeholder="EK9" className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Year from"><input type="number" value={f.compatible_year_from} onChange={(e) => field("compatible_year_from", e.target.value)} placeholder="1998" className={inputCls} /></Field>
          <Field label="Year to"><input type="number" value={f.compatible_year_to} onChange={(e) => field("compatible_year_to", e.target.value)} placeholder="2000" className={inputCls} /></Field>
        </div>
      </div>
    </div>
  );
}