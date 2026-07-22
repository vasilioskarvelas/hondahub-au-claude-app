import React from "react";
import { Users, Plus, Lock, Globe } from "lucide-react";

const SAMPLE_GROUPS = [
  { name: "K-Series Australia", members: 1240, type: "public", desc: "For all K20/K24 swapped builds across AU" },
  { name: "B-Series Track Day Crew", members: 856, type: "public", desc: "Track-focused B-series builds and lap times" },
  { name: "EG/EK Civic Owners", members: 2100, type: "public", desc: "Classic Civic chassis enthusiasts" },
  { name: "S2000 Owners Club", members: 670, type: "public", desc: "AP1/AP2 owners and F20C/F22C builds" },
  { name: "Integra Type R AU", members: 430, type: "private", desc: "DC2/DC5 ITR owners — verified only" },
  { name: "Naturally Aspirated", members: 980, type: "public", desc: "NA builds — no turbo, no supercharger" },
];

export default function Groups() {
  const [search, setSearch] = React.useState("");
  const [joined, setJoined] = React.useState({});
  const filtered = SAMPLE_GROUPS.filter(
    (g) => g.name.toLowerCase().includes(search.toLowerCase()) || g.desc.toLowerCase().includes(search.toLowerCase())
  );

  const toggleJoin = (name) => setJoined((prev) => ({ ...prev, [name]: !prev[name] }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tighter">Groups & Clubs</h1>
          <p className="text-sm text-muted-foreground">Join Honda communities across Australia.</p>
        </div>
        <button className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground glow-red">
          <Plus className="h-4 w-4" /> Create
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search groups..."
        className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((g) => (
          <div key={g.name} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold">{g.name}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {g.type === "private" ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                    {g.members} members
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{g.desc}</p>
            <button
              onClick={() => toggleJoin(g.name)}
              className={`mt-3 w-full rounded-xl border py-2 text-sm font-bold transition ${
                joined[g.name] ? "border-green-500 bg-green-500/10 text-green-400" : "border-primary text-primary hover:bg-primary/10"
              }`}
            >
              {joined[g.name] ? "Joined ✓" : g.type === "private" ? "Request to Join" : "Join Group"}
            </button>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <Users className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">No groups found. Try a different search.</p>
        </div>
      )}
    </div>
  );
}