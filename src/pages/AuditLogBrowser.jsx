import React from "react";
import { Link } from "react-router-dom";
import { ScrollText, Loader2, Shield } from "lucide-react";
import { base44 } from "@/api/base44Client";

const ACTIONS = [
  "vehicle_verification_approved",
  "business_status_changed",
  "listing_removed_by_moderation",
  "trust_tier_overridden",
  "financial_change_approved",
];

export default function AuditLogBrowser() {
  const [logs, setLogs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [filter, setFilter] = React.useState({ action: "", target_type: "" });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = { action: "listAuditLog", limit: 200 };
      if (filter.action) payload.action = filter.action;
      if (filter.target_type) payload.target_type = filter.target_type;
      const res = await base44.functions.invoke("moderation", payload);
      if (res.data?.error) setError(res.data.error);
      else setLogs(res.data?.logs || []);
    } catch (e) {
      setError(e.response?.data?.message || e.message || "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  };
  React.useEffect(() => { load(); }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center gap-2">
        <ScrollText className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-black">Audit Log</h1>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">Admin</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={filter.action} onChange={(e) => setFilter({ ...filter, action: e.target.value })} className="rounded-xl border border-border bg-card px-3 py-2 text-sm">
          <option value="">All actions</option>
          {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input
          value={filter.target_type}
          onChange={(e) => setFilter({ ...filter, target_type: e.target.value })}
          placeholder="target_type"
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
        />
        <button onClick={load} className="rounded-xl border border-border px-3 py-2 text-sm font-medium hover:text-primary">Filter</button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
          {error.includes("admin") && <p className="mt-1 text-xs">Only Admins can read the full audit log.</p>}
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <Shield className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No audit entries.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {logs.map((l) => (
            <li key={l.id} className="rounded-2xl border border-border bg-card p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-primary">{l.action}</span>
                <span className="text-xs text-muted-foreground">{new Date(l.created_date).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                actor: {l.actor_type}{l.actor_id ? ` (${String(l.actor_id).slice(0, 8)})` : ""} · target: {l.target_type}/{l.target_id ? String(l.target_id).slice(0, 8) : "—"}
              </p>
              {l.context && <p className="mt-1.5 text-muted-foreground">{l.context}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}