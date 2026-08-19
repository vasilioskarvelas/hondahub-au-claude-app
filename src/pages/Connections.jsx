import React from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Users, Search } from "lucide-react";
import TierBadge from "@/components/identity/TierBadge";
import FollowButton from "@/components/social/FollowButton";
import { AccountTier } from "@/lib/registries";

export default function Connections() {
  const { name } = useParams();
  const [params] = useSearchParams();
  const tab = params.get("tab") === "following" ? "following" : "followers";
  const [profileUser, setProfileUser] = React.useState(null);
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [me, setMe] = React.useState(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState(null);
  const [searching, setSearching] = React.useState(false);

  const decoded = decodeURIComponent(name || "");

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        let u;
        if (decoded) {
          let users = await base44.entities.User.filter({ handle: decoded });
          if (users.length === 0) users = await base44.entities.User.filter({ display_name: decoded });
          u = users[0];
        }
        const targetId = u?.id;
        setProfileUser(u || null);
        try { const m = await base44.auth.me(); setMe(m); } catch {}
        if (targetId) {
          const res = await base44.functions.invoke("social", {
            action: tab === "following" ? "listFollowing" : "listFollowers",
            user_id: targetId,
          });
          setRows(res.data?.follows || []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [decoded, tab]);

  const debounced = React.useRef();
  React.useEffect(() => {
    clearTimeout(debounced.current);
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    debounced.current = setTimeout(async () => {
      try {
        const res = await base44.functions.invoke("user-profile", {
          action: "searchUsers",
          query: searchQuery.trim(),
        });
        setSearchResults(res.data?.users || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [searchQuery]);

  const isSearching = searchQuery.trim().length > 0;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link to={decoded ? `/user/${decoded}` : "/feed"} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back</Link>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search members by name or @handle…"
          className="w-full rounded-2xl border border-border bg-card py-2.5 pl-10 pr-4 text-sm outline-none focus:border-primary"
        />
      </div>

      {isSearching ? (
        searching && !searchResults ? (
          <div className="flex h-32 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" /></div>
        ) : searchResults?.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">No members found for "{searchQuery}".</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{searchResults.length} result{searchResults.length !== 1 ? "s" : ""}</p>
            {searchResults.map((u) => (
              <SearchResultRow key={u.id} user={u} me={me} />
            ))}
          </div>
        )
      ) : (
        <>
          <div className="flex gap-2 rounded-2xl border border-border bg-card p-1">
            <TabBtn active={tab === "followers"} to={decoded ? `/connections/${decoded}?tab=followers` : "/connections?tab=followers"}>Followers</TabBtn>
            <TabBtn active={tab === "following"} to={decoded ? `/connections/${decoded}?tab=following` : "/connections?tab=following"}>Following</TabBtn>
          </div>

          {loading ? (
            <div className="flex h-32 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" /></div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
              <Users className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">No {tab} yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => {
                const userId = tab === "following" ? r.target_id : r.follower_id;
                return <UserRow key={r.id} userId={userId} me={me} />;
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SearchResultRow({ user, me }) {
  const displayName = user.display_name || user.handle || user.full_name || "Member";
  const tier = user.account_tier || AccountTier.NEW_MEMBER;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <Link to={user.handle ? `/user/${user.handle}/garage` : "#"} className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-sm font-black text-primary-foreground">
        {(displayName || "?").charAt(0).toUpperCase()}
      </Link>
      <div className="flex-1 min-w-0">
        <Link to={user.handle ? `/user/${user.handle}/garage` : "#"} className="block truncate text-sm font-bold hover:text-primary">{displayName}</Link>
        {user.handle && <p className="truncate text-xs text-muted-foreground">@{user.handle}</p>}
        <TierBadge tier={tier} />
      </div>
      {me && me.id !== user.id && (
        <FollowButton targetType="user" targetId={user.id} />
      )}
    </div>
  );
}

function UserRow({ userId, me }) {
  const [u, setU] = React.useState(null);
  React.useEffect(() => {
    base44.entities.User.get(userId).then(setU).catch(() => setU(null));
  }, [userId]);
  if (!u) return <div className="h-16 animate-pulse rounded-xl bg-secondary/40" />;
  const displayName = u.display_name || u.handle || u.full_name || "Member";
  const tier = u.account_tier || AccountTier.NEW_MEMBER;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <Link to={u.handle ? `/user/${u.handle}/garage` : "#"} className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-sm font-black text-primary-foreground">
        {(displayName || "?").charAt(0).toUpperCase()}
      </Link>
      <div className="flex-1 min-w-0">
        <Link to={u.handle ? `/user/${u.handle}/garage` : "#"} className="block truncate text-sm font-bold hover:text-primary">{displayName}</Link>
        {u.handle && <p className="truncate text-xs text-muted-foreground">@{u.handle}</p>}
        <TierBadge tier={tier} />
      </div>
      {me && me.id !== u.id && (
        <FollowButton targetType="user" targetId={u.id} />
      )}
    </div>
  );
}

function TabBtn({ active, to, children }) {
  return (
    <Link to={to} className={`flex-1 rounded-xl py-2 text-center text-sm font-bold transition ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
      {children}
    </Link>
  );
}