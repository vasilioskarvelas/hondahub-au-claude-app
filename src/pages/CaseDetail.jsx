import React from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Shield, Loader2, Gavel, RotateCcw, ChevronUp, MessageSquarePlus } from "lucide-react";
import { base44 } from "@/api/base44Client";

const PRIORITY = ["low", "medium", "high", "critical"];
const SEVERITY = ["minor", "moderate", "severe"];
const ACTION_TYPES = [
  "warning", "content_removed", "listing_removed", "account_restricted",
  "account_suspended", "account_banned", "no_action", "content_restored", "other",
];
const STATUS_LABEL = {
  open: "Open", assigned: "Assigned", in_review: "In Review",
  resolved_upheld: "Resolved · Upheld", resolved_dismissed: "Resolved · Dismissed", escalated: "Escalated",
};

export default function CaseDetail() {
  const { id } = useParams();
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [note, setNote] = React.useState("");
  const [actionType, setActionType] = React.useState("content_removed");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("moderation", { action: "getCase", case_id: id });
      if (res.data?.error) setError(res.data.error);
      else setData(res.data);
    } catch (e) {
      setError(e.response?.data?.message || e.message || "Failed to load case");
    } finally {
      setLoading(false);
    }
  };
  React.useEffect(() => { load(); }, [id]);

  const call = async (payload, label) => {
    setBusy(true); setMsg(null);
    try {
      const res = await base44.functions.invoke("moderation", payload);
      if (res.data?.error) setMsg(`${label} failed: ${res.data.error}`);
      else { setMsg(`${label} done.`); await load(); }
    } catch (e) {
      setMsg(`${label} failed: ${e.response?.data?.error || e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const addNote = () => { if (note.trim()) call({ action: "addCaseNote", case_id: id, body: note.trim() }, "Note added"); setNote(""); };
  const applyAction = () => {
    if (!reason.trim()) { setMsg("Reason is required."); return; }
    const c = data.case;
    call({ action: "applyAction", case_id: id, action_type: actionType, reason: reason.trim(), target_type: c.target_type, target_id: c.target_id }, "Action applied");
    setReason("");
  };
  const resolve = (outcome) => call({ action: "resolveCase", case_id: id, outcome }, `Resolved (${outcome})`);
  const reopen = () => call({ action: "reopenCase", case_id: id }, "Reopened");
  const setPriority = (priority, severity) => call({ action: "setCasePriority", case_id: id, priority, severity }, "Priority updated");
  const resolveAppeal = (decision) => {
    const pending = data.actions.find((a) => a.appeal_status === "requested" || a.appeal_status === "under_review");
    if (!pending) { setMsg("No pending appeal."); return; }
    call({ action: "resolveAppeal", action_id: pending.id, decision }, `Appeal ${decision}`);
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (error) return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/moderation" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back</Link>
      <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
    </div>
  );
  if (!data) return null;
  const c = data.case;
  const resolved = c.status === "resolved_upheld" || c.status === "resolved_dismissed";
  const pendingAppeal = data.actions.some((a) => a.appeal_status === "requested" || a.appeal_status === "under_review");

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/moderation" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to queue</Link>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Shield className="h-4 w-4 text-primary" /> Case</div>
        <h1 className="mt-1 text-lg font-black">{c.target_type}/{String(c.target_id).slice(0, 8)}</h1>
        <p className="text-sm text-muted-foreground">Status: {STATUS_LABEL[c.status] || c.status}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select value={c.priority} onChange={(e) => setPriority(e.target.value, undefined)} className="rounded-xl border border-border bg-background px-2 py-1 text-xs" disabled={resolved}>
            {PRIORITY.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={c.severity} onChange={(e) => setPriority(undefined, e.target.value)} className="rounded-xl border border-border bg-background px-2 py-1 text-xs" disabled={resolved}>
            {SEVERITY.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="text-xs text-muted-foreground">{c.assigned_moderator_id ? "Assigned" : "Unassigned"}</span>
        </div>
      </div>

      {msg && <div className="rounded-lg border border-border bg-secondary/40 p-3 text-sm">{msg}</div>}

      {!resolved && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground"><Gavel className="h-4 w-4" /> Apply action</h2>
          <div className="mt-3 space-y-2">
            <select value={actionType} onChange={(e) => setActionType(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
              {ACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Reason (required)…" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
            <button onClick={applyAction} disabled={busy} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">Apply</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!resolved && <button onClick={() => resolve("upheld")} disabled={busy} className="rounded-xl border border-primary/40 px-4 py-2 text-sm font-medium text-primary disabled:opacity-50">Resolve · Upheld</button>}
        {!resolved && <button onClick={() => resolve("dismissed")} disabled={busy} className="rounded-xl border border-border px-4 py-2 text-sm font-medium disabled:opacity-50">Resolve · Dismissed</button>}
        {resolved && <button onClick={reopen} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium disabled:opacity-50"><RotateCcw className="h-4 w-4" /> Reopen</button>}
        {pendingAppeal && <button onClick={() => resolveAppeal("overturned")} disabled={busy} className="rounded-xl border border-amber-500/40 px-4 py-2 text-sm font-medium text-amber-400 disabled:opacity-50">Appeal · Overturn</button>}
        {pendingAppeal && <button onClick={() => resolveAppeal("upheld")} disabled={busy} className="rounded-xl border border-border px-4 py-2 text-sm font-medium disabled:opacity-50">Appeal · Uphold</button>}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Consolidated reports ({data.reports.length})</h2>
        {data.reports.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No consolidated reports (case created directly).</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {data.reports.map((r) => (
              <li key={r.id} className="rounded-xl border border-border bg-background p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold capitalize">{r.category}</span>
                  <span className="text-xs text-muted-foreground">{r.status}</span>
                </div>
                {r.description && <p className="mt-1 text-muted-foreground">{r.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground"><MessageSquarePlus className="h-4 w-4" /> Notes ({data.notes.length})</h2>
        <ul className="mt-2 space-y-2">
          {data.notes.map((n) => (
            <li key={n.id} className="rounded-xl border border-border bg-background p-3 text-sm">
              <p className="whitespace-pre-wrap">{n.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">{new Date(n.created_date).toLocaleString()}</p>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm" />
          <button onClick={addNote} disabled={busy} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">Add</button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Action history ({data.actions.length})</h2>
        {data.actions.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No actions yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {data.actions.map((a) => (
              <li key={a.id} className="rounded-xl border border-border bg-background p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{a.action_type}</span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">appeal: {a.appeal_status}</span>
                </div>
                <p className="mt-1 text-muted-foreground">{a.reason}</p>
                <p className="mt-1 text-xs text-muted-foreground">{a.actor} · {new Date(a.created_date).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}