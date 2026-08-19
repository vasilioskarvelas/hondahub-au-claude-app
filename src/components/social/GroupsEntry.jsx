import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Users, ArrowRight } from "lucide-react";

// Groups entry surface for the Socials page — a tappable card that links to
// the full Groups directory. Matches HondaHub's dark + red-accent design.
export default function GroupsEntry() {
  const [groups, setGroups] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    base44.functions.invoke("group", { action: "listDirectory", search: "", visibility: "" })
      .then((res) => setGroups(res.data?.groups || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const preview = groups.slice(0, 3);

  return (
    <Link to="/groups" className="group block overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary/50">
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Users className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-bold">Groups & Clubs</div>
            <div className="text-xs text-muted-foreground">Join Honda communities across Australia</div>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>

      {!loading && preview.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-t border-border px-4 py-3 scrollbar-hide">
          {preview.map((g) => (
            <div key={g.id} className="flex min-w-0 shrink-0 items-center gap-2 rounded-xl bg-secondary/60 px-2.5 py-1.5">
              {g.cover_media_url ? (
                <img src={g.cover_media_url} alt="" className="h-6 w-6 rounded-md object-cover" />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-[10px] font-bold text-primary">{(g.name || "?").charAt(0).toUpperCase()}</span>
              )}
              <span className="max-w-[8rem] truncate text-xs font-medium">{g.name}</span>
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}