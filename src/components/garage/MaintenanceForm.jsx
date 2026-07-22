import React from "react";
import { MAINTENANCE_TYPES, SERVICE_PROVIDER_TYPE, callGarage } from "@/lib/garage";
import { Modal, Field, TextArea, Select, DateField, SaveButton } from "./FormKit";

export default function MaintenanceForm({ vehicleId, record, onClose, onSaved }) {
  const editing = !!record;
  const [form, setForm] = React.useState(record || { maintenance_type: "oil_change", service_provider_type: "self", service_date: "" });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const payload = {
        ...form,
        cost: form.cost ? Number(form.cost) : undefined,
        odometer_km: form.odometer_km ? Number(form.odometer_km) : undefined,
        next_service_odometer_km: form.next_service_odometer_km ? Number(form.next_service_odometer_km) : undefined,
        vehicle_id: vehicleId,
      };
      const data = editing
        ? await callGarage("maintenance", { action: "updateRecord", record_id: record.id, ...payload })
        : await callGarage("maintenance", { action: "createRecord", ...payload });
      if (data?.ok) onSaved(data);
      else setError(data?.error?.message || "Save failed");
    } catch (e) {
      setError(e.response?.data?.error?.message || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? "Edit Maintenance Record" : "Log Maintenance"} onClose={onClose}>
      <div className="space-y-3">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</div>}
        <Select label="Maintenance Type *" value={form.maintenance_type} onChange={(v) => set("maintenance_type", v)} options={MAINTENANCE_TYPES} />
        <Field label="Title (optional)" value={form.title} onChange={(v) => set("title", v)} placeholder="Falls back to maintenance type" />
        <DateField label="Service Date *" value={form.service_date} onChange={(v) => set("service_date", v)} />
        <Field label="Odometer (km)" type="number" value={form.odometer_km} onChange={(v) => set("odometer_km", v)} />
        <Select label="Service Provider Type" value={form.service_provider_type} onChange={(v) => set("service_provider_type", v)} options={SERVICE_PROVIDER_TYPE} />
        {form.service_provider_type === "business" && (
          <Field label="Serviced by Business ID" value={form.serviced_by_business_id} onChange={(v) => set("serviced_by_business_id", v)} placeholder="Verified Business id" />
        )}
        <Field label="Service Provider Name (freetext)" value={form.service_provider_name_freetext} onChange={(v) => set("service_provider_name_freetext", v)} />
        <Field label="Cost" type="number" value={form.cost} onChange={(v) => set("cost", v)} />
        <div className="grid grid-cols-2 gap-3">
          <DateField label="Next Service Date" value={form.next_service_date} onChange={(v) => set("next_service_date", v)} />
          <Field label="Next Service (km)" type="number" value={form.next_service_odometer_km} onChange={(v) => set("next_service_odometer_km", v)} />
        </div>
        <TextArea label="Description" value={form.description} onChange={(v) => set("description", v)} rows={2} />
      </div>
      <div className="mt-5">
        <SaveButton onSave={save} saving={saving} disabled={!form.maintenance_type || !form.service_date} label={editing ? "Save Changes" : "Log Maintenance"} />
      </div>
    </Modal>
  );
}