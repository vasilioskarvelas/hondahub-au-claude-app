import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft, Users, Lock, Globe, Plus, CalendarDays } from "lucide-react";
import GroupRules from "@/components/group/GroupRules";
import GroupChat from "@/components/group/GroupChat";
import GroupMembers from "@/components/group/GroupMembers";

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
    <div className="mx-auto max-w-2xl space-y-5 pb-6">
      <button onClick={() => navigate("/groups")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Groups</button>

      {group.cover_url ? (
        <div className="relative h-40 overflow-hidden rounded-2xl border border-border sm:h-48">
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
          <button disabled={busy} onClick={() => call({ action: "leaveGroup", group_id: id })} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground disabled:opacity-50">Leave Group</button>
        )}
        {isManager && (
          <button onClick={() => navigate(`/event/create?group=${id}`)} className="inline-flex items-center gap-1.5 rounded-xl border border-primary px-4 py-2.5 text-sm font-bold text-primary hover:bg-primary/10"><CalendarDays className="h-4 w-4" /> Create Event</button>
        )}
      </div>

      <GroupRules groupId={id} rules={group.rules} isOwner={isOwner} onUpdate={(r) => setData((d) => ({ ...d, group: { ...d.group, rules: r } }))} />

      {amActive ? (
        <GroupChat groupId={id} />
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {amPending ? "Once approved, you can join the chat." : "Join this group to see the chat and post messages."}
        </div>
      )}

      <GroupMembers groupId={id} members={members} pending={pending} isManager={isManager} isOwner={isOwner} me={user} onAction={call} busy={busy} />
    </div>
  );
}