import React from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Select as RadixSelect, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";

export const CHASSIS_CODES = ["EG", "EK", "EM1", "EP3", "DC2", "DC5", "CL9", "CL7", "CU2", "FD2", "FN2", "AP1", "AP2", "BB", "GD", "GE", "GK"];
export const ENGINE_CODES = ["K20A", "K20A2", "K20Z1", "K20Z4", "K24A3", "K24A1", "K24Z", "B16A", "B18C", "B18CR", "D16Y", "H22A", "F20C", "J-series"];
export const AU_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
export const PART_CATEGORIES = ["Engines", "Gearboxes", "ECUs", "Wiring Looms", "Mounts", "Brakes", "Wheels", "Tyres", "Coilovers", "Exhausts", "Turbo Kits", "Supercharger Kits", "Intake Manifolds", "Body Panels", "Interiors", "Seats", "Steering Wheels", "Spoilers", "Headlights", "Taillights", "Diffs", "Axles", "Fuel Systems", "Audio"];

export default function Filters({ filters, setFilters, onSearch, onTypeChange }) {
  const [open, setOpen] = React.useState(false);
  const update = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  return (
    <div className="mb-4 space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={filters.q || ""}
          onChange={(e) => update("q", e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder="Search Honda, chassis, engine, part..."
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-4 text-sm outline-none focus:border-primary"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:border-primary"
        >
          <SlidersHorizontal className="h-4 w-4" /> Filters
        </button>
        {[
          { key: "type", label: "All", value: "" },
          { key: "type", label: "Cars", value: "car" },
          { key: "type", label: "Parts", value: "part" },
        ].map((t) => (
          <button
            key={t.label}
            onClick={() => { update("type", t.value); if (onTypeChange) onTypeChange(t.value); }}
            className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
              (filters.type || "") === t.value
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card hover:border-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {open && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-bold">Honda Filters</h4>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FilterSelect label="Chassis Code" value={filters.chassis_code || ""} onChange={(v) => update("chassis_code", v)} options={CHASSIS_CODES} />
            <FilterSelect label="Engine Code" value={filters.engine_code || ""} onChange={(v) => update("engine_code", v)} options={ENGINE_CODES} />
            <FilterSelect label="State" value={filters.state || ""} onChange={(v) => update("state", v)} options={AU_STATES} />
            <FilterSelect label="Transmission" value={filters.transmission || ""} onChange={(v) => update("transmission", v)} options={["manual", "auto"]} />
            <FilterSelect label="Condition" value={filters.condition || ""} onChange={(v) => update("condition", v)} options={["new", "used", "refurbished", "for_parts"]} />
            <FilterSelect label="Car Type" value={filters.car_type || ""} onChange={(v) => update("car_type", v)} options={["street", "track", "project", "wrecking", "show"]} />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <ToggleChip label="Swap accepted" active={filters.swap_accepted} onClick={() => update("swap_accepted", !filters.swap_accepted)} />
            <ToggleChip label="Postage available" active={filters.postage_available} onClick={() => update("postage_available", !filters.postage_available)} />
            <ToggleChip label="Registered" active={filters.registered} onClick={() => update("registered", !filters.registered)} />
            <ToggleChip label="Roadworthy" active={filters.roadworthy} onClick={() => update("roadworthy", !filters.roadworthy)} />
            <ToggleChip label="Turbo" active={filters.is_turbo} onClick={() => update("is_turbo", !filters.is_turbo)} />
            <ToggleChip label="Urgent" active={filters.urgent} onClick={() => update("urgent", !filters.urgent)} />
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={onSearch} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground">
              Apply Filters
            </button>
            <button
              onClick={() => { setFilters({ type: filters.type || "" }); }}
              className="rounded-xl border border-border px-4 text-sm font-medium hover:border-primary"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <RadixSelect value={value || "__any__"} onValueChange={(v) => onChange(v === "__any__" ? "" : v)}>
        <SelectTrigger className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm">
          <SelectValue placeholder="Any" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__any__">Any</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ))}
        </SelectContent>
      </RadixSelect>
    </div>
  );
}

function ToggleChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
        active ? "bg-primary text-primary-foreground" : "border border-border bg-secondary text-muted-foreground"
      }`}
    >
      {label}
    </button>
  );
}