import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Wrench, Search, X } from "lucide-react";
import FollowButton from "@/components/social/FollowButton";
import VehicleCard from "@/components/garage/VehicleCard";
import { callGarage, resolveMediaUrl, vehicleLabel } from "@/lib/garage";

/**
 * Discover section for the Garage page. A live search bar lets members find
 * builds by car model (matches model/make/nickname/chassis/engine/year).
 * With no query it lists every other member's garage directory.
 */
export default function DiscoverGarages() {
  const [users, setUsers] = React.useState([]);
  const [vehicles, setVehicles] = React.useState([]);
  const [previews, setPreviews] = React.useState({}); // userId -> { count, photo }
  const [followingIds, setFollowingIds] = React.useState(new Set());
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await base44.auth.me();
        const [usersRes, followsRes, pubVehiclesRes, carsRes] = await Promise.all([
          base44.functions.invoke("user-profile", { action: "searchUsers", query: "" }),
          base44.entities.Follow.filter({ follower_id: me.id, target_type: "user" }),
          callGarage("vehicle", { action: "listPublic" }),
          base44.entities.GarageCar.list("-created_date", 100),
        ]);
        if (!active) return;
        const list = usersRes.data?.users || [];
        setUsers(list);
        setVehicles(pubVehiclesRes?.vehicles || []);
        setFollowingIds(new Set(followsRes.map((f) => f.target_id)));

        const vMap = {};
        for (const v of (pubVehiclesRes?.vehicles || [])) {
          const uid = v.created_by_id;
          if (!uid) continue;
          if (!vMap[uid]) vMap[uid] = { count: 0, cover_media_id: null };
          vMap[uid].count += 1;
          if (!vMap[uid].cover_media_id && v.cover_media_id) vMap[uid].cover_media_id = v.cover_media_id;
        }
        const gMap = {};
        for (const c of carsRes) {
          const uid = c.created_by_id;
          if (!uid) continue;
          if (!gMap[uid]) gMap[uid] = { count: 0, photo: null };
          gMap[uid].count += 1;
          if (!gMap[uid].photo && c.photos?.length > 0) gMap[uid].photo = c.photos[0];
        }

        const coverIds = Array.from(new Set(Object.values(vMap).map((x) => x.cover_media_id).filter(Boolean)));
        const urlEntries = await Promise.all(coverIds.map((id) => resolveMediaUrl(id).then((u) => [id, u])));
        const coverUrls = new Map(urlEntries.filter(([, u]) => u));

        const merged = {};
        for (const u of list) {
          const v = vMap[u.id] || { count: 0, cover_media_id: null };
          const g = gMap[u.id] || { count: 0, photo: null };
          merged[u.id] = {
            count: v.count + g.count,
            photo: (v.cover_media_id && coverUrls.get(v.cover_media_id)) || g.photo || null,
          };
        }
        setPreviews(merged);
      } catch {
        /* ignore */
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const onToggle = (userId, next) => {
    setFollowingIds((prev) => {
      const s = new Set(prev);
      if (next) s.add(userId); else s.delete(userId);
      return s;
    });
  };

  const q = query.trim().toLowerCase();
  const matches = q
    ? vehicles.filter((v) => {
        const hay = [v.model, v.make, v.nickname, v.chassis_code, v.engine_code, String(v.year || ""), vehicleLabel(v)]
          .filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      })
    : [];

  return (
    <div className="space-y-3 pt-2">
      <div>
        <h2 className="text-lg font-black tracking-tight">Discover Garages</h2>
        <p className="text-sm text-muted-foreground">Explore builds from other HondaHub members — search by model or browse garages.</p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search builds by model — e.g. Civic, Integra, S2000…"
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-9 text-sm outline-none transition focus:border-primary"
        />
        {query && (
          <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-4 border-secondary border-t-primary" /></div>
      ) : q ? (
        matches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No builds match “{query.trim()}”.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {matches.map((v) => <VehicleCard key={v.id} vehicle={v} />)}
          </div>
        )
      ) : users.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">No other members to show yet.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {users.map((u) => {
            const p = previews[u.id] || { count: 0, photo: null };
            const name = u.handle ? `@${u.handle}` : (u.display_name || u.full_name || "Member");
            const initial = (u.handle || u.display_name || u.full_name || "?").charAt(0).toUpperCase();
            const linkTo = `/user/${u.handle || u.display_name || u.id}/garage`;
            return (
              <Link key={u.id} to={linkTo} className="group block overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary/50">
                <div className="relative h-28 overflow-hidden bg-secondary">
                  {p.photo ? (
                    <img src={p.photo} alt={name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="carbon-bg flex h-full w-full items-center justify-center">
                      <Wrench className="h-7 w-7 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2.5 p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-black text-primary-foreground">
                    {initial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-bold">{name}</h3>
                    <p className="text-[11px] text-muted-foreground">{p.count} {p.count === 1 ? "build" : "builds"}</p>
                  </div>
                  <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                    <FollowButton targetType="user" targetId={u.id} initialFollowing={followingIds.has(u.id)} onToggle={(next) => onToggle(u.id, next)} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}