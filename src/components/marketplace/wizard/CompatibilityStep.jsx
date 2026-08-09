import React from "react";
import { inputCls } from "./constants";

const MODELS = [
  { v: "civic", l: "Civic" },
  { v: "integra", l: "Integra" },
  { v: "accord", l: "Accord" },
  { v: "crv", l: "CR-V" },
  { v: "s2000", l: "S2000" },
  { v: "nsx", l: "NSX" },
  { v: "other", l: "Other" },
];

const CHASSIS_CODES = [
  { v: "eg", l: "EG" },
  { v: "ek", l: "EK" },
  { v: "dc2", l: "DC2" },
  { v: "dc5", l: "DC5" },
  { v: "ep3", l: "EP3" },
  { v: "fn2", l: "FN2" },
  { v: "cl7", l: "CL7" },
  { v: "cl9", l: "CL9" },
  { v: "fd2", l: "FD2" },
  { v: "fk8", l: "FK8" },
  { v: "fl5", l: "FL5" },
  { v: "other", l: "Other" },
];

const ENGINE_FAMILIES = [
  { v: "d_series", l: "D-Series" },
  { v: "b_series", l: "B-Series" },
  { v: "k_series", l: "K-Series" },
  { v: "j_series", l: "J-Series" },
  { v: "f_series", l: "F-Series" },
  { v: "h_series", l: "H-Series" },
  { v: "other", l: "Other" },
];

function ChipSelect({ label, options, values, onToggle }) {
  return (
    <div>
      <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</label>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((o) => {
          const sel = values.includes(o.v);
          return (
            <button
              key={o.v}
              type="button"
              onClick={() => onToggle(o.v)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${sel ? "bg-primary text-primary-foreground" : "border border-border bg-background text-muted-foreground"}`}
            >
              {o.l}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function CompatibilityStep({ f, field }) {
  const toggle = (key, val) => {
    const current = Array.isArray(f[key]) ? f[key] : [];
    const next = current.includes(val) ? current.filter((v) => v !== val) : [...current, val];
    field(key, next);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black tracking-tight">Compatibility</h2>
        <p className="text-sm text-muted-foreground">Which vehicles does this part fit? Optional, but helps buyers find it.</p>
      </div>
      <ChipSelect label="Models" options={MODELS} values={f.compatible_models || []} onToggle={(v) => toggle("compatible_models", v)} />
      <ChipSelect label="Chassis codes" options={CHASSIS_CODES} values={f.compatible_chassis_codes || []} onToggle={(v) => toggle("compatible_chassis_codes", v)} />
      <ChipSelect label="Engine families" options={ENGINE_FAMILIES} values={f.compatible_engine_families || []} onToggle={(v) => toggle("compatible_engine_families", v)} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Year from</label>
          <input type="number" value={f.compatible_year_from ?? ""} onChange={(e) => field("compatible_year_from", e.target.value)} placeholder="1998" className={inputCls} />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Year to</label>
          <input type="number" value={f.compatible_year_to ?? ""} onChange={(e) => field("compatible_year_to", e.target.value)} placeholder="2000" className={inputCls} />
        </div>
      </div>
    </div>
  );
}