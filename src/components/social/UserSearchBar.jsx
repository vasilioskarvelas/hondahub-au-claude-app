import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Search, X } from "lucide-react";
import TierBadge from "@/components/identity/TierBadge";
import FollowButton from "@/components/social/FollowButton";
import { AccountTier } from "@/lib/registries";

export default function UserSearchBar() {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState(null);
  const [searching, setSearching] = React.useState(false);
  const [me, setMe] = React.useState(null);
  const [focused, setFocused] = React.useState(false);
  const debounce = React.useRef();

  React.useEffect(() => {
    base44.auth.me().then(setMe).catch(() => {});
  }, []);

  React.useEffect(() => {
    clearTimeout(debounce.current);
    setSearching(true);
    debounce.current = setTimeout(async () => {
      try {
        const res = await base44.functions.invoke("user-profile", {
          action: "searchUsers",
          query: query.trim(),
        });
        setResults(res.data?.users || []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, query.trim() ? 300 : 0);
  }, [query]);

  const showDropdown = focused;

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Search members by name or @handle…"
          className="w-full rounded-2xl border border-border bg-card py-2.5 pl-10 pr-10 text-sm outline-none focus:border-primary"
        />
        {query && (
          <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-border bg-popover/95 shadow-2xl backdrop-blur-xl">
          {searching ? (
            <div className="flex h-20 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-secondary border-t-primary" /></div>
          ) : results?.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">{query.trim() ? `No members found for "${query}".` : "No members to show."}</div>
          ) : (
            <div className="max-h-80 overflow-y-auto p-1.5">
              {results.map((u) => {
                const displayName = u.display_name || u.handle || u.full_name || "Member";
                const tier = u.account_tier || AccountTier.NEW_MEMBER;
                return (
                  <Link key={u.id} to={u.handle ? `/user/${encodeURIComponent(u.handle)}` : "#"} className="flex items-center gap-3 rounded-xl p-2 hover:bg-secondary">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-black text-primary-foreground">
                      {(displayName || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="block truncate text-sm font-bold group-hover:text-primary">{displayName}</span>
                      {u.handle && <p className="truncate text-xs text-muted-foreground">@{u.handle}</p>}
                    </div>
                    {me && me.id !== u.id && (
                      <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                        <FollowButton targetType="user" targetId={u.id} />
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}