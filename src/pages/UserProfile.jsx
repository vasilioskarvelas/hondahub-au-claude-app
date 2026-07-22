import React from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, BadgeCheck, MapPin, Instagram, Calendar, Users, Grid3x3, X, Layers, Image as ImageIcon, UserPlus, UserCheck, Heart, Gift } from "lucide-react";
import SocialPostCard from "@/components/social/SocialPostCard";
import { getCurrentUser, isFollowing, toggleFollow } from "@/lib/userIdentity";

export default function UserProfile() {
  const { name } = useParams();
  const decodedName = decodeURIComponent(name || "");
  const [posts, setPosts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [followers, setFollowers] = React.useState([]);
  const [following, setFollowing] = React.useState([]);
  const [rewardEntries, setRewardEntries] = React.useState([]);
  const [profile, setProfile] = React.useState(null);
  const [isFollowingUser, setIsFollowingUser] = React.useState(isFollowing(decodedName));
  const [selectedPost, setSelectedPost] = React.useState(null);
  const me = getCurrentUser();
  const isOwn = decodedName === me;

  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      base44.entities.CommunityPost.filter({ author_name: decodedName }, "-created_date", 50),
      base44.entities.Follow.filter({ following_name: decodedName }, "-created_date", 100),
      base44.entities.Follow.filter({ follower_name: decodedName }, "-created_date", 100),
      base44.entities.GiveawayEntry.filter({ user_name: decodedName }, "-created_date", 100),
    ]).then(([p, fl, fg, ge]) => {
      setPosts(p);
      setFollowers(fl);
      setFollowing(fg);
      setRewardEntries(ge);
      base44.entities.Profile.filter({ display_name: decodedName }).then((pr) => setProfile(pr[0] || null));
      setLoading(false);
    });
  }, [decodedName]);

  const totalLikes = posts.reduce((sum, p) => sum + (p.likes || 0), 0);
  const rewardPoints = rewardEntries
    .filter((e) => e.entry_type === "subscriber_points")
    .reduce((sum, e) => sum + (e.tickets || 0), 0);

  const handleFollow = async () => {
    const now = toggleFollow(decodedName);
    setIsFollowingUser(now);
    if (now) {
      await base44.entities.Follow.create({ follower_name: me || "Anonymous", following_name: decodedName });
      base44.entities.Notification.create({ type: "follow", from_name: me || "Anonymous", to_name: decodedName, text: "started following you", read: false });
    } else {
      const records = await base44.entities.Follow.filter({ follower_name: me, following_name: decodedName });
      if (records[0]) await base44.entities.Follow.delete(records[0].id);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link to="/community" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="relative h-28 bg-gradient-to-br from-primary/25 via-secondary to-background">
          <div className="absolute inset-0 carbon-bg opacity-40" />
        </div>
        <div className="px-4 pb-4">
          <div className="-mt-10 flex items-end justify-between">
            <div className="relative shrink-0">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={decodedName} className="h-20 w-20 rounded-full object-cover ring-4 ring-card" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/40 to-primary/10 text-2xl font-black text-primary ring-4 ring-card">
                  {(decodedName || "?").charAt(0).toUpperCase()}
                </div>
              )}
              <BadgeCheck className="absolute bottom-0.5 right-0.5 h-5 w-5 rounded-full bg-card text-primary" />
            </div>
            {!isOwn && (
              <button onClick={handleFollow} className={`mb-1 shrink-0 rounded-full px-5 py-2 text-sm font-bold transition ${isFollowingUser ? "border border-border bg-transparent text-muted-foreground" : "bg-primary text-primary-foreground glow-red"}`}>
                {isFollowingUser ? "Following" : "Follow"}
              </button>
            )}
          </div>
          <div className="mt-2">
            <h1 className="text-xl font-black leading-tight tracking-tight">{decodedName}</h1>
            {(profile?.bio || posts[0]?.vehicle_model) && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {profile?.bio || `${posts[0].vehicle_model}${posts[0].chassis_code ? ` · ${posts[0].chassis_code}` : ""}`}
              </p>
            )}
          </div>
        </div>
        <div className="flex divide-x divide-border border-t border-border text-center">
          <div className="flex flex-1 flex-col items-center justify-center py-3">
            <div className="text-base font-bold text-foreground">{posts.length}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">posts</div>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center py-3">
            <div className="text-base font-bold text-foreground">{followers.length}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">followers</div>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center py-3">
            <div className="text-base font-bold text-foreground">{totalLikes}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">likes</div>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center py-3">
            <div className="text-base font-bold text-primary">{rewardPoints}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">points</div>
          </div>
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Grid3x3 className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Posts</h2>
        </div>
        {loading ? (
          <div className="flex h-32 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" /></div>
        ) : posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">No posts yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {posts.map((p) => {
              const photo = p.photos?.[0];
              const hasMultiple = (p.photos?.length || 0) > 1;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedPost(p)}
                  className="group relative aspect-square overflow-hidden bg-secondary"
                >
                  {photo ? (
                    <img src={photo} alt={p.caption} className="h-full w-full object-cover transition group-hover:scale-105" />
                  ) : p.video_url ? (
                    <video src={p.video_url} className="h-full w-full object-cover" muted />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground"><Users className="h-6 w-6" /></div>
                  )}
                  {hasMultiple && (
                    <span className="absolute right-1.5 top-1.5 text-white drop-shadow-lg">
                      <Layers className="h-4 w-4" />
                    </span>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/30">
                    <div className="flex items-center gap-3 text-white opacity-0 transition group-hover:opacity-100">
                      <span className="flex items-center gap-1 text-xs font-bold">❤️ {p.likes || 0}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {selectedPost && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-2 sm:p-4" onClick={() => setSelectedPost(null)}>
          <div className="relative my-auto w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelectedPost(null)} className="absolute -top-10 right-0 z-10 rounded-full bg-card p-2 text-foreground shadow-lg">
              <X className="h-5 w-5" />
            </button>
            <SocialPostCard post={selectedPost} />
          </div>
        </div>
      )}
    </div>
  );
}