import React from "react";

// ADR-042 — read-only display of category-specific attributes. For vehicle
// listings, the linked Vehicle record's data is shown instead (§2 — pulled from
// the Vehicle, never re-entered by the seller).

const LABELS = {
  brand: "Brand",
  oem_or_aftermarket: "OEM/Aftermarket",
  shipping_available: "Shipping",
  pickup_available: "Pickup",
  shipping_cost_cents: "Shipping cost",
  wheel_diameter_inches: "Diameter",
  wheel_width_inches: "Width",
  wheel_offset_mm: "Offset",
  wheel_pcd: "PCD",
  wheel_quantity: "Qty",
  tyres_included: "Tyres included",
  tyre_tread_percentage: "Tread %",
  component_kilometres: "Component km",
  tested_before_listing: "Tested",
  warranty_included: "Warranty",
  lock_status: "Lock status",
  tuned: "Tuned",
};

function fmt(key, v) {
  if (v === true) return "Yes";
  if (v === false) return "No";
  if (key === "shipping_cost_cents") return `$${(v / 100).toLocaleString()}`;
  if (["oem_or_aftermarket", "tested_before_listing", "lock_status"].includes(key)) return String(v).replace(/_/g, " ");
  if (key === "component_kilometres") return `${Number(v).toLocaleString()} km`;
  return String(v);
}

function Row({ label, value }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}</span>
      <br />
      <span className="font-bold capitalize">{value}</span>
    </div>
  );
}

export default function CategoryAttributeDisplay({ listing, vehicle }) {
  if (!listing) return null;
  const rows = [];

  if (listing.category === "vehicle" && vehicle) {
    const v = vehicle;
    rows.push(["Vehicle", `${v.year || ""} ${v.make || ""} ${v.model || ""}${v.nickname ? ` — ${v.nickname}` : ""}`.trim()]);
    if (v.chassis_code) rows.push(["Chassis code", v.chassis_code]);
    if (v.generation) rows.push(["Generation", v.generation]);
    if (v.body_style) rows.push(["Body style", v.body_style]);
    if (v.colour) rows.push(["Colour", v.colour]);
    if (v.trim) rows.push(["Trim", v.trim]);
    if (v.engine_code) rows.push(["Engine code", v.engine_code]);
    if (v.engine_capacity != null) rows.push(["Capacity", `${v.engine_capacity} cc`]);
    if (v.transmission) rows.push(["Transmission", v.transmission]);
    if (v.drivetrain) rows.push(["Drivetrain", v.drivetrain]);
    if (v.fuel_type) rows.push(["Fuel", v.fuel_type]);
    if (v.odometer_km != null) rows.push(["Odometer", `${Number(v.odometer_km).toLocaleString()} km`]);
    if (v.power_kw != null) rows.push(["Power", `${v.power_kw} kW`]);
    if (v.registration_state) rows.push(["Reg. state", v.registration_state]);
    if (v.build_status) rows.push(["Build status", v.build_status]);
    if (v.sale_status) rows.push(["Sale status", v.sale_status]);
    if (v.build_description) rows.push(["Build notes", v.build_description]);
  } else if (listing.category !== "vehicle") {
    for (const [key, label] of Object.entries(LABELS)) {
      const val = listing[key];
      if (val === null || val === undefined || val === "") continue;
      rows.push([label, fmt(key, val)]);
    }
  }

  if (rows.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
      {rows.map(([label, value], i) => (
        <Row key={i} label={label} value={value} />
      ))}
    </div>
  );
}