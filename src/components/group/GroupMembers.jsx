import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Users, Crown, Shield, UserMinus, Check, X, UserPlus, Search } from "lucide-react";

const ROLE_META = {
  owner: { label: "Owner", icon: Crown, cls: "bg-primary/15 text-primary" },
  moderator: { label: "Mod", icon: Shield, cls: "bg-blue-500/15 text-blue-400" },
  member: { label: "Member", icon: Users, cls: "bg-secondary text-muted-foreground" },
};

export default function GroupMembers({ groupId, members, pending, isManager, isOwner, me, onAction, busy }) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState([]);
  const [searching, setSearching] = React.useState(false);
  const deb = React.useRef();

  React.useEffect(() => {
    clearTimeout(deb.current);
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    deb.current = setTimeout(async () => {
      try {
        const res = await base44.functions.invoke("user-profile", { action: "searchUsers", query: query.trim() });
        setResults(res.data?.users || []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
  }, [query]);

  const invite = async (uid) => {
    await onAction({ action: "inviteMember", group_id: groupId, invitee_user_id: uid });
    setQuery(""); setResults([]);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Members ({members?.length || 0})</h2>

      {isManager && (
        <div className="mb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Invite a member by name or @handle…" className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:border-primary" />
          </div>
          {query.trim() && (
            <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-border bg-popover/95">
              {searching ? <div className="p-3 text-center text-xs text-muted-foreground">Searching…</div>
                : results.length === 0 ? <div className="p-3 text-center text-xs text-muted-foreground">No users found.</div>
                : results.filter((u) => !members?.some((m) => m.user_id === u.id)).map((u) => (
                  <button key={u.id} onClick={() => invite(u.id)} className="flex w-full items-center gap-2 p-2 text-left hover:bg-secondary">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{(u.display_name || u.handle || "?").charAt(0).toUpperCase()}</div>
                    <div className="flex-1 min-w-0">
                      <span className="block truncate text-sm font-medium">{u.display_name || u.handle}</span>
                      {u.handle && <span className="text-xs text-muted-foreground">@{u.handle}</span>}
                    </div>
                    <UserPlus className="h-4 w-4 text-primary" />
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      {isManager && pending?.length > 0 && (
        <div className="mb-3 space-y-2 rounded-xl border border-border bg-background/40 p-3">
          <p className="text-xs font-bold uppercase text-muted-foreground">Pending ({pending.length})</p>
          {pending.map((m) => (
            <div key={m.user_id} className="flex items-center justify-between">
              <span className="text-sm font-medium">{m.display_name}</span>
              <div className="flex gap-2">
                <button disabled={busy} onClick={() => onAction({ action: "approveMember", group_id: groupId, member_user_id: m.user_id })} className="rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground disabled:opacity-50"><Check className="h-3.5 w-3.5" /></button>
                <button disabled={busy} onClick={() => onAction({ action: "removeMember", group_id: groupId, member_user_id: m.user_id, reason: "request rejected" })} className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground disabled:opacity-50"><X className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {members?.map((m) => {
          const meta = ROLE_META[m.role] || ROLE_META.member;
          const Icon = meta.icon;
          const canRemove = isManager && m.role !== "owner" && m.user_id !== me?.id && (isOwner || m.role === "member");
          return (
            <div key={m.user_id} className="flex items-center justify-between rounded-xl border border-border bg-background/40 px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{(m.display_name || "?").charAt(0).toUpperCase()}</div>
                <div>
                  <Link to={`/user/${encodeURIComponent(m.handle || m.display_name)}/garage`} className="text-sm font-medium hover:text-primary">{m.display_name}</Link>
                  <div><span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${meta.cls}`}><Icon className="h-2.5 w-2.5" /> {meta.label}</span></div>
                </div>
              </div>
              {canRemove && <button disabled={busy} onClick={() => onAction({ action: "removeMember", group_id: groupId, member_user_id: m.user_id, reason: "removed by group manager" })} className="rounded-lg border border-destructive/40 px-2.5 py-1 text-xs font-bold text-destructive hover:bg-destructive/10 disabled:opacity-50"><UserMinus className="h-3.5 w-3.5" /></button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}