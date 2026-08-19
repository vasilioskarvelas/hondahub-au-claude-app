import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Wrench } from "lucide-react";
import FollowButton from "@/components/social/FollowButton";
import { callGarage, resolveMediaUrl } from "@/lib/garage";

/**
 * Discover section for the Garage page — lists every other member's garage
 * (regardless of follow status) with their username, a build preview image,
 * build count, and a follow/following button.
 */
export default function DiscoverGarages() {
  const [users, setUsers] = React.useState([]);
  const [previews, setPreviews] = React.useState({}); // userId -> { count, photo }
  const [followingIds, setFollowingIds] = React.useState(new Set());
  const [loading, setLoading] = React.useState(true);

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
        setFollowingIds(new Set(followsRes.map((f) => f.target_id)));

        // Group public Vehicles (primary) by owner — these carry cover_media_id.
        const vMap = {};
        for (const v of (pubVehiclesRes?.vehicles || [])) {
          const uid = v.created_by_id;
          if (!uid) continue;
          if (!vMap[uid]) vMap[uid] = { count: 0, cover_media_id: null };
          vMap[uid].count += 1;
          if (!vMap[uid].cover_media_id && v.cover_media_id) vMap[uid].cover_media_id = v.cover_media_id;
        }
        // Legacy GarageCar records (fallback photo source).
        const gMap = {};
        for (const c of carsRes) {
          const uid = c.created_by_id;
          if (!uid) continue;
          if (!gMap[uid]) gMap[uid] = { count: 0, photo: null };
          gMap[uid].count += 1;
          if (!gMap[uid].photo && c.photos?.length > 0) gMap[uid].photo = c.photos[0];
        }

        // Resolve cover media ids → display URLs (parallel, deduped).
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

  return (
    <div className="space-y-3 pt-2">
      <div>
        <h2 className="text-lg font-black tracking-tight">Discover Garages</h2>
        <p className="text-sm text-muted-foreground">Explore builds from other HondaHub members — no follow required.</p>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-4 border-secondary border-t-primary" /></div>
      ) : users.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">No other members to show yet.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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