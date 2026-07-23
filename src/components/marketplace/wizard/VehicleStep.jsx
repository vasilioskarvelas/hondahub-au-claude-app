import React from "react";
import { Link } from "react-router-dom";
import { Car, Plus, CheckCircle2 } from "lucide-react";

// ADR-044 — Vehicle flow. The seller picks a Garage vehicle; its details are
// reused automatically (no manual re-entry of model/year/chassis/odometer).
export default function VehicleStep({ vehicles, primary_vehicle_id, onSelect }) {
  const selected = vehicles.find((v) => v.id === primary_vehicle_id);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black tracking-tight">Select your vehicle</h2>
        <p className="text-sm text-muted-foreground">Pick a vehicle from your garage. Its details are used automatically — no need to re-enter them.</p>
      </div>
      {vehicles.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <Car className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm font-bold">No vehicles in your garage</p>
          <p className="text-xs text-muted-foreground">Add a vehicle first, then come back to list it.</p>
          <Link to="/garage" className="mt-3 inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
            <Plus className="h-4 w-4" /> Add a vehicle
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {vehicles.map((v) => {
            const active = v.id === primary_vehicle_id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onSelect(v.id)}
                className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition ${active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
                  <Car className="h-5 w-5 text-muted-foreground" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{v.year} {v.make} {v.model}{v.nickname ? ` — ${v.nickname}` : ""}</span>
                  <span className="block truncate text-xs text-muted-foreground">{v.chassis_code ? `${v.chassis_code} · ` : ""}{v.odometer_km != null ? `${v.odometer_km.toLocaleString()} km` : "Unknown km"}</span>
                </span>
                {active && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      )}
      {selected && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Selected vehicle</p>
          <p className="mt-1 text-sm font-bold">{selected.year} {selected.make} {selected.model}{selected.chassis_code ? ` (${selected.chassis_code})` : ""}</p>
          <p className="text-xs text-muted-foreground">
            {selected.nickname ? `${selected.nickname} · ` : ""}
            {selected.odometer_km != null ? `${selected.odometer_km.toLocaleString()} km` : ""}
            {selected.engine_code ? ` · ${selected.engine_code}` : ""}
            {selected.transmission ? ` · ${selected.transmission}` : ""}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">These details are pulled from your garage — you can edit the title later.</p>
        </div>
      )}
    </div>
  );
}