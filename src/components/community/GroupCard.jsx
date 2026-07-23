import React from "react";
import { Link } from "react-router-dom";
import { Users, Lock, Globe } from "lucide-react";

export default function GroupCard({ group }) {
  const cover = group.cover_url;
  return (
    <Link to={`/group/${group.id}`} className="block overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary/40 active:scale-[0.98]">
      {cover ? (
        <div className="relative aspect-[3/1]">
          <img src={cover} alt={group.name} className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="flex aspect-[3/1] items-center justify-center bg-primary/10">
          <Users className="h-8 w-8 text-primary/40" />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold leading-tight">{group.name}</h3>
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${group.visibility === "private" ? "bg-amber-500/15 text-amber-400" : "bg-secondary text-muted-foreground"}`}>
            {group.visibility === "private" ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
            {group.visibility}
          </span>
        </div>
        {group.description && <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{group.description}</p>}
        <div className="mt-2 flex items-center justify-between">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" /> {group.member_count || 0} members
          </span>
          {group.is_member && <span className="text-[10px] font-bold text-primary">Joined ✓</span>}
        </div>
      </div>
    </Link>
  );
}