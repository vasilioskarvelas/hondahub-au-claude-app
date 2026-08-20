import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Inbox } from "lucide-react";

export default function Conversations() {
  const [conversations, setConversations] = useState([]);
  const [avatars, setAvatars] = useState({}); // user_id -> avatar_url
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await base44.functions.invoke("marketplace", { action: "listConversations" });
      const convs = res.data?.conversations || [];
      setConversations(convs);
      // Resolve the other party's avatar for each conversation.
      const mediaIds = Array.from(new Set(
        convs.map((c) => c.other_party?.avatar_media_id).filter(Boolean)
      ));
      const entries = await Promise.all(
        mediaIds.map(async (mid) => {
          try {
            const r = await base44.functions.invoke("media", { action: "get", media_id: mid });
            return [mid, r.data?.media?.file_url || null];
          } catch { return [mid, null]; }
        })
      );
      const urlByMedia = new Map(entries);
      const avMap = {};
      for (const c of convs) {
        const mid = c.other_party?.avatar_media_id;
        avMap[c.other_party?.user_id] = mid ? urlByMedia.get(mid) || null : null;
      }
      setAvatars(avMap);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tighter">Messages</h1>
          <p className="text-sm text-muted-foreground">Your marketplace conversations.</p>
        </div>
        <Link to="/marketplace" className="text-sm font-bold text-primary">Browse listings</Link>
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
            const myRoleLabel = c.my_role || (c.listing_type === "wanted" ? "buyer" : "seller");
            return (
              <Link key={c.id} to={`/conversation/${c.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition hover:border-primary">
                {avatars[c.other_party.user_id] ? (
                  <img src={avatars[c.other_party.user_id]} alt={c.other_party.display_name} className="h-11 w-11 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-black text-muted-foreground">
                    {(c.other_party.display_name || "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold">{c.other_party.display_name}</span>
                    {c.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase text-foreground/70">{c.listing_type === "wanted" ? "Wanted" : "For sale"}</span>
                    <span className="truncate">re: {c.listing_title}</span>
                  </div>
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