import React from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Car } from "lucide-react";
import { callGarage } from "@/lib/garage";
import VehicleCard from "@/components/garage/VehicleCard";
import FollowButton from "@/components/social/FollowButton";
import { ReportButton } from "@/components/moderation/ReportDialog";

export default function UserGarage() {
  const { name } = useParams();
  const decodedName = decodeURIComponent(name || "");
  const [vehicles, setVehicles] = React.useState([]);
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
        // Load this user's public vehicles (builds with specs/mods/etc).
        const pub = await callGarage("vehicle", { action: "listPublic" });
        const list = (pub?.vehicles || []).filter((v) => v.created_by_id === match?.id);
        if (!active) return;
        setVehicles(list);
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
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [decodedName]);

  const displayName = user?.display_name || user?.handle || decodedName;

  return (
    <div className="space-y-5">
      <Link to={user?.handle ? `/user/${user.handle}` : "/feed"} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
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
          <p className="text-sm text-muted-foreground">{vehicles.length} {vehicles.length === 1 ? "build" : "builds"}</p>
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
      ) : vehicles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <Car className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No public builds in this garage yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((v) => <VehicleCard key={v.id} vehicle={v} />)}
        </div>
      )}
    </div>
  );
}