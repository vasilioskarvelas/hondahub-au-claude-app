import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ShieldAlert, ShieldCheck, Car, Store, Gauge, ScrollText, Crown, AlertTriangle, ArrowRight } from "lucide-react";

export default function AdminDashboard() {
  const { user } = useAuth();
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await base44.functions.invoke("admin-overview", {});
      if (r.data?.ok) setCounts(r.data.counts);
    } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { if (user) load(); }, [user, load]);

  if (user?.role !== "admin" && user?.account_tier !== "moderator") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="mb-3 h-10 w-10 text-destructive" />
        <h2 className="text-xl font-bold">Moderator/Admin access required</h2>
        <p className="mt-1 text-sm text-muted-foreground">The Admin dashboard is restricted to moderators and admins.</p>
      </div>
    );
  }

  const c = counts || {};
  const pendingVerifications = (c.pending_vehicle_verifications || 0) + (c.pending_performance_verifications || 0) + (c.pending_business_verifications || 0);
  const attentionTotal = (c.open_reports || 0) + pendingVerifications + (c.failed_jobs || 0) + (c.launch_critical_alerts || 0);

  const surfaces = [
    { to: "/moderation", icon: ShieldCheck, title: "Moderation Queue", desc: "Reports & moderation cases", count: c.open_moderation_cases, countLabel: "open", modOnly: true },
    { to: "/verification-queue", icon: Car, title: "Vehicle Verification", desc: "Vehicle & performance-record review", count: (c.pending_vehicle_verifications || 0) + (c.pending_performance_verifications || 0), countLabel: "pending", modOnly: true },
    { to: "/admin/business-verification", icon: Store, title: "Business Verification", desc: "Business verification review", count: c.pending_business_verifications, countLabel: "pending", modOnly: true },
    { to: "/admin/jobs", icon: Gauge, title: "Job Status", desc: "Background jobs & reconciliation", count: c.failed_jobs, countLabel: "failed", adminOnly: true },
    { to: "/admin/audit", icon: ScrollText, title: "Audit Log", desc: "Append-only audit trail", count: null, modOnly: true },
    { to: "/admin/entitlements", icon: Crown, title: "Entitlements", desc: "Per-subscriber entitlement overrides", count: null, adminOnly: true },
  ];
  const visible = surfaces.filter((s) => (!s.modOnly || user?.role === "admin" || user?.account_tier === "moderator") && (!s.adminOnly || user?.role === "admin"));

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-20">
      <header>
        <h1 className="text-2xl font-black tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">Unified entry point for moderation, verification, jobs, and audit.</p>
      </header>

      {/* Attention needed widget */}
      <Card className={attentionTotal > 0 ? "border-destructive/40 bg-destructive/5" : ""}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            {attentionTotal > 0 ? <AlertTriangle className="h-5 w-5 text-destructive" /> : <ShieldCheck className="h-5 w-5 text-emerald-500" />}
            <CardTitle className="text-base">Attention needed</CardTitle>
          </div>
          <CardDescription>Aggregated counts across the queues below.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-16 animate-pulse rounded-lg bg-secondary/40" />
          ) : attentionTotal === 0 ? (
            <p className="text-sm font-medium text-emerald-500">All clear — nothing pending.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <AttentionStat label="Open cases" value={c.open_moderation_cases || 0} to="/moderation" />
              <AttentionStat label="Pending verifications" value={pendingVerifications} to="/verification-queue" />
              <AttentionStat label="Failed jobs" value={c.failed_jobs || 0} to="/admin/jobs" />
              <AttentionStat label="Critical alerts" value={c.launch_critical_alerts || 0} to="/admin/jobs" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Surface links */}
      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.to} to={s.to} className="group">
              <Card className="transition hover:border-primary/40 hover:bg-secondary/20">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="rounded-lg bg-primary/15 p-2"><Icon className="h-5 w-5 text-primary" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{s.title}</span>
                      {s.count != null && s.count > 0 && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">{s.count} {s.countLabel}</span>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{s.desc}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <p className="text-center text-[11px] text-muted-foreground">Each surface keeps its own original permission checks. This dashboard adds navigation and read-only aggregation only.</p>
    </div>
  );
}

function AttentionStat({ label, value, to }) {
  return (
    <Link to={to} className="rounded-lg border border-border bg-background p-3 transition hover:border-primary/40">
      <div className={`text-2xl font-black ${value > 0 ? "text-destructive" : "text-foreground"}`}>{value}</div>
      <div className="text-[11px] leading-tight text-muted-foreground">{label}</div>
    </Link>
  );
}