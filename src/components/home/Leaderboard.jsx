import React from "react";
import { Link } from "react-router-dom";
import { Trophy, Crown, Medal } from "lucide-react";

export default function Leaderboard({ entries }) {
  if (!entries || entries.length === 0) return null;

  const top = entries.slice(0, 5);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Trophy className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Savings Leaderboard</h2>
        <span className="ml-auto rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-bold text-primary">Top Members</span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {top.map((entry, i) => (
          <Link
            key={i}
            to={`/user/${encodeURIComponent(entry.name)}`}
            className={`flex items-center gap-3 px-4 py-3 transition hover:bg-secondary/50 ${i !== top.length - 1 ? "border-b border-border" : ""}`}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black">
              {i === 0 ? (
                <Crown className="h-5 w-5 text-yellow-500" />
              ) : i === 1 ? (
                <Medal className="h-5 w-5 text-gray-400" />
              ) : i === 2 ? (
                <Medal className="h-5 w-5 text-amber-700" />
              ) : (
                <span className="text-muted-foreground">{i + 1}</span>
              )}
            </div>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-primary/10 text-sm font-bold text-primary">
              {entry.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold">{entry.name}</div>
              <div className="text-xs text-muted-foreground">{entry.posts} posts · {entry.garageCars} builds</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-black text-primary">{entry.points}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">points</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}