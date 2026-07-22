import React from "react";
import { ShieldCheck, ShieldX, Car, Gauge } from "lucide-react";
import { Link } from "react-router-dom";
import { callGarage, vehicleLabel, pretty } from "@/lib/garage";
import { VerificationBadge } from "@/components/garage/Badges";

export default function VerificationQueue() {
  const [vehicles, setVehicles] = React.useState([]);
  const [records, setRecords] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState({});

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [vd, pd] = await Promise.all([
        callGarage("vehicle", { action: "listPendingVerification" }),
        callGarage("performance", { action: "listPendingVerification" }),
      ]);
      if (vd?.ok) setVehicles(vd.vehicles || []);
      if (pd?.ok) setRecords(pd.records || []);
      if (!vd?.ok && vd?.error?.code === "PERMISSION_DENIED") setError("Moderator/Admin access required.");
    } catch (e) {
      setError(e.response?.data?.error?.message || e.message);
    } finally {
      setLoading(false);
    }
  };
  React.useEffect(() => { load(); }, []);

  const act = async (id, fn, key) => {
    setBusy((b) => ({ ...b, [key + id]: true }));
    try { await fn(); } finally { setBusy((b) => ({ ...b, [key + id]: false })); load(); }
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" /></div>;
  if (error) return <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tighter">Verification Queue</h1>
        <p className="text-sm text-muted-foreground">Moderator review for Vehicle and PerformanceRecord verification.</p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Car className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Vehicles</h2>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">{vehicles.length}</span>
        </div>
        {vehicles.length === 0 ? (
          <p className="text-sm text-muted-foreground">No vehicles pending verification.</p>
        ) : vehicles.map((v) => (
          <div key={v.id} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <Link to={`/vehicle/${v.id}`} className="text-sm font-bold hover:text-primary">{vehicleLabel(v)}</Link>
              <VerificationBadge status={v.verification_status} />
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{[v.year, v.make, v.model].filter(Boolean).join(" ")}</p>
            <div className="mt-2 flex gap-2">
              <button disabled={busy["v" + v.id]} onClick={() => act(v.id, () => callGarage("vehicle", { action: "approveVerification", vehicle_id: v.id }), "v")} className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary"><ShieldCheck className="h-3.5 w-3.5" /> Approve</button>
              <button disabled={busy["v" + v.id]} onClick={() => act(v.id, () => callGarage("vehicle", { action: "rejectVerification", vehicle_id: v.id }), "v")} className="inline-flex items-center gap-1 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive"><ShieldX className="h-3.5 w-3.5" /> Reject</button>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Performance Records</h2>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">{records.length}</span>
        </div>
        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground">No performance records pending verification.</p>
        ) : records.map((r) => (
          <div key={r.id} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold">{r.title || pretty(r.performance_type)}</span>
              <VerificationBadge status={r.verification_status} />
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{pretty(r.performance_type)} · {r.result_date}{r.venue_name ? ` · ${r.venue_name}` : ""}{r.power_kw ? ` · ${r.power_kw} kW` : ""}</p>
            <div className="mt-2 flex gap-2">
              <button disabled={busy["p" + r.id]} onClick={() => act(r.id, () => callGarage("performance", { action: "approveVerification", record_id: r.id }), "p")} className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary"><ShieldCheck className="h-3.5 w-3.5" /> Approve</button>
              <button disabled={busy["p" + r.id]} onClick={() => act(r.id, () => callGarage("performance", { action: "rejectVerification", record_id: r.id }), "p")} className="inline-flex items-center gap-1 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive"><ShieldX className="h-3.5 w-3.5" /> Reject</button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}