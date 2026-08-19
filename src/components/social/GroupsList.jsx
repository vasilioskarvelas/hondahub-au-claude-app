import React from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Plus, Users } from "lucide-react";
import GroupCard from "@/components/community/GroupCard";

// Full groups directory rendered inline on the Socials Groups tab — no
// "view all" sub-button; every group is listed here directly.
export default function GroupsList() {
  const navigate = useNavigate();
  const [groups, setGroups] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    base44.functions.invoke("group", { action: "listDirectory", search: "", visibility: "" })
      .then((res) => setGroups(res.data?.groups || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black tracking-tight">Groups & Clubs</h2>
          <p className="text-xs text-muted-foreground">Honda communities across Australia.</p>
        </div>
        <button onClick={() => navigate("/group/create")} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
          <Plus className="h-4 w-4" /> Create
        </button>
      </div>
      {loading ? (
        <div className="flex h-48 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" /></div>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <Users className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">No groups yet.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => <GroupCard key={g.id} group={g} />)}
        </div>
      )}
    </div>
  );
}