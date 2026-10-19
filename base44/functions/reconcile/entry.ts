import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { JOBS, dashboardSnapshot, JobResult } from "../../shared/reconcile.ts";

/**
 * Reconciliation & background-job dispatcher (Phase 11).
 *
 * Scheduled workflows invoke this with { action: "<job_name>" }. The admin
 * dashboard invokes { action: "dashboard" } (snapshot) or a job action to
 * run a launch-critical job on demand.
 *
 * Auth: a manual (user) trigger requires admin; a scheduled invocation (no
 * user context) is allowed. Each run records a JobStatus row. The two
 * launch-critical jobs additionally email admins on the 0→>0 alert transition
 * (alerting, not just logging).
 */

function fail(code: string, status: number, details?: any): Response {
  return Response.json({ ok: false, error: { code, ...(details ? { details } : {}) } }, { status });
}

const LAUNCH_CRITICAL = new Set(["invalid_polymorphic_reference_sweep", "duplicate_active_record_detection"]);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return fail("AUTH_REQUIRED", 401);
    if (user.role !== "admin") return fail("PERMISSION_DENIED", 403);

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === "dashboard") {
      const jobs = await dashboardSnapshot(base44);
      return Response.json({ ok: true, jobs });
    }

    const job = JOBS[action];
    if (!job) return fail("VALIDATION_FAILED", 422, { action: "unknown" });

    const started = new Date().toISOString();
    let result: JobResult;
    try {
      result = await job(base44);
    } catch (e) {
      result = { job_name: action, status: "failure", alerts: 0, summary: `error: ${e.message}`, counts: {} };
    }
    const finished = new Date().toISOString();

    // Alerting for launch-critical jobs: email admins when alerts transition 0 → >0.
    const isCritical = LAUNCH_CRITICAL.has(action);
    if (isCritical && result.alerts > 0) {
      try {
        const prev = await base44.asServiceRole.entities.JobStatus.filter({ job_name: action }, "-created_date", 1).catch(() => []);
        const prevAlerts = (prev[0] && prev[0].alerts) ? prev[0].alerts : 0;
        if (prevAlerts === 0) {
          const admins = await base44.asServiceRole.entities.User.list("-created_date", 50).catch(() => []);
          for (const a of admins) {
            if (a.role === "admin" && a.email) {
              await base44.integrations.Core.SendEmail({
                to: a.email,
                subject: `ALERT — ${result.job_name}`,
                body: `${result.alerts} violation(s) detected by the ${result.job_name} job.\n\n${result.alert_details || ""}\n\nReview the Job Status dashboard.`,
              }).catch(() => {});
            }
          }
        }
      } catch {}
    }

    // Record run (append-only JobStatus log).
    await base44.asServiceRole.entities.JobStatus.create({
      job_name: action,
      run_status: result.status,
      alerts: result.alerts || 0,
      alert_details: result.alert_details || null,
      started_at: started,
      finished_at: finished,
      is_launch_critical: isCritical,
      summary: result.summary || "",
    }).catch(() => {});

    return Response.json({ ok: true, job: action, started_at: started, finished_at: finished, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: { code: "INTERNAL_ERROR", message: error.message } }, { status: 500 });
  }
});