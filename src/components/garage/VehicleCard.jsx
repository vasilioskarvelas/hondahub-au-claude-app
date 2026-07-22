import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { resolveMediaUrl, vehicleLabel } from "@/lib/garage";
import { VerificationBadge, SaleStatusBadge, BuildStatusBadge, OwnershipBadge } from "./Badges";

export default function VehicleCard({ vehicle }) {
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
        <div>
          <h3 className="text-sm font-black leading-tight">{vehicleLabel(vehicle)}</h3>
          {(vehicle.chassis_code || vehicle.engine_code) && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {vehicle.chassis_code && `${vehicle.chassis_code}`}
              {vehicle.chassis_code && vehicle.engine_code && " · "}
              {vehicle.engine_code && vehicle.engine_code}
            </p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
    </Link>
  );
}