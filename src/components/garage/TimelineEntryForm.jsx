import React from "react";
import { ENTRY_TYPES, VEHICLE_VISIBILITY, callGarage } from "@/lib/garage";
import { Modal, Field, TextArea, Select, DateField, SaveButton } from "./FormKit";

/**
 * TimelineEntryForm handles two flows:
 *  - manual entry creation (action: createEntry, origin: manual)
 *  - confirming an auto-suggestion (action: createFromConfirmedSuggestion, origin: system_generated)
 *    The suggestion is NEVER silently auto-published — this confirmation dialog
 *    is the explicit user gate required by the Phase 03 spec.
 */
export default function TimelineEntryForm({ vehicleId, suggestion, onClose, onSaved }) {
  const isSuggestion = !!suggestion;
  const [form, setForm] = React.useState(
    suggestion
      ? { entry_type: suggestion.entry_type, entry_date: suggestion.entry_date, title: suggestion.title, description: suggestion.description, visibility: "public" }
      : { entry_type: "general_update", entry_date: "", title: "", description: "", visibility: "public" },
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const payload = { ...form, vehicle_id: vehicleId };
      const data = isSuggestion
        ? await callGarage("timeline", {
            action: "createFromConfirmedSuggestion",
            confirmed: true,
            ...suggestion,
            ...payload,
            title: form.title,
            description: form.description,
            visibility: form.visibility,
          })
        : await callGarage("timeline", { action: "createEntry", ...payload });
      if (data?.ok) onSaved(data);
      else setError(data?.error?.message || "Save failed");
    } catch (e) {
      setError(e.response?.data?.error?.message || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={isSuggestion ? "Confirm Timeline Entry" : "Add Timeline Entry"} onClose={onClose}>
      {isSuggestion && (
        <div className="mb-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-300">
          This entry was auto-suggested from a recent event. Review and confirm to publish — it is not published automatically.
        </div>
      )}
      <div className="space-y-3">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</div>}
        <Select label="Entry Type" value={form.entry_type} onChange={(v) => set("entry_type", v)} options={ENTRY_TYPES} />
        <Field label="Title *" value={form.title} onChange={(v) => set("title", v)} />
        <DateField label="Entry Date *" value={form.entry_date} onChange={(v) => set("entry_date", v)} />
        <Select label="Visibility" value={form.visibility} onChange={(v) => set("visibility", v)} options={VEHICLE_VISIBILITY} />
        <TextArea label="Description" value={form.description} onChange={(v) => set("description", v)} />
      </div>
      <div className="mt-5">
        <SaveButton onSave={save} saving={saving} disabled={!form.title || !form.entry_date} label={isSuggestion ? "Publish Entry" : "Add Entry"} />
      </div>
    </Modal>
  );
}