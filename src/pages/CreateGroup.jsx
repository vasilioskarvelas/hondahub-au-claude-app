import React from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Lock, Globe } from "lucide-react";

export default function CreateGroup() {
  const navigate = useNavigate();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [visibility, setVisibility] = React.useState("public");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const res = await base44.functions.invoke("group", { action: "createGroup", name: name.trim(), description: description.trim(), visibility });
      if (res.data?.ok) navigate(`/group/${res.data.group.id}`);
      else setError(res.data?.error || "Failed to create group");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <button onClick={() => navigate("/groups")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Groups</button>
      <div>
        <h1 className="text-2xl font-black tracking-tighter">Create a Group</h1>
        <p className="text-sm text-muted-foreground">Start a Honda club or community.</p>
      </div>
      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="e.g. K-Series Australia" className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="What's this group about?" className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Visibility</label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {[{ v: "public", l: "Public", i: Globe, d: "Anyone can find and join" }, { v: "private", l: "Private", i: Lock, d: "Join by request only" }].map((o) => {
              const Icon = o.i; const sel = visibility === o.v;
              return (
                <button key={o.v} type="button" onClick={() => setVisibility(o.v)} className={`rounded-xl border p-3 text-left ${sel ? "border-primary bg-primary/10" : "border-border bg-background"}`}>
                  <div className="flex items-center gap-1.5 text-sm font-bold"><Icon className="h-4 w-4" /> {o.l}</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{o.d}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <button disabled={busy || !name.trim()} onClick={submit} className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground glow-red disabled:opacity-50">
        {busy ? "Creating..." : "Create Group"}
      </button>
    </div>
  );
}