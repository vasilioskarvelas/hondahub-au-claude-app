import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { isModeratorOrAdmin } from "../../shared/community.ts";
import { json, err } from "../../shared/http.ts";

/**
 * Admin overview — read-only aggregation endpoint (Phase 12).
 *
 * Returns counts for the unified Admin dashboard's "attention needed" widget.
 * Introduces NO new write path and NO new permission rule: it only reads
 * existing entities and reuses the existing Moderator/Admin gate
 * (isModeratorOrAdmin). Every surface it reports on keeps its own original
 * permission checks unchanged.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return err("AUTH_REQUIRED", 401);
    if (!isModeratorOrAdmin(user)) return err("PERMISSION_DENIED", 403);

    const e = base44.asServiceRole.entities;
    const [reports, cases, vehicles, perf, businesses, jobRuns] = await Promise.all([
      e.Report.filter({ status: "open" }, "-created_date", 500).catch(() => []),
      e.ModerationCase.list("-created_date", 500).catch(() => []),
      e.Vehicle.filter({ verification_status: "pending" }, "-created_date", 500).catch(() => []),
      e.PerformanceRecord.filter({ verification_status: "pending" }, "-created_date", 500).catch(() => []),
      e.Business.filter({ verification_status: "pending" }, "-created_date", 500).catch(() => []),
      e.JobStatus.list("-created_date", 300).catch(() => []),
    ]);

    const openCases = (cases as any[]).filter((c) =>
      ["open", "assigned", "in_review", "escalated"].includes(c.status)
    ).length;

    // Latest run per job (list is newest-first).
    const latestByJob: Record<string, any> = {};
    for (const r of jobRuns as any[]) if (!latestByJob[r.job_name]) latestByJob[r.job_name] = r;
    const latest = Object.values(latestByJob);
    const failedJobs = latest.filter((r) => r.run_status === "failure").length;
    const launchCriticalAlerts = latest.filter((r) => r.is_launch_critical && (r.alerts || 0) > 0).length;

    return json({
      ok: true,
      counts: {
        open_reports: (reports as any[]).length,
        open_moderation_cases: openCases,
        pending_vehicle_verifications: (vehicles as any[]).length,
        pending_performance_verifications: (perf as any[]).length,
        pending_business_verifications: (businesses as any[]).length,
        failed_jobs: failedJobs,
        launch_critical_alerts: launchCriticalAlerts,
      },
    });
  } catch (error) {
    return json({ ok: false, error: { code: "INTERNAL_ERROR", message: error.message } }, 500);
  }
});