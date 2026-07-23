import React from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Plus, CalendarDays, Search, MapPin } from "lucide-react";
import EventCard from "@/components/EventCard";

export default function Events() {
  const navigate = useNavigate();
  const [events, setEvents] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [location, setLocation] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("event", { action: "listDirectory", search, location });
      setEvents(res.data?.events || []);
    } finally { setLoading(false); }
  }, [search, location]);

  React.useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Community Events</h1>
          <p className="text-sm text-muted-foreground">Honda meets, cruises, track & drag days across Australia</p>
        </div>
        <button onClick={() => navigate("/event/create")} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground glow-red"><Plus className="h-4 w-4" /> Create</button>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search events..." className="w-full rounded-xl border border-border bg-card pl-9 pr-4 py-2.5 text-sm outline-none focus:border-primary" />
        </div>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" className="w-40 rounded-xl border border-border bg-card pl-9 pr-3 py-2.5 text-sm outline-none focus:border-primary" />
        </div>
      </div>
      {loading ? (
        <div className="flex h-48 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" /></div>
      ) : events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <CalendarDays className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="mt-3 font-bold">No upcoming events</h3>
          <p className="mt-1 text-sm text-muted-foreground">Check back soon or create one.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{events.map((e) => <EventCard key={e.id} event={e} />)}</div>
      )}
    </div>
  );
}