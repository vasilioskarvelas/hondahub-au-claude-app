import React from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, MapPin, Grid3x3, Users } from "lucide-react";
import TierBadge from "@/components/identity/TierBadge";
import PostCard from "@/components/social/PostCard";
import FollowButton from "@/components/social/FollowButton";
import { ReportButton } from "@/components/moderation/ReportDialog";
import { AccountTier } from "@/lib/registries";

export default function UserProfile() {
  const { name } = useParams();
  const decodedName = decodeURIComponent(name || "");
  const [profileUser, setProfileUser] = React.useState(null);
  const [trustScore, setTrustScore] = React.useState(null);
  const [me, setMe] = React.useState(null);
  const [posts, setPosts] = React.useState([]);
  const [following, setFollowing] = React.useState(false);
  const [followersCount, setFollowersCount] = React.useState(0);
  const [followingCount, setFollowingCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [avatarUrl, setAvatarUrl] = React.useState(null);

  const load = async (u) => {
    const ts = await base44.entities.TrustScore.filter({ user_id: u.id });
    setTrustScore(ts[0] || null);
    if (u.avatar_media_id) {
      base44.functions.invoke("media", { action: "get", media_id: u.avatar_media_id })
        .then((r) => setAvatarUrl(r.data?.media?.file_url || null))
        .catch(() => setAvatarUrl(null));
    } else {
      setAvatarUrl(null);
    }
    const [postsRes, folRes, folgRes] = await Promise.all([
      base44.functions.invoke("social", { action: "listProfilePosts", user_id: u.id }).catch(() => ({ data: { posts: [] } })),
      base44.functions.invoke("social", { action: "listFollowers", user_id: u.id }).catch(() => ({ data: { count: 0 } })),
      base44.functions.invoke("social", { action: "listFollowing", user_id: u.id }).catch(() => ({ data: { count: 0 } })),
    ]);
    setPosts(postsRes.data?.posts || []);
    setFollowersCount(folRes.data?.count || 0);
    setFollowingCount(folgRes.data?.count || 0);
  };

  React.useEffect(() => {
    setLoading(true);
    setNotFound(false);
    (async () => {
      try {
        const cleanName = decodedName.replace(/^@/, "");
        // Use the searchUsers backend (service-role) which reliably finds users,
        // then pick the exact handle/display_name match from results.
        const res = await base44.functions.invoke("user-profile", { action: "searchUsers", query: cleanName });
        const all = res.data?.users || [];
        const lower = cleanName.toLowerCase();
        let match = all.find((u) => u.handle && u.handle.toLowerCase() === lower)
          || all.find((u) => u.display_name && u.display_name.toLowerCase() === lower)
          || all[0];
        if (!match) { setNotFound(true); setProfileUser(null); return; }
        // Fetch the full user record (service role already used by search; get full fields).
        const full = await base44.entities.User.get(match.id);
        setProfileUser(full);
        try { const m = await base44.auth.me(); setMe(m);
          if (m.id !== full.id) {
            const f = await base44.functions.invoke("social", { action: "isFollowing", target_type: "user", target_id: full.id });
            setFollowing(!!f.data?.following);
          }
        } catch {}
        await load(full);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [decodedName]);

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" /></div>;

  if (notFound || !profileUser) {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <Link to="/feed" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back</Link>
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <h3 className="font-bold">User not found</h3>
          <p className="mt-1 text-sm text-muted-foreground">@{decodedName} doesn't exist.</p>
        </div>
      </div>
    );
  }

  const tier = trustScore?.current_tier || profileUser.account_tier || AccountTier.NEW_MEMBER;
  const score = trustScore?.current_score ?? 0;
  const displayName = profileUser.display_name || profileUser.handle || profileUser.full_name || decodedName;
  const isOwn = me?.id === profileUser.id;
  const connectionsPath = `/connections/${encodeURIComponent(profileUser.handle || displayName)}`;

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link to="/feed" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to feed</Link>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="carbon-bg h-24 bg-secondary" />
        <div className="px-5 pb-5">
          <div className="-mt-10 flex items-end gap-4">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-card bg-primary text-2xl font-black text-primary-foreground">
              {avatarUrl
                ? <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" style={{ objectPosition: profileUser.avatar_position || "50% 50%" }} />
                : displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 pb-1">
              <h1 className="text-xl font-black">{displayName}</h1>
              {profileUser.handle && <p className="text-xs text-muted-foreground">@{profileUser.handle}</p>}
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <TierBadge tier={tier} score={score} />
                {profileUser.location_general && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" /> {profileUser.location_general}</span>
                )}
              </div>
            </div>
            {!isOwn && me && (
              <div className="flex items-center gap-2">
                <FollowButton targetType="user" targetId={profileUser.id} initialFollowing={following} onToggle={setFollowing} />
                <ReportButton targetType="user" targetId={profileUser.id} />
              </div>
            )}
          </div>
          {profileUser.bio && <p className="mt-4 text-sm text-muted-foreground">{profileUser.bio}</p>}
          <div className="mt-4 flex items-center gap-4 text-sm">
            <Link to={`${connectionsPath}?tab=followers`} className="hover:text-primary"><span className="font-bold">{followersCount}</span> <span className="text-muted-foreground">followers</span></Link>
            <Link to={`${connectionsPath}?tab=following`} className="hover:text-primary"><span className="font-bold">{followingCount}</span> <span className="text-muted-foreground">following</span></Link>
            <Link to={`/user/${encodeURIComponent(profileUser.handle || displayName)}/garage`} className="ml-auto inline-flex items-center gap-1 rounded-xl border border-border px-3 py-1.5 text-xs font-bold hover:border-primary hover:text-primary">
              <Users className="h-3.5 w-3.5" /> View Garage
            </Link>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground"><Grid3x3 className="h-4 w-4" /> Posts</div>
        {posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">No posts yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((p) => <PostCard key={p.id} post={p} />)}
          </div>
        )}
      </div>
    </div>
  );
}