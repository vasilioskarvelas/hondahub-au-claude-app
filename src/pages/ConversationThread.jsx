import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Send, ShieldAlert, Ban, Archive, Trash2 } from "lucide-react";

export default function ConversationThread() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [riskWarning, setRiskWarning] = useState(null);
  const [me, setMe] = useState(null);
  const bottomRef = useRef(null);

  const load = async () => {
    const [convRes, msgRes] = await Promise.all([
      base44.functions.invoke("marketplace", { action: "getConversation", conversation_id: id }),
      base44.functions.invoke("marketplace", { action: "getMessages", conversation_id: id }),
    ]);
    setData(convRes.data);
    setMessages(msgRes.data?.messages || []);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    (async () => {
      try { setMe(await base44.auth.me()); } catch {}
      await load();
      await base44.functions.invoke("marketplace", { action: "markConversationRead", conversation_id: id }).catch(() => {});
    })();
  }, [id]);

  const send = async (acknowledge) => {
    if (!text.trim() || busy) return;
    setBusy(true); setError(""); setRiskWarning(null);
    try {
      const res = await base44.functions.invoke("marketplace", { action: "sendMessage", conversation_id: id, body: text.trim(), acknowledge_risk: acknowledge });
      if (res.data?.ok) {
        setText("");
        await load();
      } else if (res.data?.error === "MESSAGE_CONTACT_PATTERN_DETECTED") {
        // Pre-send risk warning — show patterns, let the sender confirm to proceed.
        setRiskWarning(res.data.details?.patterns || ["contact_info"]);
      } else {
        setError(res.data?.error || "Failed to send");
      }
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const block = async () => {
    if (!data?.other_party) return;
    if (!confirm(`Block ${data.other_party.display_name}? They won't be able to start new conversations or send new messages, but this conversation's history stays visible.`)) return;
    const res = await base44.functions.invoke("marketplace", { action: "blockUser", blocked_id: data.other_party.user_id });
    if (res.data?.ok) setError(`Blocked ${data.other_party.display_name}. History stays visible.`);
  };

  const archive = async () => {
    const res = await base44.functions.invoke("marketplace", { action: "archiveConversation", conversation_id: id });
    if (res.data?.ok) navigate("/conversations");
  };

  if (!data) return <div className="py-16 text-center text-sm text-muted-foreground">Loading conversation...</div>;
  if (!data.conversation) return <div className="py-16 text-center text-sm text-muted-foreground">Conversation not found.</div>;

  const listing = data.listing;
  const myRole = data.my_role; // derived from listing_type by the service — never a hardcoded field assumption
  const theirRole = myRole === "buyer" ? "seller" : "buyer";

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] max-w-2xl flex-col">
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <Link to="/conversations" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-bold">{data.other_party.display_name}</span>
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase text-foreground/70">you: {myRole}</span>
          </div>
          {listing && <p className="truncate text-xs text-muted-foreground">re: {listing.title} · {listing.listing_type === "wanted" ? "Wanted" : "For sale"}</p>}
        </div>
        <button onClick={block} title="Block user" className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"><Ban className="h-4 w-4" /></button>
        <button onClick={archive} title="Archive" className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary"><Archive className="h-4 w-4" /></button>
      </div>

      {/* Messages — history stays visible even after a block */}
      <div className="flex-1 space-y-2 overflow-y-auto py-3">
        {messages.map((m) => {
          const mine = me && m.sender_id === me.id;
          const removed = m.status !== "published";
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"} ${removed ? "italic opacity-50" : ""}`}>
                {removed ? <span className="text-xs">message removed</span> : <span className="whitespace-pre-wrap">{m.body}</span>}
                {!mine && <div className="mt-0.5 text-[10px] opacity-60">{m.sender_name}</div>}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && <div className="mb-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">{error}</div>}
      {/* Pre-send risk warning for contact-sharing patterns */}
      {riskWarning && (
        <div className="mb-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400"><ShieldAlert className="h-4 w-4" /> Sharing contact info</div>
          <p className="mt-1 text-xs text-muted-foreground">Your message may contain {riskWarning.join(", ").replace(/_/g, " ")}. Sharing off-platform contact details is at your own risk. Send anyway?</p>
          <div className="mt-2 flex gap-2">
            <button onClick={() => send(true)} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-black">Send anyway</button>
            <button onClick={() => { setRiskWarning(null); setText(""); }} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold">Cancel</button>
          </div>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); send(false); }} className="flex gap-2 border-t border-border pt-3">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message..." className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
        <button type="submit" disabled={busy || !text.trim()} className="rounded-xl bg-primary p-2.5 text-primary-foreground disabled:opacity-50"><Send className="h-4 w-4" /></button>
      </form>
    </div>
  );
}