import React from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft, MapPin, Clock, CalendarDays, Navigation, Users, CheckCircle2, X, Car } from "lucide-react";

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [vehicles, setVehicles] = React.useState([]);
  const [vehicleId, setVehicleId] = React.useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("event", { action: "getEvent", event_id: id });
      if (res.data?.ok) { setData(res.data); setVehicleId(res.data.my_attendance?.attending_vehicle_id || ""); }
      else setError(res.data?.error || "Failed to load");
    } finally { setLoading(false); }
  };
  React.useEffect(() => { load(); }, [id]);

  React.useEffect(() => {
    if (!user) return;
    base44.functions.invoke("vehicle", { action: "list" })
      .then((res) => setVehicles(res.data?.vehicles || []))
      .catch(() => {});
  }, [user]);

  const attend = async (status) => {
    setBusy(true); setError("");
    try {
      const res = await base44.functions.invoke("event", { action: "attendEvent", event_id: id, status, attending_vehicle_id: vehicleId || null });
      if (res.data?.ok) await load();
      else setError(res.data?.error || "Failed");
    } finally { setBusy(false); }
  };
  const withdraw = async () => {
    setBusy(true); setError("");
    try {
      const res = await base44.functions.invoke("event", { action: "withdrawAttendance", event_id: id });
      if (res.data?.ok) await load();
      else setError(res.data?.error || "Failed");
    } finally { setBusy(false); }
  };
  const cancel = async () => {
    if (!confirm("Cancel this event?")) return;
    setBusy(true); setError("");
    try {
      const res = await base44.functions.invoke("event", { action: "cancelEvent", event_id: id });
      if (res.data?.ok) await load();
      else setError(res.data?.error || "Failed");
    } finally { setBusy(false); }
  };

  if (loading) return <div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" /></div>;
  if (!data) return <div className="flex flex-col items-center justify-center py-20 text-center"><p className="text-lg font-bold">Event not found</p><button onClick={() => navigate("/events")} className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Back to Events</button></div>;

  const { event, organiser, my_attendance, attendees, group, is_organiser } = data;
  const start = new Date(event.starts_at);
  const end = event.ends_at ? new Date(event.ends_at) : null;
  const dateStr = start.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeStr = start.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }) + (end ? ` – ${end.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}` : "");
  const locStr = [event.location_name, event.location_general].filter(Boolean).join(", ") || "Location TBA";
  const mapsUrl = event.location_name ? `https://www.google.com/maps?q=${encodeURIComponent(event.location_name + " " + (event.location_general || ""))}` : "";
  const amAttending = my_attendance && my_attendance.status !== "cancelled";

  return (
    <div className="space-y-5 pb-6">
      <button onClick={() => navigate("/events")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Events</button>

      {event.cover_url ? (
        <div className="relative overflow-hidden rounded-2xl border border-border">
          <img src={event.cover_url} alt={event.title} className="aspect-video w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
          <div className="absolute bottom-0 left-0 p-5"><h1 className="text-2xl font-black text-white">{event.title}</h1></div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-card p-5"><h1 className="text-2xl font-black">{event.title}</h1></div>
      )}

      {event.status === "cancelled" && <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-bold text-destructive">This event has been cancelled.</div>}
      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-bold"><CalendarDays className="h-4 w-4 text-primary" /> When</div>
          <p className="mt-1 text-sm text-muted-foreground">{dateStr}</p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-sm text-muted-foreground"><Clock className="h-3 w-3" /> {timeStr}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-bold"><MapPin className="h-4 w-4 text-primary" /> Where</div>
          <p className="mt-1 text-sm text-muted-foreground">{locStr}</p>
          {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary"><Navigation className="h-3 w-3" /> Get Directions</a>}
        </div>
      </div>

      {event.description && <div className="rounded-2xl border border-border bg-card p-5"><h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">About</h2><p className="whitespace-pre-line text-sm leading-relaxed">{event.description}</p></div>}

      <div className="flex flex-wrap gap-3">
        <Link to={organiser.type === "user" ? `/user/${encodeURIComponent(organiser.handle || organiser.name)}/garage` : "#"} className="flex flex-1 items-center gap-3 rounded-2xl border border-border bg-card p-4 active:scale-[0.98]">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">{(organiser.name || "?").charAt(0).toUpperCase()}</div>
          <div className="flex-1"><p className="text-xs text-muted-foreground">Organised by</p><p className="text-sm font-bold">{organiser.name}</p></div>
        </Link>
        {group && <Link to={`/group/${group.id}`} className="flex flex-1 items-center gap-3 rounded-2xl border border-border bg-card p-4 active:scale-[0.98]"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15"><Users className="h-5 w-5 text-primary" /></div><div className="flex-1"><p className="text-xs text-muted-foreground">Part of</p><p className="text-sm font-bold">{group.name}</p></div></Link>}
      </div>

      {event.status === "published" && (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          {amAttending ? (
            <>
              <div className="flex items-center gap-2 text-sm font-bold text-primary"><CheckCircle2 className="h-4 w-4" /> You're {my_attendance.status === "going" ? "going" : "interested"}</div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Which car are you bringing?</label>
                <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} disabled={busy} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary">
                  <option value="">None</option>
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{v.nickname || `${v.year} ${v.make} ${v.model}`}</option>)}
                </select>
                <button disabled={busy} onClick={() => attend(my_attendance.status)} className="mt-2 w-full rounded-xl border border-border bg-background py-2.5 text-sm font-bold hover:text-foreground disabled:opacity-50">Update</button>
              </div>
              <button disabled={busy} onClick={withdraw} className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground disabled:opacity-50"><X className="h-4 w-4" /> Withdraw</button>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Which car are you bringing? (optional)</label>
                <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} disabled={busy} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary">
                  <option value="">None</option>
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{v.nickname || `${v.year} ${v.make} ${v.model}`}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button disabled={busy} onClick={() => attend("going")} className="flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-bold border-primary bg-primary/10 text-primary disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> Going</button>
                <button disabled={busy} onClick={() => attend("interested")} className="flex items-center justify-center gap-2 rounded-xl border border-border bg-background py-3 text-sm font-bold text-muted-foreground hover:text-foreground disabled:opacity-50"><Users className="h-4 w-4" /> Interested</button>
              </div>
            </>
          )}
          {is_organiser && <Link to={`/event/${event.id}/edit`} className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 py-2.5 text-sm font-bold text-primary hover:bg-primary/20">Edit Event</Link>}
          {is_organiser && <button disabled={busy} onClick={cancel} className="w-full rounded-xl border border-destructive/40 py-2.5 text-sm font-bold text-destructive hover:bg-destructive/10 disabled:opacity-50">Cancel Event</button>}
        </div>
      )}

      {attendees?.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Going ({attendees.length})</h2>
          <div className="space-y-2">
            {attendees.map((a) => (
              <div key={a.user_id} className="flex items-center justify-between rounded-xl border border-border bg-background/40 px-3 py-2">
                <Link to={`/user/${encodeURIComponent(a.handle || a.display_name)}`} className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{(a.display_name || "?").charAt(0).toUpperCase()}</div>
                  <span className="text-sm font-medium">{a.display_name}</span>
                </Link>
                {a.vehicle && <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs text-muted-foreground"><Car className="h-3 w-3" /> {a.vehicle.nickname || `${a.vehicle.year} ${a.vehicle.make} ${a.vehicle.model}`}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}