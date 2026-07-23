import React from "react";
import { Link } from "react-router-dom";
import { CalendarDays, MapPin, Clock, Users } from "lucide-react";

export default function EventCard({ event }) {
  const start = event.starts_at ? new Date(event.starts_at) : null;
  const dateStr = start ? start.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "";
  const timeStr = start ? start.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }) : "";
  const cover = event.cover_url;
  return (
    <Link to={`/event/${event.id}`} className="block overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary/40 active:scale-[0.98]">
      {cover ? (
        <div className="relative aspect-video">
          <img src={cover} alt={event.title} className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-primary/10 to-card">
          <CalendarDays className="h-8 w-8 text-primary/40" />
        </div>
      )}
      <div className="p-4">
        <h3 className="font-bold leading-tight">{event.title}</h3>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {dateStr}</span>
          {timeStr && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {timeStr}</span>}
          {event.location_general && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {event.location_general}</span>}
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">by {event.organiser_name || "Organiser"}</span>
          <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {event.attendee_count || 0}</span>
        </div>
      </div>
    </Link>
  );
}