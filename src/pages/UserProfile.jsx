import React from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, MapPin } from "lucide-react";
import TierBadge from "@/components/identity/TierBadge";
import { AccountTier } from "@/lib/registries";

export default function UserProfile() {
  const { name } = useParams();
  const decodedName = decodeURIComponent(name || "");
  const [profileUser, setProfileUser] = React.useState(null);
  const [trustScore, setTrustScore] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);

  React.useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        // Lookup by handle first, then display_name fallback.
        let users = await base44.entities.User.filter({ handle: decodedName });
        if (users.length === 0) {
          users = await base44.entities.User.filter({ display_name: decodedName });
        }
        if (users.length === 0) {
          setNotFound(true);
          setProfileUser(null);
        } else {
          const u = users[0];
          setProfileUser(u);
          const ts = await base44.entities.TrustScore.filter({ user_id: u.id });
          setTrustScore(ts[0] || null);
        }
      } catch (e) {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [decodedName]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" /></div>;
  }

  if (notFound || !profileUser) {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <Link to="/community" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back</Link>
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

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link to="/community" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back</Link>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="carbon-bg h-24 bg-secondary" />
        <div className="px-5 pb-5">
          <div className="-mt-10 flex items-end gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-card bg-primary text-2xl font-black text-primary-foreground">
              {displayName.charAt(0).toUpperCase()}
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
          </div>
          {profileUser.bio && <p className="mt-4 text-sm text-muted-foreground">{profileUser.bio}</p>}
        </div>
      </div>
    </div>
  );
}