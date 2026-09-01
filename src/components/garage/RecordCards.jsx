import React from "react";
import { Pencil, Trash2, Wrench, CheckCircle, BadgeCheck } from "lucide-react";
import { callGarage, pretty } from "@/lib/garage";
import { ModCategoryBadge, InstallationTypeBadge, SaleStatusBadge } from "./Badges";

function CardActions({ children }) {
  return <div className="mt-2 flex flex-wrap gap-2">{children}</div>;
}
function ActBtn({ onClick, children, tone = "default" }) {
  const tones = {
    default: "border-border text-muted-foreground hover:text-foreground",
    danger: "border-destructive/40 text-destructive hover:bg-destructive/10",
    primary: "border-primary/40 text-primary hover:bg-primary/10",
  };
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>
      {children}
    </button>
  );
}

export function ModificationItem({ mod, isOwner, onEdit, onChanged }) {
  const [busy, setBusy] = React.useState(false);
  const run = async (fn) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };

  const markInstalled = () => run(async () => {
    const data = await callGarage("modification", { action: "markInstalled", modification_id: mod.id });
    if (data?.timeline_suggestion) onChanged({ timeline_suggestion: data.timeline_suggestion });
    else onChanged();
  });
  const markRemoved = () => run(async () => { await callGarage("modification", { action: "markRemoved", modification_id: mod.id }); onChanged(); });
  const del = () => run(async () => { await callGarage("modification", { action: "delete", modification_id: mod.id }); onChanged(); });

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <ModCategoryBadge category={mod.category} />
            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{pretty(mod.status)}</span>
            <InstallationTypeBadge type={mod.installation_type} />
          </div>
          <h4 className="mt-1.5 text-sm font-bold">{[mod.brand, mod.product_name].filter(Boolean).join(" ") || pretty(mod.category)}</h4>
          {mod.installed_by_business_id && <p className="mt-0.5 text-[11px] text-primary">Tagged Business: {mod.installed_by_business_id}</p>}
          {mod.installer_name_freetext && <p className="mt-0.5 text-[11px] text-muted-foreground">Installer: {mod.installer_name_freetext}</p>}
          {mod.notes && <p className="mt-1 text-xs text-muted-foreground">{mod.notes}</p>}
        </div>
      </div>
      {isOwner && (
        <CardActions>
          <ActBtn onClick={() => onEdit(mod)} tone="primary"><Pencil className="h-3 w-3" /> Edit</ActBtn>
          {mod.status !== "installed" && <ActBtn onClick={markInstalled}><Wrench className="h-3 w-3" /> Mark Installed</ActBtn>}
          {mod.status === "installed" && <ActBtn onClick={markRemoved}><CheckCircle className="h-3 w-3" /> Mark Removed</ActBtn>}
          {mod.status !== "installed" && mod.status !== "removed" && <ActBtn onClick={del} tone="danger"><Trash2 className="h-3 w-3" /> Delete</ActBtn>}
        </CardActions>
      )}
    </div>
  );
}

export function TimelineEntryCard({ entry, isOwner, onEdit, onChanged }) {
  const del = async () => { await callGarage("timeline", { action: "removeEntry", entry_id: entry.id }); onChanged(); };
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{pretty(entry.entry_type)}</span>
        <span className="text-[11px] text-muted-foreground">{entry.entry_date}</span>
      </div>
      <h4 className="mt-1.5 text-sm font-bold">{entry.title}</h4>
      {entry.description && <p className="mt-1 text-xs text-muted-foreground">{entry.description}</p>}
      {entry.origin === "system_generated" && <span className="mt-1 inline-block text-[10px] text-primary">auto-suggested</span>}
      {isOwner && (
        <CardActions>
          <ActBtn onClick={() => onEdit(entry)} tone="primary"><Pencil className="h-3 w-3" /> Edit</ActBtn>
          <ActBtn onClick={del} tone="danger"><Trash2 className="h-3 w-3" /> Remove</ActBtn>
        </CardActions>
      )}
    </div>
  );
}

export function MaintenanceRecordCard({ record, isOwner, onEdit, onChanged }) {
  const remove = async () => { await callGarage("maintenance", { action: "removeRecord", record_id: record.id }); onChanged(); };
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{pretty(record.maintenance_type)}</span>
        <span className="text-[11px] text-muted-foreground">{record.service_date}</span>
      </div>
      <h4 className="mt-1.5 text-sm font-bold">{record.title || pretty(record.maintenance_type)}</h4>
      {record.service_provider_name_freetext && <p className="mt-0.5 text-[11px] text-muted-foreground">Provider: {record.service_provider_name_freetext}</p>}
      {record.next_service_date && <p className="mt-0.5 text-[11px] text-primary">Next: {record.next_service_date}{record.next_service_odometer_km ? ` · ${record.next_service_odometer_km} km` : ""}</p>}
      {isOwner && (
        <CardActions>
          <ActBtn onClick={() => onEdit(record)} tone="primary"><Pencil className="h-3 w-3" /> Edit</ActBtn>
          <ActBtn onClick={remove} tone="danger"><Trash2 className="h-3 w-3" /> Remove</ActBtn>
        </CardActions>
      )}
    </div>
  );
}

export function PerformanceRecordCard({ record, isOwner, onEdit, onChanged }) {
  const hp = record.power_kw ? Math.round(record.power_kw * 1.341) : null;

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{pretty(record.performance_type)}</span>
      </div>
      <h4 className="mt-1.5 text-sm font-bold">{record.title || pretty(record.performance_type)}</h4>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        <span>{record.result_date}</span>
        {record.venue_name && <span>{record.venue_name}</span>}
        {record.power_kw != null && <span>{record.power_kw} kW{hp ? ` (${hp} hp)` : ""}</span>}
      </div>
      {isOwner && (
        <CardActions>
          <ActBtn onClick={() => onEdit(record)} tone="primary"><Pencil className="h-3 w-3" /> Edit</ActBtn>
        </CardActions>
      )}
    </div>
  );
}