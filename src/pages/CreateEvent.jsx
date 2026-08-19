import React from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft } from "lucide-react";
import EventCoverUploader from "@/components/events/EventCoverUploader";

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function CreateEvent() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { id } = useParams();
  const editing = !!id;
  const presetGroup = params.get("group");
  const { user } = useAuth();
  const [form, setForm] = React.useState({ title: "", description: "", location_name: "", location_general: "", starts_at: "", ends_at: "", group_id: presetGroup || "", cover_media_id: null });
  const [coverUrl, setCoverUrl] = React.useState(null);
  const [groups, setGroups] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [loaded, setLoaded] = React.useState(!editing);

  React.useEffect(() => {
    base44.functions.invoke("group", { action: "listManagedGroups" }).then((res) => setGroups(res.data?.groups || [])).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (!editing) return;
    (async () => {
      try {
        const res = await base44.functions.invoke("event", { action: "getEvent", event_id: id });
        const e = res.data?.event;
        if (e) {
          setForm({
            title: e.title || "", description: e.description || "",
            location_name: e.location_name || "", location_general: e.location_general || "",
            starts_at: toLocalInput(e.starts_at), ends_at: toLocalInput(e.ends_at),
            group_id: e.group_id || "", cover_media_id: e.cover_media_id || null,
          });
          setCoverUrl(e.cover_url || null);
        }
      } catch (e) { setError(e.message); } finally { setLoaded(true); }
    })();
  }, [id, editing]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title.trim() || !form.starts_at || busy) return;
    setBusy(true); setError("");
    try {
      const payload = {
        title: form.title.trim(), description: form.description.trim() || null,
        location_name: form.location_name.trim() || null, location_general: form.location_general.trim() || null,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        cover_media_id: form.cover_media_id || null,
      };
      if (editing) {
        payload.event_id = id;
        const res = await base44.functions.invoke("event", { action: "updateEvent", ...payload });
        if (res.data?.ok) navigate(`/event/${id}`);
        else setError(res.data?.error || res.data?.details?.reason || "Failed to update event");
      } else {
        payload.organiser_type = "user"; payload.organiser_id = user?.id;
        payload.group_id = form.group_id || null;
        const res = await base44.functions.invoke("event", { action: "createEvent", ...payload });
        if (res.data?.ok) navigate(`/event/${res.data.event.id}`);
        else setError(res.data?.error || res.data?.details?.reason || "Failed to create event");
      }
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  if (!loaded) return <div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" /></div>;

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <button onClick={() => navigate(editing ? `/event/${id}` : "/events")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> {editing ? "Event" : "Events"}</button>
      <div>
        <h1 className="text-2xl font-black tracking-tighter">{editing ? "Edit Event" : "Create an Event"}</h1>
        <p className="text-sm text-muted-foreground">{editing ? "Update your event details." : "Organise a meet, cruise, or track day."}</p>
      </div>
      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Title</label>
          <input value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={200} placeholder="Sunday Cars & Coffee" className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Description</label>
          <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={4} placeholder="Details about the event..." className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Location</label>
            <input value={form.location_name} onChange={(e) => set("location_name", e.target.value)} placeholder="Sandown car park" className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">City / Region</label>
            <input value={form.location_general} onChange={(e) => set("location_general", e.target.value)} placeholder="Melbourne, VIC" className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Starts</label>
            <input type="datetime-local" value={form.starts_at} onChange={(e) => set("starts_at", e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Ends (optional)</label>
            <input type="datetime-local" value={form.ends_at} onChange={(e) => set("ends_at", e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
          </div>
        </div>
        <EventCoverUploader
          mediaId={form.cover_media_id}
          fileUrl={coverUrl}
          onChange={(id, url) => { set("cover_media_id", id); setCoverUrl(url); }}
        />
        {groups.length > 0 && !editing && (
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Connect to a Group (optional)</label>
            <select value={form.group_id} onChange={(e) => set("group_id", e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary">
              <option value="">Standalone event</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Business-organised events become available once Business profiles launch.</p>
      </div>
      <button disabled={busy || !form.title.trim() || !form.starts_at} onClick={submit} className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground glow-red disabled:opacity-50">
        {busy ? (editing ? "Saving..." : "Creating...") : (editing ? "Save Changes" : "Create Event")}
      </button>
    </div>
  );
}