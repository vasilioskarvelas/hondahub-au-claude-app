import React from "react";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import {
  Crown, ClipboardList, Code, Bug, Heart, Palette, Shield, Database,
  Gauge, DollarSign, BarChart3, ShieldCheck, LifeBuoy, Scale,
  RefreshCw, ChevronDown, ChevronRight, Activity, AlertTriangle,
  TrendingUp, FileText, Sparkles
} from "lucide-react";
import AgentChat from "@/components/ai/AgentChat";
import { runAutoSweep } from "@/lib/autoSweep";
import { toast } from "@/components/ui/use-toast";

const AGENTS = [
  { name: "master_orchestrator", label: "Master Orchestrator", role: "CEO", icon: Crown, color: "text-primary", desc: "Coordinates all agents, schedules reviews, produces executive reports" },
  { name: "product_manager", label: "Product Manager", role: "Planning", icon: ClipboardList, color: "text-blue-400", desc: "Breaks down ideas, prioritises, estimates complexity & revenue" },
  { name: "app_developer", label: "App Developer", role: "Engineering", icon: Code, color: "text-green-400", desc: "Builds features, fixes bugs, optimises performance" },
  { name: "qa_testing", label: "QA Testing", role: "Quality", icon: Bug, color: "text-amber-400", desc: "Tests all flows, reports issues, never approves untested code" },
  { name: "customer_journey", label: "Customer Journey", role: "Experience", icon: Heart, color: "text-pink-400", desc: "Reviews UX vibes, rates every page 1-10, suggests improvements" },
  { name: "ui_ux", label: "UI / UX", role: "Design", icon: Palette, color: "text-purple-400", desc: "Improves spacing, typography, colours, layouts, accessibility" },
  { name: "security", label: "Security", role: "Protection", icon: Shield, color: "text-red-400", desc: "Reviews auth, permissions, payments, detects threats" },
  { name: "database", label: "Database", role: "Data", icon: Database, color: "text-cyan-400", desc: "Monitors tables, indexes, duplicates, broken references" },
  { name: "performance", label: "Performance", role: "Speed", icon: Gauge, color: "text-orange-400", desc: "Monitors loading speed, API speed, slow pages, broken requests" },
  { name: "financial", label: "Financial", role: "Revenue", icon: DollarSign, color: "text-emerald-400", desc: "Reviews subscriptions, fees, revenue, profit, estimates impact" },
  { name: "analytics", label: "Analytics", role: "Insights", icon: BarChart3, color: "text-indigo-400", desc: "Tracks sign-ups, retention, DAU, conversions, drop-off points" },
  { name: "marketplace_safety", label: "Marketplace Safety", role: "Trust", icon: ShieldCheck, color: "text-teal-400", desc: "Detects fake listings, scams, spam, fraud, protects users" },
  { name: "customer_support", label: "Customer Support", role: "Help", icon: LifeBuoy, color: "text-sky-400", desc: "Answers questions, drafts replies, categorises tickets" },
  { name: "compliance", label: "Compliance", role: "Legal", icon: Scale, color: "text-violet-400", desc: "Reviews privacy, terms, refund policies, marketplace rules" },
];

export default function AICommandCenter() {
  const [reports, setReports] = React.useState([]);
  const [latestReport, setLatestReport] = React.useState(null);
  const [loadingReports, setLoadingReports] = React.useState(true);
  const [generating, setGenerating] = React.useState(false);
  const [selectedAgent, setSelectedAgent] = React.useState(null);
  const [expandedReport, setExpandedReport] = React.useState(null);
  const [stats, setStats] = React.useState(null);
  const [sweeping, setSweeping] = React.useState(false);

  React.useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    setLoadingReports(true);
    try {
      const list = await base44.entities.Report.list('-created_date', 20);
      setReports(list || []);
      const daily = (list || []).find(r => r.report_type === 'daily_executive');
      setLatestReport(daily || (list || [])[0] || null);
      if (daily?.metrics) {
        try { setStats(JSON.parse(daily.metrics)); } catch { /* ignore */ }
      }
    } catch (e) {
      console.error("Failed to load reports:", e);
    } finally {
      setLoadingReports(false);
    }
  };

  const generateReport = async () => {
    setGenerating(true);
    try {
      const res = await base44.functions.invoke('daily-executive-report', {});
      toast({ title: "Report generated!", description: `Health score: ${res.data?.health_score || 'N/A'}/100` });
      await loadReports();
    } catch (e) {
      toast({ title: "Failed to generate report", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const healthColor = (score) => {
    if (score >= 80) return "text-emerald-400";
    if (score >= 60) return "text-amber-400";
    if (score >= 40) return "text-orange-400";
    return "text-destructive";
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black">
            <Sparkles className="h-6 w-6 text-primary" />
            AI Command Center
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Your permanent AI workforce for Honda Hub</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              setSweeping(true);
              try {
                const result = await runAutoSweep();
                toast({
                  title: "Data sweep complete",
                  description: `${result.issues_found} issues found, ${result.fixes_applied} fixes applied`,
                });
                await loadReports();
              } catch (e) {
                toast({ title: "Sweep failed", description: e.message, variant: "destructive" });
              } finally {
                setSweeping(false);
              }
            }}
            disabled={sweeping}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold disabled:opacity-50 active:scale-95 transition-transform"
          >
            <Database className={`h-4 w-4 ${sweeping ? "animate-spin" : ""}`} />
            {sweeping ? "Sweeping..." : "Run Data Sweep"}
          </button>
          <button
            onClick={generateReport}
            disabled={generating}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground glow-red disabled:opacity-50 active:scale-95 transition-transform"
          >
            <RefreshCw className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} />
            {generating ? "Generating..." : "Generate Report"}
          </button>
        </div>
      </div>

      {/* Latest Report Summary */}
      {latestReport ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card to-card/50 p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold">{latestReport.title}</h2>
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">{latestReport.summary}</p>
            </div>
            <div className="flex shrink-0 flex-col items-center gap-1">
              <div className={`text-3xl font-black ${healthColor(latestReport.health_score)}`}>
                {latestReport.health_score}
              </div>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Health</span>
            </div>
          </div>

          {/* Quick stats from metrics */}
          {stats && (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard label="Listings" value={stats.total_listings} active={stats.active_listings} />
              <StatCard label="Posts" value={stats.total_posts} active={stats.recent_posts_24h} activeLabel="24h" />
              <StatCard label="Offers" value={stats.total_offers} active={stats.pending_offers} activeLabel="pending" />
              <StatCard label="Est. Revenue" value={`$${stats.estimated_revenue}`} icon={DollarSign} />
            </div>
          )}

          {/* Critical issues */}
          {latestReport.critical_issues?.length > 0 && (
            <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                Critical Issues ({latestReport.critical_issues.length})
              </div>
              <ul className="mt-1.5 space-y-1">
                {latestReport.critical_issues.slice(0, 3).map((issue, i) => (
                  <li key={i} className="text-xs text-muted-foreground">• {issue}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Revenue opportunities */}
          {latestReport.revenue_opportunities?.length > 0 && (
            <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                <TrendingUp className="h-3.5 w-3.5" />
                Revenue Opportunities ({latestReport.revenue_opportunities.length})
              </div>
              <ul className="mt-1.5 space-y-1">
                {latestReport.revenue_opportunities.slice(0, 3).map((opp, i) => (
                  <li key={i} className="text-xs text-muted-foreground">• {opp}</li>
                ))}
              </ul>
            </div>
          )}
        </motion.div>
      ) : loadingReports ? (
        <div className="flex h-32 items-center justify-center rounded-2xl border border-border bg-card">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" />
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">No reports yet</p>
          <p className="text-xs text-muted-foreground">Click "Generate Report" to create your first executive report</p>
        </div>
      )}

      {/* AI Agents Grid */}
      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">AI Workforce</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {AGENTS.map((agent, i) => {
            const Icon = agent.icon;
            return (
              <motion.button
                key={agent.name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => setSelectedAgent(agent)}
                className="group flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary/40 hover:bg-card/80 active:scale-[0.98]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                  <Icon className={`h-5 w-5 ${agent.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="truncate text-sm font-bold">{agent.label}</h3>
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">{agent.role}</span>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{agent.desc}</p>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Reports History */}
      {reports.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Report History</h2>
          <div className="space-y-2">
            {reports.map((report) => (
              <div key={report.id} className="overflow-hidden rounded-xl border border-border bg-card">
                <button
                  onClick={() => setExpandedReport(expandedReport === report.id ? null : report.id)}
                  className="flex w-full items-center gap-3 p-3 text-left hover:bg-secondary/50"
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs font-black ${healthColor(report.health_score)}`}>
                    {report.health_score || '—'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{report.title}</p>
                    <p className="text-xs text-muted-foreground">{report.report_type.replace(/_/g, ' ')}</p>
                  </div>
                  <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expandedReport === report.id ? "rotate-90" : ""}`} />
                </button>
                {expandedReport === report.id && (
                  <div className="border-t border-border p-4">
                    <div className="prose prose-sm prose-invert max-w-none whitespace-pre-line text-sm [&_h1]:text-base [&_h2]:text-sm [&_li]:text-sm [&_p]:text-sm">
                      <ReactMarkdown>{report.content}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chat Drawer */}
      {selectedAgent && (
        <AgentChat
          agentName={selectedAgent.name}
          agentLabel={selectedAgent.label}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, active, activeLabel, icon: Icon }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/50 p-2.5">
      {Icon ? (
        <div className="flex items-center gap-1">
          <Icon className="h-3 w-3 text-primary" />
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        </div>
      ) : (
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      )}
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-lg font-black">{value}</span>
        {active !== undefined && (
          <span className="text-[10px] text-muted-foreground">{active} {activeLabel}</span>
        )}
      </div>
    </div>
  );
}