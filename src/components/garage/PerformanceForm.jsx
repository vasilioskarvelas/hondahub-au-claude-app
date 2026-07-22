import React from "react";
import { PERFORMANCE_TYPES, FUEL_TYPES, callGarage, pretty } from "@/lib/garage";
import { Modal, Field, TextArea, Select, DateField, SaveButton } from "./FormKit";

const NUM_FIELDS = [
  "power_kw", "torque_nm", "quarter_mile_seconds", "trap_speed_kmh",
  "eighth_mile_seconds", "zero_to_hundred_seconds", "lap_time_seconds", "boost_psi",
];

export default function PerformanceForm({ vehicleId, record, onClose, onSaved }) {
  const editing = !!record;
  const [form, setForm] = React.useState(record || { performance_type: "dyno", result_date: "" });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const payload = { ...form, vehicle_id: vehicleId };
      for (const f of NUM_FIELDS) {
        if (payload[f] !== undefined && payload[f] !== "") payload[f] = Number(payload[f]);
        else if (payload[f] === "") delete payload[f];
      }
      const data = editing
        ? await callGarage("performance", { action: "updateRecord", record_id: record.id, ...payload })
        : await callGarage("performance", { action: "createRecord", ...payload });
      if (data?.ok) onSaved(data);
      else setError(data?.error?.message || "Save failed");
    } catch (e) {
      setError(e.response?.data?.error?.message || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? "Edit Performance Record" : "Log Performance Result"} onClose={onClose}>
      <div className="space-y-3">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</div>}
        <Select label="Performance Type *" value={form.performance_type} onChange={(v) => set("performance_type", v)} options={PERFORMANCE_TYPES} />
        <DateField label="Result Date *" value={form.result_date} onChange={(v) => set("result_date", v)} />
        <Field label="Venue Name" value={form.venue_name} onChange={(v) => set("venue_name", v)} placeholder="Dyno shop / drag strip / circuit" />
        <Field label="Title (optional)" value={form.title} onChange={(v) => set("title", v)} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Power (kW)" type="number" value={form.power_kw} onChange={(v) => set("power_kw", v)} />
          <Field label="Torque (Nm)" type="number" value={form.torque_nm} onChange={(v) => set("torque_nm", v)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="¼ Mile (s)" type="number" value={form.quarter_mile_seconds} onChange={(v) => set("quarter_mile_seconds", v)} />
          <Field label="Trap Speed (km/h)" type="number" value={form.trap_speed_kmh} onChange={(v) => set("trap_speed_kmh", v)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="⅛ Mile (s)" type="number" value={form.eighth_mile_seconds} onChange={(v) => set("eighth_mile_seconds", v)} />
          <Field label="0–100 (s)" type="number" value={form.zero_to_hundred_seconds} onChange={(v) => set("zero_to_hundred_seconds", v)} />
        </div>
        <Field label="Lap Time (s)" type="number" value={form.lap_time_seconds} onChange={(v) => set("lap_time_seconds", v)} />
        <Field label="Boost (psi)" type="number" value={form.boost_psi} onChange={(v) => set("boost_psi", v)} />
        <Field label="Dyno Type" value={form.dyno_type} onChange={(v) => set("dyno_type", v)} placeholder="Dynapack / Mainline" />
        <Select label="Fuel at Test" value={form.fuel_type_at_test} onChange={(v) => set("fuel_type_at_test", v)} options={FUEL_TYPES} />
        <Field label="Tyre Description" value={form.tyre_description} onChange={(v) => set("tyre_description", v)} />
        <TextArea label="Notes" value={form.notes} onChange={(v) => set("notes", v)} rows={2} />
      </div>
      <div className="mt-5">
        <SaveButton onSave={save} saving={saving} disabled={!form.performance_type || !form.result_date} label={editing ? "Save Changes" : "Log Result"} />
      </div>
    </Modal>
  );
}