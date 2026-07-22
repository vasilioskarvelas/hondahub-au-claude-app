import React from "react";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import {
  FlaskConical, CheckCircle2, XCircle, Loader2, Bug as BugIcon, AlertTriangle,
  Trash2, Activity, Clock, Smartphone, Monitor, Tablet, RefreshCw, ChevronDown,
  ExternalLink, ShieldAlert, TrendingUp, Settings
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "@/components/ui/use-toast";

const SUITE_LABELS = {
  account: "Account & Auth",
  social: "Social Platform",
  marketplace: "Marketplace",
  events: "Events",
  garage: "Garage",
  navigation: "Navigation Crawl",
  exploratory: "Exploratory",
  edge_cases: "Edge Cases",
  db_smoke: "Database Smoke",
  device: "Device Testing",
};

const SEVERITY_STYLES = {
  critical: "bg-red-500/15 text-red-400 border-red-500/30",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  low: "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

const BUG_STATUS_STYLES = {
  open: "bg-red-500/10 text-red-400",
  assigned: "bg-amber-500/10 text-amber-400",
  in_progress: "bg-sky-500/10 text-sky-400",
  fixed: "bg-green-500/10 text-green-400",
  retesting: "bg-purple-500/10 text-purple-400",
  resolved: "bg-secondary text-muted-foreground",
  wont_fix: "bg-secondary text-muted-foreground",
};

export default function TestingCenter() {
  const [stats, setStats] = React.useState(null);
  const [results, setResults] = React.useState([]);
  const [bugs, setBugs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [cleaning, setCleaning] = React.useState(false);
  const [expandedBug, setExpandedBug] = React.useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [bugList, testRes] = await Promise.all([
        base44.entities.Bug.list('-created_date', 50),
        base44.entities.TestResult.list('-created_date', 50),
      ]);
      setBugs(bugList || []);
      setResults(testRes || []);
      try {
        const res = await base44.functions.invoke('test-runner', { action: 'stats' });
        setStats(res.data);
      } catch {
        setStats(null);
      }
    } catch (e) {
      toast({ title: "Failed to load test data", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { load(); }, []);

  const runSmoke = async () => {
    setRunning(true);
    try {
      const res = await base44.functions.invoke('test-runner', { action: 'smoke' });
      toast({ title: "Smoke tests complete", description: `${res.data?.passed} passed, ${res.data?.failed} failed` });
      await load();
    } catch (e) {
      toast({ title: "Smoke test failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const cleanup = async () => {
    if (!confirm("Delete ALL test data (listings, posts, events, offers, comments starting with TEST_ or [AUTOMATED TEST])?")) return;
    setCleaning(true);
    try {
      const res = await base44.functions.invoke('test-runner', { action: 'cleanup' });
      const d = res.data?.deleted || {};
      const total = Object.values(d).reduce((a, b) => a + b, 0);
      toast({ title: "Cleanup complete", description: `${total} test records deleted` });
      await load();
    } catch (e) {
      toast({ title: "Cleanup failed", description: e.message, variant: "destructive" });
    } finally {
      setCleaning(false);
    }
  };

  const updateBugStatus = async (bugId, newStatus) => {
    try {
      await base44.entities.Bug.update(bugId, { status: newStatus });
      await load();
    } catch (e) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    }
  };

  const passRate = stats ? (stats.total_tests > 0 ? Math.round((stats.passed / stats.total_tests) * 100) : 0) : 0;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black">
            <FlaskConical className="h-6 w-6 text-primary" />
            Testing Command Centre
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Autonomous user testing system for Honda Hub</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={cleanup}
            disabled={cleaning}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold disabled:opacity-50 active:scale-95 transition-transform"
          >
            <Trash2 className={`h-4 w-4 ${cleaning ? "animate-spin" : ""}`} />
            {cleaning ? "Cleaning..." : "Cleanup Test Data"}
          </button>
          <button
            onClick={runSmoke}
            disabled={running}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground glow-red disabled:opacity-50 active:scale-95 transition-transform"
          >
            <Activity className={`h-4 w-4 ${running ? "animate-spin" : ""}`} />
            {running ? "Running..." : "Run DB Smoke Tests"}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {loading ? (
        <div className="flex h-32 items-center justify-center rounded-2xl border border-border bg-card">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" />
        </div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <StatCard label="Total Tests" value={stats.total_tests} icon={FlaskConical} color="text-primary" />
            <StatCard label="Passed" value={stats.passed} icon={CheckCircle2} color="text-green-400" />
            <StatCard label="Failed" value={stats.failed} icon={XCircle} color="text-red-400" />
            <StatCard label="Running" value={stats.running} icon={Loader2} color="text-sky-400" />
            <StatCard label="Critical Bugs" value={stats.critical_bugs} icon={ShieldAlert} color="text-red-400" />
            <StatCard label="Open Bugs" value={stats.open_bugs} icon={BugIcon} color="text-amber-400" />
          </div>

          {/* Pass Rate + Last Run */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Pass Rate</div>
              <div className="mt-2 flex items-end gap-2">
                <span className={`text-3xl font-black ${passRate >= 80 ? "text-green-400" : passRate >= 60 ? "text-amber-400" : "text-red-400"}`}>{passRate}%</span>
                <span className="mb-1 text-xs text-muted-foreground">{stats.passed}/{stats.total_tests}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                <div className={`h-full rounded-full ${passRate >= 80 ? "bg-green-500" : passRate >= 60 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${passRate}%` }} />
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> Last Completed Test
              </div>
              <div className="mt-2 text-sm font-bold">{stats.latest_run || "No runs yet"}</div>
              {stats.latest_time && (
                <div className="text-xs text-muted-foreground">
                  {new Date(stats.latest_time).toLocaleString("en-AU", { timeZone: "Australia/Melbourne" })}
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" /> Suite Breakdown
              </div>
              <div className="mt-2 space-y-1">
                {Object.entries(stats.suite_stats || {}).slice(0, 4).map(([suite, s]) => (
                  <div key={suite} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{SUITE_LABELS[suite] || suite}</span>
                    <span className="font-semibold">
                      <span className="text-green-400">{s.passed}</span> / <span className="text-red-400">{s.failed}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {/* Platform Notice */}
      <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-sky-400" />
          <div>
            <h3 className="text-sm font-bold text-sky-400">Browser Automation (Playwright) — External</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Base44 cannot natively run real browser automation. The full Playwright test suite lives in the <code className="rounded bg-secondary px-1 py-0.5 text-xs">tests/</code> directory.
              Run it locally or in CI against your deployed app — results report back here automatically. See <code className="rounded bg-secondary px-1 py-0.5 text-xs">tests/README.md</code> for setup.
            </p>
            <Link to="/settings" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-sky-400 hover:underline">
              <Settings className="h-3 w-3" /> Configure test runner in Settings
            </Link>
          </div>
        </div>
      </div>

      {/* Bug List */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          <BugIcon className="h-4 w-4" /> Bug Reports ({bugs.length})
        </h2>
        {bugs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="mx-auto h-8 w-8 text-green-400" />
            <p className="mt-2 font-medium">No bugs reported</p>
          </div>
        ) : (
          <div className="space-y-2">
            {bugs.map((bug) => (
              <div key={bug.id} className="overflow-hidden rounded-xl border border-border bg-card">
                <button
                  onClick={() => setExpandedBug(expandedBug === bug.id ? null : bug.id)}
                  className="flex w-full items-center gap-3 p-3 text-left hover:bg-secondary/50"
                >
                  <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${SEVERITY_STYLES[bug.severity]}`}>
                    {bug.severity}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{bug.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {bug.test_suite && <span>{SUITE_LABELS[bug.test_suite] || bug.test_suite} · </span>}
                      {bug.assigned_agent && <span>Agent: {bug.assigned_agent} · </span>}
                      {bug.device && <span>{bug.device} · </span>}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${BUG_STATUS_STYLES[bug.status] || "bg-secondary text-muted-foreground"}`}>
                    {bug.status}
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expandedBug === bug.id ? "rotate-180" : ""}`} />
                </button>
                {expandedBug === bug.id && (
                  <div className="border-t border-border p-4 space-y-3">
                    {bug.page_url && bug.page_url !== "n/a" && (
                      <a href={bug.page_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" /> {bug.page_url}
                      </a>
                    )}
                    {bug.actions_performed && (
                      <Detail label="Actions" value={bug.actions_performed} />
                    )}
                    {bug.expected_result && (
                      <Detail label="Expected" value={bug.expected_result} />
                    )}
                    {bug.actual_result && (
                      <Detail label="Actual" value={bug.actual_result} />
                    )}
                    {bug.error_message && (
                      <Detail label="Error" value={bug.error_message} mono />
                    )}
                    {bug.console_errors?.length > 0 && (
                      <div>
                        <div className="text-xs font-bold text-muted-foreground">Console Errors</div>
                        <pre className="mt-1 max-h-32 overflow-auto rounded-lg bg-secondary p-2 text-[11px] text-red-400 whitespace-pre-wrap">{bug.console_errors.join("\n")}</pre>
                      </div>
                    )}
                    {bug.screenshot_url && (
                      <img src={bug.screenshot_url} alt="Bug screenshot" className="max-h-64 rounded-lg border border-border" />
                    )}
                    {bug.retest_result && bug.retest_result !== "pending" && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Retest:</span>
                        <span className={`font-bold ${bug.retest_result === "pass" ? "text-green-400" : "text-red-400"}`}>{bug.retest_result}</span>
                      </div>
                    )}
                    {/* Status controls */}
                    <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                      <button onClick={() => updateBugStatus(bug.id, "assigned")} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-secondary">Assign</button>
                      <button onClick={() => updateBugStatus(bug.id, "in_progress")} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-secondary">Start Repair</button>
                      <button onClick={() => updateBugStatus(bug.id, "fixed")} className="rounded-lg border border-green-500/30 px-3 py-1.5 text-xs font-bold text-green-400 hover:bg-green-500/10">Mark Fixed</button>
                      <button onClick={() => updateBugStatus(bug.id, "retesting")} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-secondary">Retest</button>
                      <button onClick={() => updateBugStatus(bug.id, "resolved")} className="rounded-lg border border-green-500/30 px-3 py-1.5 text-xs font-bold text-green-400 hover:bg-green-500/10">Resolve</button>
                      <button onClick={() => updateBugStatus(bug.id, "wont_fix")} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-secondary">Won't Fix</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Results */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          <Activity className="h-4 w-4" /> Recent Test Results
        </h2>
        {results.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No test results yet. Run DB smoke tests or start the Playwright suite.
          </div>
        ) : (
          <div className="space-y-1.5">
            {results.slice(0, 20).map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5">
                {r.status === "pass" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" /> :
                 r.status === "fail" ? <XCircle className="h-4 w-4 shrink-0 text-red-400" /> :
                 r.status === "running" ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-400" /> :
                 <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{r.test_name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {SUITE_LABELS[r.test_suite] || r.test_suite}
                    {r.device && ` · ${r.device}`}
                    {r.viewport && ` · ${r.viewport}`}
                  </div>
                </div>
                {r.duration_ms > 0 && <span className="text-[10px] text-muted-foreground">{r.duration_ms}ms</span>}
                <span className="text-[10px] text-muted-foreground">
                  {r.created_date ? new Date(r.created_date).toLocaleTimeString("en-AU", { timeZone: "Australia/Melbourne", hour: "2-digit", minute: "2-digit" }) : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card p-3"
    >
      <Icon className={`h-4 w-4 ${color}`} />
      <div className="mt-1.5 text-2xl font-black">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </motion.div>
  );
}

function Detail({ label, value, mono }) {
  return (
    <div>
      <div className="text-xs font-bold text-muted-foreground">{label}</div>
      <p className={`mt-0.5 text-xs text-foreground ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}