import React from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Car, Gauge, Cog, Calendar, Zap, Instagram, Wrench, Timer } from "lucide-react";
import GaragePhotoCarousel from "@/components/garage/GaragePhotoCarousel";
import FollowButton from "@/components/social/FollowButton";
import { ReportButton } from "@/components/moderation/ReportDialog";

export default function UserGarage() {
  const { name } = useParams();
  const decodedName = decodeURIComponent(name || "");
  const [cars, setCars] = React.useState([]);
  const [user, setUser] = React.useState(null);
  const [me, setMe] = React.useState(null);
  const [following, setFollowing] = React.useState(false);
  const [avatarUrl, setAvatarUrl] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const cleanName = decodedName.replace(/^@/, "");
        // Look up the user by handle/display_name via searchUsers (service role).
        const res = await base44.functions.invoke("user-profile", { action: "searchUsers", query: cleanName });
        const all = res.data?.users || [];
        const lower = cleanName.toLowerCase();
        const match = all.find((u) => u.handle && u.handle.toLowerCase() === lower)
          || all.find((u) => u.display_name && u.display_name.toLowerCase() === lower)
          || all[0] || null;
        if (!active) return;
        setUser(match);
        // Filter garage cars by the user's id (created_by_id); fallback to owner_name.
        const carFilter = match ? { created_by_id: match.id } : { owner_name: decodedName };
        const gc = await base44.entities.GarageCar.filter(carFilter, "-created_date", 50);
        if (!active) return;
        setCars(gc);
        // Resolve avatar URL.
        if (match?.avatar_media_id) {
          base44.functions.invoke("media", { action: "get", media_id: match.avatar_media_id })
            .then((r) => active && setAvatarUrl(r.data?.media?.file_url || null))
            .catch(() => {});
        }
        // Check following status.
        try {
          const m = await base44.auth.me();
          if (!active) return;
          setMe(m);
          if (match && m.id !== match.id) {
            const f = await base44.functions.invoke("social", { action: "isFollowing", target_type: "user", target_id: match.id });
            if (active) setFollowing(!!f.data?.following);
          }
        } catch {}
      } catch {
        // Fallback to old owner_name filter if user lookup fails.
        try {
          const gc = await base44.entities.GarageCar.filter({ owner_name: decodedName }, "-created_date", 50);
          if (active) setCars(gc);
        } catch {}
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [decodedName]);

  const displayName = user?.display_name || user?.handle || decodedName;

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link to={user?.handle ? `/user/${user.handle}` : "#"} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to profile
      </Link>

      <div className="flex items-center gap-3">
        {avatarUrl ? (
          <img src={avatarUrl} alt={displayName} className="h-12 w-12 rounded-full object-cover" style={{ objectPosition: user?.avatar_position || "50% 50%" }} />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-primary/10 font-black text-primary">
            {(displayName || "?").charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-xl font-black">{user?.handle ? `@${user.handle}'s Garage` : `${displayName}'s Garage`}</h1>
          <p className="text-sm text-muted-foreground">{cars.length} {cars.length === 1 ? "build" : "builds"}</p>
        </div>
        {user && me && me.id !== user.id && (
          <div className="flex items-center gap-2">
            <FollowButton targetType="user" targetId={user.id} initialFollowing={following} onToggle={setFollowing} />
            <ReportButton targetType="user" targetId={user.id} />
          </div>
        )}
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