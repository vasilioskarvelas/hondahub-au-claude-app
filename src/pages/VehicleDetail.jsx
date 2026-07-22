import React from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Pencil, Send, ShieldCheck, ShieldX, Plus, ImagePlus, Tag } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { callGarage, resolveMediaUrl, vehicleLabel, pretty, SALE_STATUS } from "@/lib/garage";
import SpecDisplay from "@/components/garage/SpecDisplay";
import { VerificationBadge, SaleStatusBadge, BuildStatusBadge, OwnershipBadge } from "@/components/garage/Badges";
import { ModificationItem, TimelineEntryCard, MaintenanceRecordCard, PerformanceRecordCard } from "@/components/garage/RecordCards";
import VehicleForm from "@/components/garage/VehicleForm";
import ModificationForm from "@/components/garage/ModificationForm";
import MaintenanceForm from "@/components/garage/MaintenanceForm";
import PerformanceForm from "@/components/garage/PerformanceForm";
import TimelineEntryForm from "@/components/garage/TimelineEntryForm";
import { ReportButton } from "@/components/moderation/ReportDialog";

const TABS = ["specs", "mods", "timeline", "maintenance", "performance"];

export default function VehicleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [tab, setTab] = React.useState("specs");
  const [cover, setCover] = React.useState(null);
  const [dialog, setDialog] = React.useState(null); // {type, record?}
  const [suggestion, setSuggestion] = React.useState(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const d = await callGarage("vehicle", { action: "get", vehicle_id: id });
      if (d?.ok) {
        setData(d);
        resolveMediaUrl(d.vehicle?.cover_media_id).then(setCover);
      } else {
        setError(d?.error?.message || "Not found");
      }
    } catch (e) {
      setError(e.response?.data?.error?.message || e.message);
    } finally {
      setLoading(false);
    }
  };
  React.useEffect(() => { load(); }, [id]);

  const onChanged = (opts) => {
    if (opts?.timeline_suggestion) {
      setSuggestion(opts.timeline_suggestion);
      setDialog({ type: "timeline" });
    }
    load();
  };

  const onSetCover = async (file) => {
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const mediaRes = await base44.functions.invoke("media", { action: "create", file_url, media_type: "image", source: "user" });
      const mediaId = mediaRes.data?.media?.id;
      await callGarage("vehicle", { action: "setCover", vehicle_id: id, cover_media_id: mediaId });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const submitVehicleVerification = async () => {
    await callGarage("vehicle", { action: "submitVerification", vehicle_id: id });
    load();
  };
  const approveVehicle = async () => { await callGarage("vehicle", { action: "approveVerification", vehicle_id: id }); load(); };
  const rejectVehicle = async () => { await callGarage("vehicle", { action: "rejectVerification", vehicle_id: id }); load(); };
  const changeSale = async (sale_status) => { await callGarage("vehicle", { action: "changeSaleStatus", vehicle_id: id, sale_status }); load(); };

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" /></div>;
  if (error) return (
    <div className="space-y-4">
      <BackBtn onClick={() => navigate("/garage")} />
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
    </div>
  );

  const v = data.vehicle;
  const isOwner = data.is_owner;
  const canModerate = data.can_moderate;

  return (
    <div className="space-y-5">
      <BackBtn onClick={() => navigate("/garage")} />

      {/* Header / cover */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="relative h-40 carbon-bg bg-secondary">
          {cover && <img src={cover} alt={vehicleLabel(v)} className="h-full w-full object-cover opacity-90" />}
          <div className="absolute left-3 top-3 flex flex-wrap gap-1">
            <OwnershipBadge status={v.ownership_relationship} />
            <BuildStatusBadge status={v.build_status} />
            <SaleStatusBadge status={v.sale_status} />
          </div>
          <div className="absolute right-3 top-3"><VerificationBadge status={v.verification_status} /></div>
          {isOwner && (
            <label className="absolute bottom-3 right-3 inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border bg-card/80 px-2.5 py-1.5 text-xs font-medium backdrop-blur">
              <ImagePlus className="h-3.5 w-3.5" /> Set Cover
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onSetCover(f); }} />
            </label>
          )}
        </div>
        <div className="p-4">
          <h1 className="text-xl font-black">{vehicleLabel(v)}</h1>
          {(v.chassis_code || v.engine_code) && (
            <p className="mt-0.5 text-xs text-muted-foreground">{v.chassis_code}{v.chassis_code && v.engine_code && " · "}{v.engine_code}</p>
          )}
          {v.build_description && <p className="mt-2 text-sm text-muted-foreground">{v.build_description}</p>}

          {!isOwner && (
            <div className="mt-3">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <ReportButton targetType="vehicle" targetId={v.id} /> Report this vehicle
              </span>
            </div>
          )}

          {isOwner && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => setDialog({ type: "vehicle" })} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium"><Pencil className="h-3.5 w-3.5" /> Edit</button>
              {v.verification_status === "unverified" && (
                <button onClick={submitVehicleVerification} className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary"><Send className="h-3.5 w-3.5" /> Submit for verification</button>
              )}
            </div>
          )}
          {canModerate && v.verification_status === "pending" && (
            <div className="mt-2 flex gap-2">
              <button onClick={approveVehicle} className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary"><ShieldCheck className="h-3.5 w-3.5" /> Approve verification</button>
              <button onClick={rejectVehicle} className="inline-flex items-center gap-1 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive"><ShieldX className="h-3.5 w-3.5" /> Reject verification</button>
            </div>
          )}
          {isOwner && (
            <div className="mt-3">
              <span className="text-[11px] font-medium text-muted-foreground">Sale status:</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {SALE_STATUS.map((s) => (
                  <button key={s} onClick={() => changeSale(s)} className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${v.sale_status === s ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>{pretty(s)}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 scrollbar-hide">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{pretty(t)}</button>
        ))}
      </div>

      {/* Tab content */}
      <TabContent tab={tab} data={data} isOwner={isOwner} canModerate={canModerate} setDialog={setDialog} onChanged={onChanged} />

      {/* Dialogs */}
      {dialog?.type === "vehicle" && <VehicleForm vehicle={v} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load(); }} />}
      {dialog?.type === "mod" && <ModificationForm vehicleId={id} modification={dialog.record} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); onChanged(dialog.record ? undefined : {}); }} />}
      {dialog?.type === "maintenance" && <MaintenanceForm vehicleId={id} record={dialog.record} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); onChanged(); }} />}
      {dialog?.type === "performance" && <PerformanceForm vehicleId={id} record={dialog.record} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); onChanged(); }} />}
      {dialog?.type === "timeline" && <TimelineEntryForm vehicleId={id} suggestion={suggestion} onClose={() => { setDialog(null); setSuggestion(null); }} onSaved={() => { setDialog(null); setSuggestion(null); load(); }} />}
    </div>
  );
}

function BackBtn({ onClick }) {
  return <button onClick={onClick} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Garage</button>;
}

function TabContent({ tab, data, isOwner, canModerate, setDialog, onChanged }) {
  const addBtn = (label, onClick) => isOwner ? <button onClick={onClick} className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"><Plus className="h-3.5 w-3.5" /> {label}</button> : null;

  if (tab === "specs") return <SpecDisplay vehicle={data.vehicle} />;

  if (tab === "mods") return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Modifications</h2>
        {addBtn("Add Mod", () => setDialog({ type: "mod" }))}
      </div>
      {data.modifications?.length ? data.modifications.map((m) => (
        <ModificationItem key={m.id} mod={m} isOwner={isOwner} onEdit={(rec) => setDialog({ type: "mod", record: rec })} onChanged={onChanged} />
      )) : <Empty text="No modifications logged yet." />}
    </div>
  );

  if (tab === "timeline") return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Timeline</h2>
        {addBtn("Add Entry", () => setDialog({ type: "timeline" }))}
      </div>
      {data.timeline?.length ? data.timeline.map((e) => (
        <TimelineEntryCard key={e.id} entry={e} isOwner={isOwner} onEdit={(rec) => setDialog({ type: "timeline", record: null })} onChanged={onChanged} />
      )) : <Empty text="No timeline entries yet." />}
    </div>
  );

  if (tab === "maintenance") return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Maintenance</h2>
        {addBtn("Log Service", () => setDialog({ type: "maintenance" }))}
      </div>
      {data.maintenance?.length ? data.maintenance.map((r) => (
        <MaintenanceRecordCard key={r.id} record={r} isOwner={isOwner} onEdit={(rec) => setDialog({ type: "maintenance", record: rec })} onChanged={onChanged} />
      )) : <Empty text="No maintenance records yet." />}
    </div>
  );

  if (tab === "performance") return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Performance</h2>
        {addBtn("Log Result", () => setDialog({ type: "performance" }))}
      </div>
      {data.performance?.length ? data.performance.map((r) => (
        <PerformanceRecordCard key={r.id} record={r} isOwner={isOwner} canModerate={canModerate} onEdit={(rec) => setDialog({ type: "performance", record: rec })} onChanged={onChanged} />
      )) : <Empty text="No performance records yet." />}
    </div>
  );

  return null;
}

function Empty({ text }) {
  return <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">{text}</div>;
}