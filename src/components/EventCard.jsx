import React from "react";
import { Link } from "react-router-dom";
import { CalendarDays, MapPin, Clock } from "lucide-react";

const TYPE_LABELS = {
  meet: "Meet", cruise: "Cruise", track_day: "Track Day", drag_day: "Drag Day", cars_coffee: "Cars & Coffee", workshop_event: "Workshop Event",
};

export default function EventCard({ event }) {
  const dateStr = event.date ? new Date(event.date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "";
  return (
    <Link to={`/event/${event.id}`} className="block overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary/40 active:scale-[0.98]">
      {event.image_url && (
        <div className="relative aspect-video">
          <img src={event.image_url} alt={event.title} className="h-full w-full object-cover" />
          <span className="absolute left-2 top-2 rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold text-white">
            {TYPE_LABELS[event.type] || "Event"}
          </span>
        </div>
      )}
      <div className="p-4">
        <h3 className="font-bold">{event.title}</h3>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {dateStr}</span>
          {event.time && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {event.time}</span>}
          <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {event.location}, {event.state}</span>
        </div>
        {event.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{event.description}</p>}
      </div>
    </Link>
  );
}