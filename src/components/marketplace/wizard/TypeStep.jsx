import React from "react";
import { Car, Cog } from "lucide-react";

// ADR-044 — the first screen. Shows ONLY the two selection cards; choosing
// one drives the rest of the wizard. No listing fields are rendered here.
export default function TypeStep({ flow, onChoose }) {
  const cards = [
    { v: "vehicle", l: "Vehicle", d: "Sell a complete vehicle.", Icon: Car },
    { v: "part", l: "Part", d: "Sell a car part or accessory.", Icon: Cog },
  ];
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-black tracking-tight">What are you selling?</h2>
        <p className="text-sm text-muted-foreground">Choose one to get started.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map(({ v, l, d, Icon }) => (
          <button
            key={v}
            type="button"
            onClick={() => onChoose(v)}
            className={`flex flex-col items-start gap-2 rounded-2xl border-2 p-5 text-left transition active:scale-[0.99] ${flow === v ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-secondary/40"}`}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Icon className="h-6 w-6 text-primary" />
            </span>
            <span className="text-lg font-black">{l}</span>
            <span className="text-sm text-muted-foreground">{d}</span>
          </button>
        ))}
      </div>
    </div>
  );
}