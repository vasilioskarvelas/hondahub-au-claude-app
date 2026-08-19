import React from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Loader2, X } from "lucide-react";

// Minimal inline vehicle creator for contexts where the user is picking a
// vehicle to bring (e.g. event attendance) but doesn't yet have it in their
// garage. Calls the vehicle backend `create` action and returns the new vehicle.
export default function AddVehicleInline({ onCreated, onCancel }) {
  const [year, setYear] = React.useState("");
  const [model, setModel] = React.useState("");
  const [nickname, setNickname] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const y = Number(year);
    if (!model.trim() || !y) { setError("Year and model are required."); return; }
    setBusy(true);
    try {
      const res = await base44.functions.invoke("vehicle", {
        action: "create",
        make: "Honda",
        model: model.trim(),
        year: y,
        nickname: nickname.trim() || undefined,
      });
      if (res.data?.ok && res.data?.vehicle) {
        onCreated(res.data.vehicle);
      } else {
        setError(res.data?.error?.message || res.data?.error || "Could not add vehicle");
      }
    } catch (e2) {
      setError(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-2 space-y-2 rounded-xl border border-border bg-background/60 p-3">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-primary"><Plus className="h-3 w-3" /> Add a vehicle</span>
        <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input inputMode="numeric" placeholder="Year" value={year} onChange={(e) => setYear(e.target.value)} className="rounded-lg border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary" />
        <input placeholder="Model" value={model} onChange={(e) => setModel(e.target.value)} className="col-span-2 rounded-lg border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary" />
      </div>
      <input placeholder="Nickname (optional)" value={nickname} onChange={(e) => setNickname(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary" />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add to garage
      </button>
    </form>
  );
}