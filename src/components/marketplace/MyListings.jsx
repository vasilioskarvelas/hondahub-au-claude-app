import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Pencil, RefreshCw, Trash2, Tag, Plus, Loader2 } from "lucide-react";

const STATUS_META = {
  draft: { l: "Draft", c: "text-muted-foreground" },
  pending_review: { l: "Pending review", c: "text-amber-400" },
  active: { l: "Active", c: "text-emerald-400" },
  reserved: { l: "Reserved", c: "text-amber-400" },
  completed: { l: "Completed", c: "text-primary" },
  expired: { l: "Expired", c: "text-muted-foreground" },
  removed_by_poster: { l: "Removed", c: "text-muted-foreground" },
  removed_by_moderation: { l: "Removed by moderation", c: "text-destructive" },
};

function priceDisplay(l) {
  if (l.price_type === "auction") {
    const cur = l.current_bid_cents || l.auction_min_bid_cents || 0;
    return l.current_bid_cents ? `$${(cur / 100).toLocaleString()} bid` : `$${(cur / 100).toLocaleString()} start`;
  }
  if (l.price_type === "free") return "Free";
  if (l.price_type === "poa" || l.price_cents == null) return "Price on ask";
  return `$${(l.price_cents / 100).toLocaleString()}${l.price_type === "negotiable" ? " neg" : ""}`;
}

export default function MyListings() {
  const [listings, setListings] = React.useState(null);
  const [busy, setBusy] = React.useState("");

  const load = async () => {
    try {
      const res = await base44.functions.invoke("marketplace", { action: "listMyListings" });
      if (res.data?.ok) setListings(res.data.listings || []);
    } catch { setListings([]); }
  };
  React.useEffect(() => { load(); }, []);

  const act = async (action, listing_id, label) => {
    setBusy(label);
    try {
      await base44.functions.invoke("marketplace", { action, listing_id });
      await load();
    } catch { } finally { setBusy(""); }
  };

  if (listings === null) {
    return (
      <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">My Listings</h2>
        <Link to="/marketplace/create" className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
          <Plus className="h-3.5 w-3.5" /> New
        </Link>
      </div>

      {listings.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">You haven't created any listings yet.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {listings.map((l) => {
            const sm = STATUS_META[l.status] || STATUS_META.active;
            const editable = ["draft", "pending_review", "active", "reserved", "expired"].includes(l.status);
            return (
              <div key={l.id} className="flex items-center gap-3 rounded-xl border border-border bg-background p-2.5">
                <Link to={`/marketplace/${l.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  {l.photo_urls?.[0] ? (
                    <img src={l.photo_urls[0]} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-secondary"><Tag className="h-5 w-5 text-muted-foreground" /></div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{l.title}</p>
                    <p className="text-xs text-muted-foreground">{priceDisplay(l)} · <span className={sm.c}>{sm.l}</span></p>
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-1">
                  {editable && (
                    <Link to={`/marketplace/${l.id}/edit`} className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground" title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>
                  )}
                  {l.status === "expired" && (
                    <button disabled={busy === `ren-${l.id}`} onClick={() => act("renewListing", l.id, `ren-${l.id}`)} className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground" title="Renew">
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {["active", "reserved", "expired"].includes(l.status) && (
                    <button disabled={busy === `rm-${l.id}`} onClick={() => act("removeListing", l.id, `rm-${l.id}`)} className="rounded-lg border border-border p-2 text-destructive hover:border-destructive" title="Remove">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}