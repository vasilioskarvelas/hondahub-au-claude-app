import React from "react";
import {
  OWNERSHIP_RELATIONSHIP, BUILD_STATUS, VEHICLE_VISIBILITY,
  REGISTRATION_STATES, BODY_STYLES, DRIVETRAINS, FUEL_TYPES, callGarage,
} from "@/lib/garage";
import { Modal, Field, TextArea, Select, DateField, SaveButton } from "./FormKit";

export default function VehicleForm({ onClose, onSaved, vehicle }) {
  const editing = !!vehicle;
  const [form, setForm] = React.useState(vehicle || { make: "Honda", model: "", year: "", ownership_relationship: "current", build_status: "stock", sale_status: "not_for_sale", visibility: "public" });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const payload = { ...form, year: form.year ? Number(form.year) : undefined };
      const data = editing
        ? await callGarage("vehicle", { action: "update", vehicle_id: vehicle.id, ...payload })
        : await callGarage("vehicle", { action: "create", ...payload });
      if (data?.ok) onSaved(data.vehicle);
      else setError(data?.error?.message || "Save failed");
    } catch (e) {
      setError(e.response?.data?.error?.message || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? "Edit Vehicle" : "Add Vehicle"} onClose={onClose}>
      <div className="space-y-3">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</div>}
        <Field label="Nickname" value={form.nickname} onChange={(v) => set("nickname", v)} placeholder="Build name (optional)" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Make" value={form.make} onChange={(v) => set("make", v)} />
          <Field label="Model *" value={form.model} onChange={(v) => set("model", v)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Year *" type="number" value={form.year} onChange={(v) => set("year", v)} />
          <Field label="Generation" value={form.generation} onChange={(v) => set("generation", v)} placeholder="6th Gen Civic" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Chassis Code" value={form.chassis_code} onChange={(v) => set("chassis_code", v)} placeholder="EK9" />
          <Select label="Body Style" value={form.body_style} onChange={(v) => set("body_style", v)} options={BODY_STYLES} />
        </div>
        <Field label="Colour" value={form.colour} onChange={(v) => set("colour", v)} />
        <Field label="Trim" value={form.trim} onChange={(v) => set("trim", v)} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Engine Code" value={form.engine_code} onChange={(v) => set("engine_code", v)} />
          <Field label="Engine Capacity" type="number" value={form.engine_capacity} onChange={(v) => set("engine_capacity", v)} />
        </div>
        <Field label="Transmission" value={form.transmission} onChange={(v) => set("transmission", v)} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Drivetrain" value={form.drivetrain} onChange={(v) => set("drivetrain", v)} options={DRIVETRAINS} />
          <Select label="Fuel Type" value={form.fuel_type} onChange={(v) => set("fuel_type", v)} options={FUEL_TYPES} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Odometer (km)" type="number" value={form.odometer_km} onChange={(v) => set("odometer_km", v)} />
          <Field label="Power (kW)" type="number" value={form.power_kw} onChange={(v) => set("power_kw", v)} />
        </div>
        <Select label="Registration State" value={form.registration_state} onChange={(v) => set("registration_state", v)} options={REGISTRATION_STATES} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Ownership Relationship" value={form.ownership_relationship} onChange={(v) => set("ownership_relationship", v)} options={OWNERSHIP_RELATIONSHIP} />
          <Select label="Build Status" value={form.build_status} onChange={(v) => set("build_status", v)} options={BUILD_STATUS} />
        </div>
        <Select label="Visibility" value={form.visibility} onChange={(v) => set("visibility", v)} options={VEHICLE_VISIBILITY} />
        <DateField label="Purchase Date" value={form.purchase_date} onChange={(v) => set("purchase_date", v)} />
        <Field label="Purchase Price" type="number" value={form.purchase_price} onChange={(v) => set("purchase_price", v)} />
        <TextArea label="Build Goal" value={form.build_goal} onChange={(v) => set("build_goal", v)} />
        <TextArea label="Build Description" value={form.build_description} onChange={(v) => set("build_description", v)} />
      </div>
      <div className="mt-5">
        <SaveButton onSave={save} saving={saving} disabled={!form.model || !form.year} label={editing ? "Save Changes" : "Add Vehicle"} />
      </div>
    </Modal>
  );
}