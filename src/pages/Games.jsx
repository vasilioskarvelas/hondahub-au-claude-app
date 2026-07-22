import React from "react";
import { base44 } from "@/api/base44Client";
import { Trophy, Gift, Gamepad2, Crown, Medal, Brain, Shuffle, Wrench, Gauge } from "lucide-react";
import { Link } from "react-router-dom";
import TriviaGame from "@/components/game/TriviaGame";
import MemoryMatchGame from "@/components/game/MemoryMatchGame";
import EngineBuilderGame from "@/components/game/EngineBuilderGame";
import BoostControllerGame from "@/components/game/BoostControllerGame";

import { getCurrentUser } from "@/lib/userIdentity";

const TABS = [
  { id: "trivia", label: "Trivia", icon: Brain, component: TriviaGame },
  { id: "memory_match", label: "Memory", icon: Shuffle, component: MemoryMatchGame },
  { id: "engine_builder", label: "Build", icon: Wrench, component: EngineBuilderGame },
  { id: "boost_controller", label: "Boost", icon: Gauge, component: BoostControllerGame },
];

export default function Games() {
  const [results, setResults] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [rewardMsg, setRewardMsg] = React.useState(null);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [activeTab, setActiveTab] = React.useState("trivia");

  const load = () => {
    base44.entities.GameResult.list("-created_date", 50).then((r) => {
      setResults(r);
      setLoading(false);
    });
  };
  React.useEffect(load, [refreshKey]);

  const handleWin = async (score, total) => {
    const name = getCurrentUser() || "Anonymous";
    try {
      await base44.entities.GameResult.create({
        user_name: name,
        game_type: activeTab,
        score,
        total_questions: total,
        won: true,
        reward_claimed: true,
      });

      const giveaways = await base44.entities.Giveaway.filter({ status: "active" }, "-created_date", 1);
      if (giveaways[0]) {
        await base44.entities.GiveawayEntry.create({
          giveaway_id: giveaways[0].id,
          user_name: name,
          entry_type: "subscriber_points",
          tickets: 1,
        });
        await base44.entities.Giveaway.update(giveaways[0].id, {
          total_entries: (giveaways[0].total_entries || 0) + 1,
        });
        setRewardMsg(`You earned a free entry into the ${giveaways[0].car_name} giveaway!`);
      } else {
        setRewardMsg("You won! No active giveaway right now — your win is saved.");
      }
      setRefreshKey((k) => k + 1);
    } catch {
      setRewardMsg("Your win has been saved!");
    }
  };

  const handleLose = async (score, total) => {
    const name = getCurrentUser() || "Anonymous";
    try {
      await base44.entities.GameResult.create({
        user_name: name,
        game_type: activeTab,
        score,
        total_questions: total,
        won: false,
        reward_claimed: false,
      });
      setRefreshKey((k) => k + 1);
    } catch {}
  };

  const leaderboard = React.useMemo(() => {
    const map = {};
    for (const r of results) {
      if (!r.won) continue;
      const name = r.user_name;
      if (!map[name]) map[name] = { name, wins: 0, bestScore: 0 };
      map[name].wins++;
      map[name].bestScore = Math.max(map[name].bestScore, r.score);
    }
    return Object.values(map).sort((a, b) => b.wins - a.wins || b.bestScore - a.bestScore).slice(0, 5);
  }, [results]);

  const myName = getCurrentUser();
  const myWins = results.filter((r) => r.user_name === (myName || "Anonymous") && r.won).length;

  const ActiveGame = TABS.find((t) => t.id === activeTab).component;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tighter">Games</h1>
          <p className="text-sm text-muted-foreground">Play, win rewards & climb the leaderboard.</p>
        </div>
        <Link to="/giveaway" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground glow-red">
          <Gift className="h-4 w-4" /> Prizes
        </Link>
      </div>

      {myWins > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4">
          <Trophy className="h-6 w-6 shrink-0 text-primary" />
          <div>
            <div className="text-sm font-bold">You've won {myWins} {myWins === 1 ? "game" : "games"}!</div>
            <div className="text-xs text-muted-foreground">Each win earns a free giveaway entry.</div>
          </div>
        </div>
      )}

      {rewardMsg && (
        <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4">
          <Gift className="h-6 w-6 shrink-0 text-primary" />
          <p className="text-sm font-bold text-primary">{rewardMsg}</p>
        </div>
      )}

      {/* Game tabs */}
      <div className="flex gap-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition ${
                active ? "bg-primary text-primary-foreground glow-red" : "border border-border bg-card text-muted-foreground hover:border-primary/50"
              }`}
            >
              <Icon className="h-4 w-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      <ActiveGame onWin={handleWin} onLose={handleLose} />

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Crown className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Champions</h2>
        </div>
        {loading ? (
          <div className="flex h-32 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" /></div>
        ) : leaderboard.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <Gamepad2 className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">No winners yet — be the first!</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {leaderboard.map((entry, i) => (
              <div key={i} className={`flex items-center gap-3 px-4 py-3 ${i !== leaderboard.length - 1 ? "border-b border-border" : ""}`}>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center text-sm font-black">
                  {i === 0 ? <Crown className="h-5 w-5 text-yellow-500" /> : i === 1 ? <Medal className="h-5 w-5 text-gray-400" /> : i === 2 ? <Medal className="h-5 w-5 text-amber-700" /> : <span className="text-muted-foreground">{i + 1}</span>}
                </div>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-primary/10 text-sm font-bold text-primary">
                  {entry.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{entry.name}</div>
                  <div className="text-xs text-muted-foreground">{entry.wins} {entry.wins === 1 ? "win" : "wins"} · Best score: {entry.bestScore}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}