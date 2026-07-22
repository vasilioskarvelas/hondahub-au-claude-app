import React from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, MapPin, Clock, CalendarDays, Navigation, Share2, CheckCircle2, QrCode, Users, UserPlus } from "lucide-react";
import ShareModal from "@/components/ShareModal";
import InviteFriendsModal from "@/components/InviteFriendsModal";

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = React.useState(null);
  const [related, setRelated] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [rsvp, setRsvp] = React.useState(null);
  const [showShare, setShowShare] = React.useState(false);
  const [showInvite, setShowInvite] = React.useState(false);
  const [checkedIn, setCheckedIn] = React.useState(false);

  const handleRSVP = (status) => {
    const newStatus = rsvp === status ? null : status;
    setRsvp(newStatus);
    if (newStatus) localStorage.setItem(`hondahub_rsvp_${id}`, newStatus);
    else localStorage.removeItem(`hondahub_rsvp_${id}`);
  };

  React.useEffect(() => {
    base44.entities.Event.get(id)
      .then((e) => {
        setEvent(e);
        setLoading(false);
        base44.entities.Event.filter({ state: e.state }, "-date", 5).then((r) =>
          setRelated(r.filter((x) => x.id !== id).slice(0, 4))
        );
      })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading)
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" />
      </div>
    );

  if (!event)
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-bold">Event not found</p>
        <button onClick={() => navigate("/events")} className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
          Back to Events
        </button>
      </div>
    );

  const dateStr = event.date
    ? new Date(event.date).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "Date TBA";
  const mapsUrl = event.location
    ? `https://www.google.com/maps?q=${encodeURIComponent(event.location + " " + (event.state || ""))}`
    : "";

  const handleShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: event.title, text: event.description, url: window.location.href }); } catch {}
    } else {
      navigator.clipboard?.writeText(window.location.href);
    }
  };

  return (
    <div className="space-y-5 pb-6">
      <button onClick={() => navigate("/events")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Events
      </button>

      {/* Banner */}
      {event.image_url ? (
        <div className="relative overflow-hidden rounded-2xl border border-border">
          <img src={event.image_url} alt={event.title} className="aspect-video w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
          <div className="absolute bottom-0 left-0 p-5">
            <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-white">
              {event.type?.replace(/_/g, " ") || "Event"}
            </span>
            <h1 className="mt-2 text-2xl font-black text-white">{event.title}</h1>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-card p-6">
          <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-white">
            {event.type?.replace(/_/g, " ") || "Event"}
          </span>
          <h1 className="mt-2 text-2xl font-black">{event.title}</h1>
        </div>
      )}

      {/* Date & Location */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-bold">
            <CalendarDays className="h-4 w-4 text-primary" /> When
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{dateStr}</p>
          {event.time && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="h-3 w-3" /> {event.time}
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-bold">
            <MapPin className="h-4 w-4 text-primary" /> Where
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {event.location || "Location TBA"}
            {event.state ? `, ${event.state}` : ""}
          </p>
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary">
              <Navigation className="h-3 w-3" /> Get Directions
            </a>
          )}
        </div>
      </div>

      {/* Description */}
      {event.description && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">About</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed">{event.description}</p>
        </div>
      )}

      {/* Organiser */}
      {event.organizer_name && (
        <Link
          to={`/user/${encodeURIComponent(event.organizer_name)}`}
          className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 active:scale-[0.98]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
            {event.organizer_name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Organised by</p>
            <p className="text-sm font-bold">{event.organizer_name}</p>
          </div>
        </Link>
      )}

      {/* RSVP */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => handleRSVP("attending")}
          className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-bold transition ${rsvp === "attending" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`}
        >
          <CheckCircle2 className="h-4 w-4" /> {rsvp === "attending" ? "Attending ✓" : "Attending"}
        </button>
        <button
          onClick={() => handleRSVP("interested")}
          className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-bold transition ${rsvp === "interested" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`}
        >
          <Users className="h-4 w-4" /> {rsvp === "interested" ? "Interested ✓" : "Interested"}
        </button>
      </div>

      {/* Check In */}
      <button
        onClick={() => setCheckedIn(true)}
        className={`flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-sm font-bold transition ${checkedIn ? "border-green-500 bg-green-500/10 text-green-400" : "border-border bg-card text-muted-foreground"}`}
      >
        <QrCode className="h-4 w-4" /> {checkedIn ? "Checked In ✓" : "Check In with QR"}
      </button>

      {/* Share */}
      <button
        onClick={() => setShowShare(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-bold active:scale-[0.98]"
      >
        <Share2 className="h-4 w-4" /> Share Event
      </button>

      <button
        onClick={() => setShowInvite(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-bold active:scale-[0.98]"
      >
        <UserPlus className="h-4 w-4" /> Invite Friends
      </button>

      {showShare && <ShareModal title={event.title} url={window.location.href} onClose={() => setShowShare(false)} />}
      {showInvite && <InviteFriendsModal event={event} onClose={() => setShowInvite(false)} />}

      {/* Related Events */}
      {related.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">More in {event.state}</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {related.map((e) => (
              <Link key={e.id} to={`/event/${e.id}`} className="w-64 shrink-0 overflow-hidden rounded-2xl border border-border bg-card">
                {e.image_url && <img src={e.image_url} alt={e.title} className="aspect-video w-full object-cover" />}
                <div className="p-3">
                  <h3 className="text-sm font-bold">{e.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {e.date ? new Date(e.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : ""} · {e.location}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}