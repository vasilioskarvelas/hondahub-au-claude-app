import React from "react";
import { MOD_CATEGORIES, INSTALLATION_TYPE, MOD_STATUS, callGarage, pretty } from "@/lib/garage";
import { Modal, Field, TextArea, Select, DateField, SaveButton } from "./FormKit";

export default function ModificationForm({ vehicleId, modification, onClose, onSaved }) {
  const editing = !!modification;
  const [form, setForm] = React.useState(modification || { category: "engine", installation_type: "unknown", status: "installed" });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const payload = {
        ...form,
        cost: form.cost ? Number(form.cost) : undefined,
        vehicle_id: vehicleId,
      };
      const data = editing
        ? await callGarage("modification", { action: "update", modification_id: modification.id, ...payload })
        : await callGarage("modification", { action: "create", ...payload });
      if (data?.ok) onSaved(data);
      else setError(data?.error?.message || "Save failed");
    } catch (e) {
      setError(e.response?.data?.error?.message || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? "Edit Modification" : "Add Modification"} onClose={onClose}>
      <div className="space-y-3">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</div>}
        <Select label="Category *" value={form.category} onChange={(v) => set("category", v)} options={MOD_CATEGORIES} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand" value={form.brand} onChange={(v) => set("brand", v)} />
          <Field label="Product Name" value={form.product_name} onChange={(v) => set("product_name", v)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Part Number" value={form.part_number} onChange={(v) => set("part_number", v)} />
          <Select label="Status" value={form.status} onChange={(v) => set("status", v)} options={MOD_STATUS} />
        </div>
        <Select label="Installation Type" value={form.installation_type} onChange={(v) => set("installation_type", v)} options={INSTALLATION_TYPE} />
        {["workshop", "dealer"].includes(form.installation_type) && (
          <Field
            label="Installed by Business ID"
            value={form.installed_by_business_id}
            onChange={(v) => set("installed_by_business_id", v)}
            placeholder="Verified Business id (tag)"
          />
        )}
        <Field label="Installer Name (freetext fallback)" value={form.installer_name_freetext} onChange={(v) => set("installer_name_freetext", v)} />
        <div className="grid grid-cols-2 gap-3">
          <DateField label="Purchase Date" value={form.purchase_date} onChange={(v) => set("purchase_date", v)} />
          <DateField label="Installation Date" value={form.installation_date} onChange={(v) => set("installation_date", v)} />
        </div>
        <Field label="Cost" type="number" value={form.cost} onChange={(v) => set("cost", v)} />
        <Field label="Product Link" value={form.product_link} onChange={(v) => set("product_link", v)} placeholder="https://…" />
        <TextArea label="Notes" value={form.notes} onChange={(v) => set("notes", v)} rows={2} />
      </div>
      <div className="mt-5">
        <SaveButton onSave={save} saving={saving} disabled={!form.category} label={editing ? "Save Changes" : "Add Modification"} />
      </div>
    </Modal>
  );
}