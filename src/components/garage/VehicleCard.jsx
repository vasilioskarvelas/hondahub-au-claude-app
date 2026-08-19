import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Pencil, Trash2 } from "lucide-react";
import { resolveMediaUrl, vehicleLabel } from "@/lib/garage";
import { VerificationBadge, SaleStatusBadge, BuildStatusBadge, OwnershipBadge } from "./Badges";

export default function VehicleCard({ vehicle, isOwner, onEdit, onDelete }) {
  const [cover, setCover] = React.useState(null);

  React.useEffect(() => {
    let active = true;
    resolveMediaUrl(vehicle?.cover_media_id).then((u) => active && setCover(u));
    return () => { active = false; };
  }, [vehicle?.cover_media_id]);

  return (
    <Link
      to={`/vehicle/${vehicle.id}`}
      className="group block overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary/50"
    >
      <div className="relative h-36 overflow-hidden bg-secondary">
        {cover ? (
          <img src={cover} alt={vehicleLabel(vehicle)} className="h-full w-full object-cover" />
        ) : (
          <div className="carbon-bg h-full w-full" />
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          <OwnershipBadge status={vehicle.ownership_relationship} />
          <BuildStatusBadge status={vehicle.build_status} />
          <SaleStatusBadge status={vehicle.sale_status} />
        </div>
        <div className="absolute right-2 top-2">
          <VerificationBadge status={vehicle.verification_status} />
        </div>
      </div>
      <div className="flex items-center justify-between p-3">
        <div className="min-w-0">
          <h3 className="text-sm font-black leading-tight">{vehicleLabel(vehicle)}</h3>
          {(vehicle.chassis_code || vehicle.engine_code) && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {vehicle.chassis_code && `${vehicle.chassis_code}`}
              {vehicle.chassis_code && vehicle.engine_code && " · "}
              {vehicle.engine_code && vehicle.engine_code}
            </p>
          )}
        </div>
        {isOwner ? (
          <div className="flex shrink-0 gap-1.5" onClick={(e) => e.preventDefault()}>
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit?.(); }} className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete?.(); }} className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
        )}
      </div>
    </Link>
  );
}