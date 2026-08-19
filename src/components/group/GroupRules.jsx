import React from "react";
import { base44 } from "@/api/base44Client";
import { ScrollText, Plus, X, Pencil, Check } from "lucide-react";

export default function GroupRules({ groupId, rules, isOwner, onUpdate }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(rules || []);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => { setDraft(rules || []); }, [rules]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await base44.functions.invoke("group", { action: "updateRules", group_id: groupId, rules: draft.map((r) => r.trim()).filter(Boolean) });
      if (res.data?.ok) { onUpdate?.(res.data.rules); setEditing(false); }
    } finally { setBusy(false); }
  };

  if (!isOwner && (!rules || rules.length === 0)) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted-foreground"><ScrollText className="h-4 w-4" /> Group Rules</h2>
        {isOwner && !editing && <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-xs font-bold text-primary"><Pencil className="h-3.5 w-3.5" /> Edit</button>}
      </div>
      {editing ? (
        <div className="mt-3 space-y-2">
          {draft.map((r, i) => (
            <div key={i} className="flex gap-2">
              <input value={r} onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? e.target.value : x)))} className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" maxLength={200} placeholder={`Rule ${i + 1}`} />
              <button onClick={() => setDraft((d) => d.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
            </div>
          ))}
          <button onClick={() => setDraft((d) => [...d, ""])} className="inline-flex items-center gap-1 text-xs font-bold text-primary"><Plus className="h-3.5 w-3.5" /> Add rule</button>
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"><Check className="h-3.5 w-3.5" /> Save</button>
            <button onClick={() => { setDraft(rules || []); setEditing(false); }} className="rounded-lg border border-border px-3 py-1.5 text-xs">Cancel</button>
          </div>
        </div>
      ) : rules?.length > 0 ? (
        <ol className="mt-3 space-y-1.5">
          {rules.map((r, i) => <li key={i} className="flex gap-2 text-sm"><span className="font-bold text-primary">{i + 1}.</span><span className="text-muted-foreground">{r}</span></li>)}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">No rules set yet.</p>
      )}
    </div>
  );
}