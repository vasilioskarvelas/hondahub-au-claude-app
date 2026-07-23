import React from "react";
import { Car, Cog, Wind, Circle, Settings, Cpu, Armchair, Zap, Wrench, Package } from "lucide-react";
import { PART_CATEGORIES } from "./constants";

const ICONS = {
  engine: Cog, transmission: Settings, forced_induction: Wind, wheels_tyres: Circle,
  suspension: Cog, brakes: Cog, electronics: Cpu, interior: Armchair, exterior: Car,
  performance_part: Zap, tools_equipment: Wrench, other: Package,
};

export default function CategoryStep({ category, onSelect }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black tracking-tight">What kind of part?</h2>
        <p className="text-sm text-muted-foreground">Choose the closest category — fields adapt to your choice.</p>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {PART_CATEGORIES.map((c) => {
          const Icon = ICONS[c.v] || Package;
          const active = category === c.v;
          return (
            <button
              key={c.v}
              type="button"
              onClick={() => onSelect(c.v)}
              className={`flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition ${active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </span>
              <span className="text-sm font-bold">{c.l}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}