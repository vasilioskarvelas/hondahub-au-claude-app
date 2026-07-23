import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, MessageSquare, Tag, Calendar, MapPin, CheckCircle2, Clock, RefreshCw, Trash2, Archive } from "lucide-react";

const STATUS_META = {
  active: { l: "Active", c: "text-emerald-400" },
  reserved: { l: "Reserved", c: "text-amber-400" },
  completed: { l: "Completed", c: "text-primary" },
  expired: { l: "Expired", c: "text-muted-foreground" },
  draft: { l: "Draft", c: "text-muted-foreground" },
  removed_by_poster: { l: "Removed", c: "text-muted-foreground" },
  removed_by_moderation: { l: "Removed by moderation", c: "text-destructive" },
};

export default function MarketplaceListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [me, setMe] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const m = await base44.auth.me();
        setMe(m);
      } catch {}
      const res = await base44.functions.invoke("marketplace", { action: "getListing", listing_id: id });
      setData(res.data);
    })();
  }, [id]);

  const isOwner = me && data?.listing?.poster_id === me.id;
  const listing = data?.listing;

  const call = async (action, payload, label) => {
    setBusy(label); setError("");
    try {
      const res = await base44.functions.invoke("marketplace", { action, ...payload });
      if (res.data?.ok) {
        const fresh = await base44.functions.invoke("marketplace", { action: "getListing", listing_id: id });
        setData(fresh.data);
      } else setError(res.data?.error || "Failed");
    } catch (e) { setError(e.message); } finally { setBusy(""); }
  };

  const startConversation = async () => {
    setBusy("msg");
    try {
      const res = await base44.functions.invoke("marketplace", { action: "startConversation", listing_id: id });
      if (res.data?.ok) navigate(`/conversation/${res.data.conversation_id}`);
      else setError(res.data?.error || "Failed");
    } catch (e) { setError(e.message); } finally { setBusy(""); }
  };

  if (!data) return <div className="py-16 text-center text-sm text-muted-foreground">Loading listing...</div>;
  if (!listing) return <div className="py-16 text-center text-sm text-muted-foreground">Listing not found.</div>;

  const sm = STATUS_META[listing.status] || STATUS_META.active;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/marketplace" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Marketplace</Link>

      {/* Photos */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="aspect-video bg-secondary">
          {listing.photo_urls?.[0] ? <img src={listing.photo_urls[0]} alt={listing.title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Tag className="h-10 w-10 text-muted-foreground" /></div>}
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${listing.listing_type === "wanted" ? "bg-blue-500/15 text-blue-400" : "bg-primary/15 text-primary"}`}>{listing.listing_type === "wanted" ? "Wanted" : "For sale"}</span>
          <span className={`text-xs font-bold ${sm.c}`}>{sm.l}</span>
          <span className="text-xs text-muted-foreground">{listing.category}</span>
        </div>
        <h1 className="text-2xl font-black tracking-tighter">{listing.title}</h1>
        {listing.price != null && <div className="text-2xl font-black">${Number(listing.price).toLocaleString()}</div>}
        {listing.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{listing.description}</p>}

        <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
          {listing.condition && <div><span className="text-muted-foreground">Condition</span><br /><span className="font-bold capitalize">{listing.condition.replace("_", " ")}</span></div>}
          {listing.location_state && <div><span className="text-muted-foreground">State</span><br /><span className="font-bold">{listing.location_state}</span></div>}
          {listing.location_general && <div className="col-span-2"><span className="text-muted-foreground">Location</span><br /><span className="font-bold">{listing.location_general}</span></div>}
          {listing.compatible_make && <div><span className="text-muted-foreground">Fits</span><br /><span className="font-bold">{listing.compatible_make} {listing.compatible_model || ""} {listing.compatible_chassis_code || ""} {listing.compatible_year_from ? `(${listing.compatible_year_from}${listing.compatible_year_to ? `–${listing.compatible_year_to}` : "+"})` : ""}</span></div>}
          <div className="flex gap-3">
            {listing.postage_available && <span className="font-bold">Postage</span>}
            {listing.pickup && <span className="font-bold">Pickup</span>}
            {listing.swap_accepted && <span className="font-bold">Swap</span>}
          </div>
        </div>
        <div className="border-t border-border pt-3 text-xs text-muted-foreground">
          Posted by <span className="font-bold text-foreground">{listing.poster_name}</span>
          {listing.expires_at && <div className="mt-1 flex items-center gap-1"><Clock className="h-3 w-3" /> Expires {new Date(listing.expires_at).toLocaleDateString()}</div>}
        </div>
      </div>

      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {!isOwner && ["active", "reserved"].includes(listing.status) && (
          <button disabled={!!busy} onClick={startConversation} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground glow-red disabled:opacity-50">
            <MessageSquare className="h-4 w-4" /> {busy === "msg" ? "Starting..." : `Message ${listing.listing_type === "wanted" ? "buyer" : "seller"}`}
          </button>
        )}
        {isOwner && (
          <>
            {listing.status === "draft" && <button disabled={busy === "pub"} onClick={() => call("publishListing", { listing_id: id }, "pub")} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">{busy === "pub" ? "Publishing..." : "Publish"}</button>}
            {["active", "reserved"].includes(listing.status) && <button disabled={busy === "res"} onClick={() => call("reserveListing", { listing_id: id }, "res")} className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold disabled:opacity-50">{busy === "res" ? "..." : "Reserve"}</button>}
            {["active", "reserved"].includes(listing.status) && <button disabled={busy === "done"} onClick={() => call("markCompleted", { listing_id: id }, "done")} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> {busy === "done" ? "..." : "Mark complete"}</button>}
            {["active", "reserved"].includes(listing.status) && <button disabled={busy === "ren"} onClick={() => call("renewListing", { listing_id: id }, "ren")} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-bold disabled:opacity-50"><RefreshCw className="h-4 w-4" /> {busy === "ren" ? "..." : "Renew"}</button>}
            {!["completed", "removed_by_poster", "removed_by_moderation"].includes(listing.status) && <button disabled={busy === "rm"} onClick={() => call("removeListing", { listing_id: id }, "rm")} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-destructive disabled:opacity-50"><Trash2 className="h-4 w-4" /> {busy === "rm" ? "..." : "Remove"}</button>}
            {listing.status === "draft" && <Link to={`/marketplace/${id}/edit`} className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold">Edit</Link>}
          </>
        )}
      </div>
    </div>
  );
}