import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft } from "lucide-react";
import EventCoverUploader from "@/components/events/EventCoverUploader";

export default function CreateEvent() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const presetGroup = params.get("group");
  const { user } = useAuth();
  const [form, setForm] = React.useState({ title: "", description: "", location_name: "", location_general: "", starts_at: "", ends_at: "", group_id: presetGroup || "", cover_media_id: null });
  const [groups, setGroups] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    base44.functions.invoke("group", { action: "listManagedGroups" }).then((res) => setGroups(res.data?.groups || [])).catch(() => {});
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title.trim() || !form.starts_at || busy) return;
    setBusy(true); setError("");
    try {
      const payload = {
        organiser_type: "user", organiser_id: user?.id,
        title: form.title.trim(), description: form.description.trim() || null,
        location_name: form.location_name.trim() || null, location_general: form.location_general.trim() || null,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        group_id: form.group_id || null,
        cover_media_id: form.cover_media_id || null,
      };
      const res = await base44.functions.invoke("event", { action: "createEvent", ...payload });
      if (res.data?.ok) navigate(`/event/${res.data.event.id}`);
      else setError(res.data?.error || res.data?.details?.reason || "Failed to create event");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <button onClick={() => navigate("/events")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Events</button>
      <div>
        <h1 className="text-2xl font-black tracking-tighter">Create an Event</h1>
        <p className="text-sm text-muted-foreground">Organise a meet, cruise, or track day.</p>
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
          onChange={(id) => set("cover_media_id", id)}
        />
        {groups.length > 0 && (
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
        {busy ? "Creating..." : "Create Event"}
      </button>
    </div>
  );
}