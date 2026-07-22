import React from "react";
import { pretty } from "@/lib/garage";

function Row({ label, value }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex justify-between gap-3 border-b border-border/50 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{String(value)}</dd>
    </div>
  );
}

export default function SpecDisplay({ vehicle }) {
  return (
    <dl className="rounded-2xl border border-border bg-card p-4">
      <Row label="Make" value={vehicle.make} />
      <Row label="Model" value={vehicle.model} />
      <Row label="Year" value={vehicle.year} />
      <Row label="Generation" value={vehicle.generation} />
      <Row label="Chassis Code" value={vehicle.chassis_code} />
      <Row label="Body Style" value={pretty(vehicle.body_style)} />
      <Row label="Colour" value={vehicle.colour} />
      <Row label="Trim" value={vehicle.trim} />
      <Row label="Engine Code" value={vehicle.engine_code} />
      <Row label="Engine Capacity" value={vehicle.engine_capacity ? `${vehicle.engine_capacity}` : null} />
      <Row label="Transmission" value={vehicle.transmission} />
      <Row label="Drivetrain" value={pretty(vehicle.drivetrain)} />
      <Row label="Fuel Type" value={pretty(vehicle.fuel_type)} />
      <Row label="Odometer (km)" value={vehicle.odometer_km} />
      <Row label="Power (kW)" value={vehicle.power_kw} />
      <Row label="Registration State" value={vehicle.registration_state} />
      <Row label="Build Goal" value={vehicle.build_goal} />
      <Row label="Build Description" value={vehicle.build_description} />
      {/* No VIN or registration-number field is shown — none exists on the entity. */}
    </dl>
  );
}