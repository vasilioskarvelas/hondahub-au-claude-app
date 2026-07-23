import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gauge, RefreshCw, Play, ShieldAlert, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

export default function JobStatusDashboard() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(null);
  const [lastRunResult, setLastRunResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await base44.functions.invoke("reconcile", { action: "dashboard" });
      if (r.data?.ok) setJobs(r.data.jobs || []);
    } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { if (user?.role === "admin") load(); }, [user, load]);

  if (user?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="mb-3 h-10 w-10 text-destructive" />
        <h2 className="text-xl font-bold">Admin access required</h2>
        <p className="mt-1 text-sm text-muted-foreground">The job-status dashboard is admin-only.</p>
      </div>
    );
  }

  const runNow = async (name) => {
    setRunning(name);
    setLastRunResult(null);
    try {
      const r = await base44.functions.invoke("reconcile", { action: name });
      setLastRunResult({ name, data: r.data });
      await load();
    } catch {} finally { setRunning(null); }
  };

  const criticalJobs = jobs.filter((j) => j.launch_critical);
  const anyCriticalAlert = criticalJobs.some((j) => (j.last?.alerts || 0) > 0);

  const grouped = jobs.reduce((acc, j) => { (acc[j.group] = acc[j.group] || []).push(j); return acc; }, {});

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-20">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/15 p-2"><Gauge className="h-6 w-6 text-primary" /></div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Job Status</h1>
            <p className="text-sm text-muted-foreground">Background jobs & reconciliation (Phase 11).</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={load} disabled={loading}><RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} /></Button>
      </header>

      {anyCriticalAlert && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/50 bg-destructive/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-bold text-destructive">Launch-critical alert</p>
            <p className="text-muted-foreground">A launch-critical sweep detected integrity violations. Review below and run now to re-check.</p>
          </div>
        </div>
      )}

      {Object.entries(grouped).map(([group, list]) => (
        <Card key={group}>
          <CardHeader>
            <CardTitle className="text-base">{group}</CardTitle>
            <CardDescription>{list.length} job(s)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {list.map((j) => {
              const last = j.last;
              const alerting = j.launch_critical && (last?.alerts || 0) > 0;
              return (
                <div key={j.name} className={`rounded-lg border p-3 ${alerting ? "border-destructive/50 bg-destructive/5" : "border-border bg-secondary/20"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold">{j.label}</span>
                        {j.launch_critical && <Badge variant="destructive" className="text-[10px]">launch-critical</Badge>}
                        <Badge variant="outline" className="text-[10px]">{j.schedule}</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{j.description}</p>
                      {last ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <span className={`inline-flex items-center gap-1 font-medium ${last.run_status === "success" ? "text-emerald-500" : "text-destructive"}`}>
                            {last.run_status === "success" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                            {last.run_status}
                          </span>
                          {last.finished_at && <span className="text-muted-foreground">last run {new Date(last.finished_at).toLocaleString()}</span>}
                          {(last.alerts || 0) > 0 && <Badge variant="destructive" className="text-[10px]">{last.alerts} alert(s)</Badge>}
                          <span className="text-muted-foreground">· {last.summary}</span>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">No run recorded yet.</p>
                      )}
                    </div>
                    {j.launch_critical && (
                      <Button size="sm" variant="secondary" onClick={() => runNow(j.name)} disabled={running === j.name}>
                        {running === j.name ? <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                        Run now
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {lastRunResult && (
        <Card>
          <CardHeader><CardTitle className="text-base">Last manual run — {lastRunResult.name}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {lastRunResult.data?.ok ? (
              <>
                <div className="flex items-center gap-2">
                  <Badge variant={lastRunResult.data.status === "success" ? "secondary" : "destructive"}>{lastRunResult.data.status}</Badge>
                  {(lastRunResult.data.alerts || 0) > 0 && <Badge variant="destructive">{lastRunResult.data.alerts} alert(s)</Badge>}
                  <span className="text-muted-foreground">{lastRunResult.data.summary}</span>
                </div>
                {lastRunResult.data.alert_details && (
                  <pre className="max-h-60 overflow-auto rounded-lg border border-border bg-background p-3 text-xs">{lastRunResult.data.alert_details}</pre>
                )}
              </>
            ) : (
              <p className="text-destructive">Run failed: {lastRunResult.data?.error?.code || "unknown"}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}