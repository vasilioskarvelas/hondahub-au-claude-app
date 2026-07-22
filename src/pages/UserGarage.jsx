import React from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Car, Gauge, Cog, Calendar, Zap, Instagram, Wrench, Timer, Gauge as GaugeIcon } from "lucide-react";
import GaragePhotoCarousel from "@/components/garage/GaragePhotoCarousel";

export default function UserGarage() {
  const { name } = useParams();
  const decodedName = decodeURIComponent(name || "");
  const [cars, setCars] = React.useState([]);
  const [profile, setProfile] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    Promise.all([
      base44.entities.GarageCar.filter({ owner_name: decodedName }, "-created_date", 50),
      base44.entities.Profile.filter({ display_name: decodedName }),
    ]).then(([gc, pr]) => {
      setCars(gc);
      setProfile(pr[0] || null);
      setLoading(false);
    });
  }, [decodedName]);

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link to={`/user/${encodeURIComponent(decodedName)}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to profile
      </Link>

      <div className="flex items-center gap-3">
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt={decodedName} className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-primary/10 font-black text-primary">
            {(decodedName || "?").charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-xl font-black">@{decodedName}'s Garage</h1>
          <p className="text-sm text-muted-foreground">{cars.length} {cars.length === 1 ? "build" : "builds"}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" />
        </div>
      ) : cars.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <Car className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No builds in the garage yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {cars.map((c) => (
            <div key={c.id} className="overflow-hidden rounded-2xl border border-border bg-card">
              {c.photos?.length > 0 && (
                <GaragePhotoCarousel photos={c.photos} alt={c.model} />
              )}
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-bold">{c.model}</h2>
                    <div className="flex flex-wrap gap-2 mt-0.5">
                      {c.chassis_code && <span className="font-mono text-xs text-primary">{c.chassis_code}</span>}
                      {c.year && <span className="text-xs text-muted-foreground">{c.year}</span>}
                      {c.is_featured && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">FEATURED</span>}
                    </div>
                  </div>
                  {c.power_kw && (
                    <div className="text-right">
                      <div className="text-2xl font-black text-primary">{c.power_kw}</div>
                      <div className="text-[10px] text-muted-foreground">kW</div>
                    </div>
                  )}
                </div>

                {(c.engine_code || c.gearbox || c.dyno_kw || c.track_time || c.drag_time) && (
                  <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
                    {c.engine_code && <Spec icon={Zap} label="Engine" value={c.engine_code} />}
                    {c.gearbox && <Spec icon={Cog} label="Gearbox" value={c.gearbox} />}
                    {c.dyno_kw && <Spec icon={Gauge} label="Dyno" value={`${c.dyno_kw} kW`} />}
                    {c.track_time && <Spec icon={Timer} label="Track Time" value={c.track_time} />}
                    {c.drag_time && <Spec icon={Timer} label="1/4 Mile" value={c.drag_time} />}
                  </div>
                )}

                {c.modifications && (
                  <div className="border-t border-border pt-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      <Wrench className="h-3.5 w-3.5" /> Modifications
                    </div>
                    <p className="mt-1 text-sm text-foreground">{c.modifications}</p>
                  </div>
                )}

                {c.future_plans && (
                  <div className="border-t border-border pt-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" /> Future Plans
                    </div>
                    <p className="mt-1 text-sm text-foreground">{c.future_plans}</p>
                  </div>
                )}

                {c.instagram && (
                  <a href={`https://instagram.com/${c.instagram.replace("@", "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary">
                    <Instagram className="h-4 w-4" /> {c.instagram}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Spec({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div>
        <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
        <div className="text-sm font-semibold capitalize">{value}</div>
      </div>
    </div>
  );
}