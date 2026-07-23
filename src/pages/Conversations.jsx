import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { MessageSquare, Inbox } from "lucide-react";

export default function Conversations() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.invoke("marketplace", { action: "listConversations" });
        setConversations(res.data?.conversations || []);
      } finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-black tracking-tighter">Messages</h1>
        <p className="text-sm text-muted-foreground">Your marketplace conversations.</p>
      </div>
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
      ) : conversations.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-16 text-center">
          <Inbox className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm font-bold">No conversations yet</p>
          <p className="text-xs text-muted-foreground">Start a conversation from a listing.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map((c) => {
            // Role labels derived from listing_type at display time — never hardcoded.
            const iAmPoster = c.poster_id; // (role context comes from the listing_type)
            const myRoleLabel = c.listing_type === "wanted" ? "buyer" : "seller";
            const theirRoleLabel = c.listing_type === "wanted" ? "seller" : "buyer";
            return (
              <Link key={c.id} to={`/conversation/${c.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition hover:border-primary">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary"><MessageSquare className="h-5 w-5 text-muted-foreground" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold">{c.other_party.display_name}</span>
                    {c.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase text-foreground/70">{c.listing_type === "wanted" ? "Wanted" : "For sale"}</span>
                    <span className="truncate">re: {c.listing_title}</span>
                  </div>
                  {c.last_message_preview && <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.last_message_preview}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">{myRoleLabel}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}