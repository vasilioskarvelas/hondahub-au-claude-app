import React from "react";
import { base44 } from "@/api/base44Client";
import EventCard from "@/components/EventCard";
import { CalendarDays } from "lucide-react";

export default function Events() {
  const [events, setEvents] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [touchStart, setTouchStart] = React.useState(0);

  const load = React.useCallback(() => {
    base44.entities.Event.list("-date", 50).then((e) => { setEvents(e); setLoading(false); });
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const handleTouchStart = (e) => setTouchStart(e.touches[0].clientY);
  const handleTouchEnd = async (e) => {
    const diff = e.changedTouches[0].clientY - touchStart;
    if (diff > 80 && window.scrollY === 0 && !refreshing) {
      setRefreshing(true);
      await load();
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-5" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {refreshing && (
        <div className="flex items-center justify-center py-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-secondary border-t-primary" />
        </div>
      )}
      <div>
        <h1 className="text-2xl font-black">Community Events</h1>
        <p className="text-sm text-muted-foreground">Honda meets, cruises, track & drag days across Australia</p>
      </div>
      {loading ? (
        <div className="flex h-48 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" /></div>
      ) : events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <CalendarDays className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="mt-3 font-bold">No events yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Check back soon for Honda meets and track days.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {events.map((e) => <EventCard key={e.id} event={e} />)}
        </div>
      )}
    </div>
  );
}