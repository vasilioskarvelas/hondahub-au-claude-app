import React from "react";
import { base44 } from "@/api/base44Client";
import { Timer, ArrowRight, BadgeCheck } from "lucide-react";
import { Link } from "react-router-dom";

function parseTimeToSeconds(timeStr) {
  if (!timeStr) return Infinity;
  const parts = timeStr.split(":");
  if (parts.length === 2) {
    const mins = parseFloat(parts[0]);
    const secs = parseFloat(parts[1]);
    return isNaN(mins) || isNaN(secs) ? Infinity : mins * 60 + secs;
  }
  const val = parseFloat(timeStr);
  return isNaN(val) ? Infinity : val;
}

const ENGINE_FAMILIES = ["K", "B", "D", "H", "F"];

export default function TrackLeaderboard() {
  const [cars, setCars] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState("na");
  const [familyFilter, setFamilyFilter] = React.useState("All");

  React.useEffect(() => {
    base44.entities.GarageCar.filter({ track_time: { $ne: null } }, "-created_date", 100)
      .then((c) => {
        setCars(c);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = React.useMemo(() => {
    return cars
      .filter((c) => c.induction_type === tab)
      .sort((a, b) => parseTimeToSeconds(a.track_time) - parseTimeToSeconds(b.track_time));
  }, [cars, tab]);

  const topByFamily = React.useMemo(() => {
    const result = {};
    const families = familyFilter === "All" ? ENGINE_FAMILIES : [familyFilter];
    for (const family of families) {
      const top = filtered.filter((c) => c.engine_family === family).slice(0, 3);
      if (top.length > 0) result[family] = top;
    }
    return result;
  }, [filtered, familyFilter]);

  const hasData = Object.keys(topByFamily).length > 0;

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Timer className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">Track Leaderboard</h2>
        <Link to="/garage" className="ml-auto text-xs text-primary">Full garage <ArrowRight className="inline h-3 w-3" /></Link>
      </div>

      <div className="mb-3 flex gap-1 rounded-xl border border-border bg-card p-1">
        <button
          onClick={() => setTab("na")}
          className={`flex-1 rounded-lg py-2 text-xs font-bold transition sm:text-sm ${tab === "na" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          Naturally Aspirated
        </button>
        <button
          onClick={() => setTab("fi")}
          className={`flex-1 rounded-lg py-2 text-xs font-bold transition sm:text-sm ${tab === "fi" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          Forced Induction
        </button>
      </div>

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {["All", ...ENGINE_FAMILIES].map((f) => (
          <button
            key={f}
            onClick={() => setFamilyFilter(f)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition ${familyFilter === f ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:border-primary"}`}
          >
            {f === "All" ? "All" : `${f} Series`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" />
        </div>
      ) : !hasData ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <Timer className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">No verified times yet. <Link to="/garage" className="text-primary">Submit yours →</Link></p>
        </div>
      ) : (
        <div className="space-y-3">
          {ENGINE_FAMILIES.filter((f) => topByFamily[f]).map((family) => (
            <div key={family} className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border bg-secondary/50 px-4 py-2">
                <span className="rounded bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">{family} Series</span>
              </div>
              <div className="divide-y divide-border">
                {topByFamily[family].map((car, idx) => (
                  <div key={car.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${
                      idx === 0 ? "bg-amber-400/20 text-amber-400" :
                      idx === 1 ? "bg-slate-400/20 text-slate-300" :
                      "bg-orange-700/20 text-orange-500"
                    }`}>
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">
                        {car.owner_name} <span className="font-normal text-muted-foreground">· {car.model}</span>
                      </div>
                      {car.track_name && (
                        <div className="truncate text-xs text-muted-foreground">{car.track_name}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-sm font-black text-primary">{car.track_time}</span>
                      {car.time_slip_url && <BadgeCheck className="h-3 w-3 text-primary" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}