import React from "react";
import { Link } from "react-router-dom";
import { Shield, Inbox, ArrowRight, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

const PRIORITY_META = {
  critical: { label: "Critical", cls: "bg-primary/15 text-primary border-primary/40" },
  high: { label: "High", cls: "bg-orange-500/15 text-orange-400 border-orange-500/40" },
  medium: { label: "Medium", cls: "bg-blue-500/15 text-blue-400 border-blue-500/40" },
  low: { label: "Low", cls: "bg-secondary text-muted-foreground border-border" },
};
const SEVERITY_META = {
  severe: { label: "Severe", cls: "text-destructive" },
  moderate: { label: "Moderate", cls: "text-amber-400" },
  minor: { label: "Minor", cls: "text-muted-foreground" },
};
const STATUS_LABEL = {
  open: "Open",
  assigned: "Assigned",
  in_review: "In Review",
  resolved_upheld: "Resolved · Upheld",
  resolved_dismissed: "Resolved · Dismissed",
  escalated: "Escalated",
};

export default function ModerationQueue() {
  const [cases, setCases] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [statusFilter, setStatusFilter] = React.useState("active");
  const [scope, setScope] = React.useState("all");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("moderation", { action: "listQueue" });
      if (res.data?.error) setError(res.data.error);
      else setCases(res.data?.cases || []);
    } catch (e) {
      setError(e.response?.data?.message || e.message || "Failed to load queue");
    } finally {
      setLoading(false);
    }
  };
  React.useEffect(() => { load(); }, []);

  const filtered = cases.filter((c) => {
    if (statusFilter === "active" && (c.status === "resolved_upheld" || c.status === "resolved_dismissed")) return false;
    if (statusFilter !== "active" && statusFilter !== "all" && c.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-black">Moderation Queue</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="active">Active cases</option>
          <option value="all">All</option>
          <option value="open">Open</option>
          <option value="assigned">Assigned</option>
          <option value="in_review">In Review</option>
          <option value="escalated">Escalated</option>
        </select>
        <button onClick={load} className="rounded-xl border border-border px-3 py-2 text-sm font-medium hover:text-primary">
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
          <button onClick={load} className="mt-2 block text-xs underline">Try again</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <Inbox className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No open cases.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => {
            const pm = PRIORITY_META[c.priority] || PRIORITY_META.medium;
            const sm = SEVERITY_META[c.severity] || SEVERITY_META.minor;
            return (
              <Link
                key={c.id}
                to={`/moderation/case/${c.id}`}
                className="block rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${pm.cls}`}>{pm.label}</span>
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {c.target_type} · {sm.label}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{STATUS_LABEL[c.status] || c.status}</span>
                    </div>
                    <p className="mt-1.5 truncate text-sm font-semibold">
                      {c.target_type}/{String(c.target_id).slice(0, 8)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {c.report_count} report{c.report_count === 1 ? "" : "s"} ·{" "}
                      {c.assigned_moderator_id ? "Assigned" : "Unassigned"}
                      {c.ai_priority_score != null && ` · AI ${c.ai_priority_score}`}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}