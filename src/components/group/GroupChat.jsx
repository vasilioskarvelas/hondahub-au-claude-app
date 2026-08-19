import React from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Send, ImagePlus, Loader2, X } from "lucide-react";

export default function GroupChat({ groupId }) {
  const { user } = useAuth();
  const [messages, setMessages] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [text, setText] = React.useState("");
  const [mediaId, setMediaId] = React.useState(null);
  const [mediaUrl, setMediaUrl] = React.useState(null);
  const [mediaType, setMediaType] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState("");
  const fileRef = React.useRef(null);
  const scrollRef = React.useRef(null);

  const load = async () => {
    try {
      const res = await base44.functions.invoke("group", { action: "listMessages", group_id: groupId });
      setMessages(res.data?.messages || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { load(); }, [groupId]);
  React.useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  const attach = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const up = await base44.integrations.Core.UploadFile({ file });
      const created = await base44.functions.invoke("media", {
        action: "create",
        file_url: up.file_url,
        media_type: file.type?.startsWith("video/") ? "video" : "image",
        mime_type: file.type,
        source: "community",
      });
      const m = created.data?.media;
      if (m) { setMediaId(m.id); setMediaUrl(m.file_url); setMediaType(m.media_type); }
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const send = async () => {
    if (busy || (!text.trim() && !mediaId)) return;
    setBusy(true); setError("");
    try {
      const res = await base44.functions.invoke("group", { action: "sendMessage", group_id: groupId, body: text.trim(), media_id: mediaId || undefined });
      if (res.data?.ok) {
        setMessages((m) => [...m, res.data.message]);
        setText(""); setMediaId(null); setMediaUrl(null); setMediaType(null);
      } else {
        setError(res.data?.error || "Failed to send");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card" style={{ height: "58vh" }}>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {loading ? (
          <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">No messages yet — start the chat!</div>
        ) : messages.map((m) => {
          const mine = m.sender_id === user?.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`flex max-w-[82%] flex-col ${mine ? "items-end" : "items-start"}`}>
                {!mine && <span className="mb-1 px-1 text-xs font-bold text-muted-foreground">{m.sender_name}</span>}
                {m.media_url && (m.media_type === "video" ? (
                  <video src={m.media_url} controls className="max-h-64 rounded-xl border border-border" />
                ) : (
                  <img src={m.media_url} alt="" className="max-h-64 rounded-xl border border-border object-cover" />
                ))}
                {m.body && <p className={`mt-1 whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>{m.body}</p>}
                <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">{timeAgo(m.created_date)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {error && <div className="border-t border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">{error}</div>}

      {mediaUrl && (
        <div className="flex items-center gap-2 border-t border-border p-2">
          {mediaType === "video" ? <video src={mediaUrl} className="h-12 rounded" /> : <img src={mediaUrl} className="h-12 rounded" />}
          <span className="flex-1 text-xs text-muted-foreground">Attachment ready</span>
          <button onClick={() => { setMediaId(null); setMediaUrl(null); setMediaType(null); }} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-border p-3">
        <button onClick={() => fileRef.current?.click()} disabled={uploading} className="rounded-xl border border-border p-2 text-muted-foreground hover:text-primary disabled:opacity-50">
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
        </button>
        <input ref={fileRef} type="file" accept="image/*,video/*" onChange={attach} className="hidden" />
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} placeholder="Message the group…" className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
        <button onClick={send} disabled={busy || (!text.trim() && !mediaId)} className="rounded-xl bg-primary p-2.5 text-primary-foreground disabled:opacity-50"><Send className="h-5 w-5" /></button>
      </div>
    </div>
  );
}

function timeAgo(iso) {
  if (!iso) return "";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "now";
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}