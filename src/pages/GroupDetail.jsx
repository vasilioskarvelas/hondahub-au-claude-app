import React from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft, Users, Lock, Globe, Crown, Shield, UserMinus, Check, X, Plus, CalendarDays } from "lucide-react";

const ROLE_META = {
  owner: { label: "Owner", icon: Crown, cls: "bg-primary/15 text-primary" },
  moderator: { label: "Mod", icon: Shield, cls: "bg-blue-500/15 text-blue-400" },
  member: { label: "Member", icon: Users, cls: "bg-secondary text-muted-foreground" },
};

export default function GroupDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("group", { action: "getGroup", group_id: id });
      if (res.data?.ok) setData(res.data);
      else setError(res.data?.error || "Failed to load");
    } finally { setLoading(false); }
  };
  React.useEffect(() => { load(); }, [id]);

  const call = async (payload) => {
    setBusy(true); setError("");
    try {
      const res = await base44.functions.invoke("group", payload);
      if (res.data?.ok) await load();
      else setError(res.data?.error || res.data?.details?.membership || "Action failed");
    } finally { setBusy(false); }
  };

  if (loading) return <div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" /></div>;
  if (!data) return <div className="flex flex-col items-center justify-center py-20 text-center"><p className="text-lg font-bold">Group not found</p><button onClick={() => navigate("/groups")} className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Back to Groups</button></div>;

  const { group, my_membership, members, pending } = data;
  const mine = my_membership;
  const amActive = mine?.status === "active";
  const amPending = mine?.status === "pending_approval";
  const myRole = mine?.role;
  const isManager = myRole === "moderator" || myRole === "owner";
  const isOwner = myRole === "owner";

  return (
    <div className="space-y-5 pb-6">
      <button onClick={() => navigate("/groups")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Groups</button>

      {group.cover_url ? (
        <div className="relative h-40 overflow-hidden rounded-2xl border border-border sm:h-52">
          <img src={group.cover_url} alt={group.name} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <h1 className="absolute bottom-3 left-4 text-2xl font-black text-white">{group.name}</h1>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-card p-5"><h1 className="text-2xl font-black">{group.name}</h1></div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${group.visibility === "private" ? "bg-amber-500/15 text-amber-400" : "bg-secondary text-muted-foreground"}`}>
          {group.visibility === "private" ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />} {group.visibility}
        </span>
        <span className="inline-flex items-center gap-1 text-muted-foreground"><Users className="h-3.5 w-3.5" /> {group.member_count || 0} members</span>
      </div>

      {group.description && <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{group.description}</p>}

      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      <div className="flex flex-wrap gap-2">
        {!amActive && !amPending && group.status === "active" && (
          <button disabled={busy} onClick={() => call({ action: "joinGroup", group_id: id })} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
            <Plus className="h-4 w-4" /> {group.visibility === "private" ? "Request to Join" : "Join Group"}
          </button>
        )}
        {amPending && <span className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-muted-foreground">Request sent</span>}
        {amActive && myRole !== "owner" && (
          <button disabled={busy} onClick={() => call({ action: "leaveGroup", group_id: id })} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground disabled:opacity-50">
            <UserMinus className="h-4 w-4" /> Leave Group
          </button>
        )}
        {isManager && (
          <button onClick={() => navigate(`/event/create?group=${id}`)} className="inline-flex items-center gap-1.5 rounded-xl border border-primary px-4 py-2.5 text-sm font-bold text-primary hover:bg-primary/10">
            <CalendarDays className="h-4 w-4" /> Create Event
          </button>
        )}
      </div>

      {isManager && pending?.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Pending Requests ({pending.length})</h2>
          <div className="space-y-2">
            {pending.map((m) => (
              <div key={m.user_id} className="flex items-center justify-between rounded-xl border border-border bg-background/40 px-3 py-2">
                <span className="text-sm font-medium">{m.display_name}</span>
                <div className="flex gap-2">
                  <button disabled={busy} onClick={() => call({ action: "approveMember", group_id: id, member_user_id: m.user_id })} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"><Check className="h-3.5 w-3.5" /></button>
                  <button disabled={busy} onClick={() => call({ action: "removeMember", group_id: id, member_user_id: m.user_id, reason: "request rejected" })} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground disabled:opacity-50"><X className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {members?.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Members ({members.length})</h2>
          <div className="space-y-2">
            {members.map((m) => {
              const meta = ROLE_META[m.role] || ROLE_META.member;
              const Icon = meta.icon;
              const canRemove = isManager && m.role !== "owner" && m.user_id !== user?.id && (myRole === "owner" || m.role === "member");
              const canPromote = isOwner && m.user_id !== user?.id && m.role !== "owner";
              return (
                <div key={m.user_id} className="flex items-center justify-between rounded-xl border border-border bg-background/40 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{(m.display_name || "?").charAt(0).toUpperCase()}</div>
                    <div>
                      <Link to={`/user/${encodeURIComponent(m.handle || m.display_name)}/garage`} className="text-sm font-medium hover:text-primary">{m.display_name}</Link>
                      <div className="flex items-center gap-1"><span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${meta.cls}`}><Icon className="h-2.5 w-2.5" /> {meta.label}</span></div>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {canPromote && (
                      <button disabled={busy} onClick={() => call({ action: "changeMemberRole", group_id: id, member_user_id: m.user_id, new_role: m.role === "moderator" ? "member" : "moderator" })} className="rounded-lg border border-border px-2.5 py-1 text-xs font-bold text-muted-foreground hover:text-foreground disabled:opacity-50">{m.role === "moderator" ? "Demote" : "Promote"}</button>
                    )}
                    {canRemove && (
                      <button disabled={busy} onClick={() => call({ action: "removeMember", group_id: id, member_user_id: m.user_id, reason: "removed by group manager" })} className="rounded-lg border border-destructive/40 px-2.5 py-1 text-xs font-bold text-destructive hover:bg-destructive/10 disabled:opacity-50"><UserMinus className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}