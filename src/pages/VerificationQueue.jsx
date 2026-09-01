import React from "react";
import { Link } from "react-router-dom";
import { Store, ShieldCheck, ShieldX } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

export default function VerificationQueue() {
  const { user } = useAuth();
  const [businesses, setBusinesses] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState({});

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await base44.functions.invoke("business", { action: "listBusinesses", verification_status: "pending", limit: 100 });
      if (r.data?.ok) setBusinesses(r.data.businesses || []);
      else setError(r.data?.error?.message || "Failed to load");
    } catch (e) {
      setError(e.response?.data?.error?.message || e.message);
    } finally {
      setLoading(false);
    }
  };
  React.useEffect(() => { if (user) load(); }, [user]);

  const approve = async (id) => {
    setBusy((b) => ({ ...b, ["a" + id]: true }));
    try { await base44.functions.invoke("business", { action: "approveVerification", business_id: id }); } finally { setBusy((b) => ({ ...b, ["a" + id]: false })); load(); }
  };
  const reject = async (id) => {
    const reason = window.prompt("Reason for rejection (required):");
    if (!reason || !reason.trim()) return;
    setBusy((b) => ({ ...b, ["r" + id]: true }));
    try { await base44.functions.invoke("business", { action: "rejectVerification", business_id: id, reason }); } finally { setBusy((b) => ({ ...b, ["r" + id]: false })); load(); }
  };

  if (user?.role !== "admin" && user?.account_tier !== "moderator") {
    return <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">Moderator/Admin access required.</div>;
  }
  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" /></div>;
  if (error) return <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>;

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-black tracking-tighter">Verification Queue</h1>
        <p className="text-sm text-muted-foreground">Moderator review for Business/Partner verification.</p>
      </div>

      <div className="flex items-center gap-2">
        <Store className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Pending businesses</h2>
        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">{businesses.length}</span>
      </div>

      {businesses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No businesses pending verification.</p>
      ) : businesses.map((b) => (
        <div key={b.id} className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <Link to={`/business/${b.id}`} className="text-sm font-bold hover:text-primary">{b.name}</Link>
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-500">{b.verification_status}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{b.category}{b.location_general ? ` · ${b.location_general}` : ""}{b.contact_email ? ` · ${b.contact_email}` : ""}</p>
          <div className="mt-2 flex gap-2">
            <button disabled={busy["a" + b.id]} onClick={() => approve(b.id)} className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary"><ShieldCheck className="h-3.5 w-3.5" /> Approve</button>
            <button disabled={busy["r" + b.id]} onClick={() => reject(b.id)} className="inline-flex items-center gap-1 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive"><ShieldX className="h-3.5 w-3.5" /> Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}