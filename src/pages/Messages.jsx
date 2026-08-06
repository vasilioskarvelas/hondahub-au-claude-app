import React from "react";
import { base44 } from "@/api/base44Client";
import { Send, MessageCircle, ArrowLeft, Paperclip, X, FileText, Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";

export default function Messages() {
  const [searchParams] = useSearchParams();
  const [conversations, setConversations] = React.useState([]);
  const [active, setActive] = React.useState(null);
  const [messages, setMessages] = React.useState([]);
  const [text, setText] = React.useState("");
  const [senderName, setSenderName] = React.useState(() => localStorage.getItem("hondahub_name") || "");
  const [showThread, setShowThread] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [attachment, setAttachment] = React.useState(null);
  const [uploading, setUploading] = React.useState(false);
  const [enlargedImage, setEnlargedImage] = React.useState(null);
  const [showNew, setShowNew] = React.useState(false);
  const [recipient, setRecipient] = React.useState("");
  const [starting, setStarting] = React.useState(false);
  const [newError, setNewError] = React.useState(null);
  const fileInputRef = React.useRef(null);

  const startConversation = async () => {
    const name = recipient.trim();
    if (!name || starting) return;
    setStarting(true); setNewError(null);
    try {
      const conv = await base44.entities.Conversation.create({ participant_name: name, last_message: "" });
      setConversations((c) => [conv, ...c]);
      setActive(conv);
      setShowThread(true);
      setShowNew(false);
      setRecipient("");
    } catch (e) {
      setNewError(e.message || "Could not start conversation");
    } finally {
      setStarting(false);
    }
  };

  const loadConversations = () => {
    base44.entities.Conversation.list("-updated_date", 50).then((c) => {
      setConversations(c);
      setLoading(false);
      const convId = searchParams.get("conv");
      if (convId) {
        const found = c.find((conv) => conv.id === convId);
        if (found) {
          setActive(found);
          setShowThread(true);
        }
      }
    });
  };
  React.useEffect(loadConversations, [searchParams]);

  React.useEffect(() => {
    if (!active) return;
    base44.entities.Message.filter({ conversation_id: active.id }, "created_date", 100).then(setMessages);
  }, [active]);

  const handleFileSelect = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      let type = "file";
      if (file.type.startsWith("image/")) type = "image";
      else if (file.type.startsWith("video/")) type = "video";
      setAttachment({ url: file_url, type, name: file.name });
    } finally {
      setUploading(false);
    }
  };

  const send = async () => {
    if ((!text.trim() && !attachment) || !active || !senderName.trim()) return;
    localStorage.setItem("hondahub_name", senderName);
    const msgData = {
      conversation_id: active.id,
      sender_name: senderName,
      text: text.trim() || "",
    };
    if (attachment) {
      msgData.attachment_url = attachment.url;
      msgData.attachment_type = attachment.type;
    }
    await base44.entities.Message.create(msgData);
    await base44.entities.Conversation.update(active.id, { last_message: text.trim() || `Sent a ${attachment.type}` });
    setMessages((m) => [...m, { ...msgData, created_date: new Date().toISOString() }]);
    setText("");
    setAttachment(null);
  };

  const renderAttachment = (m) => {
    if (!m.attachment_url) return null;
    if (m.attachment_type === "image") {
      return (
        <img
          src={m.attachment_url}
          alt="attachment"
          className="mb-1 max-w-[200px] cursor-pointer rounded-xl object-cover"
          onClick={() => setEnlargedImage(m.attachment_url)}
        />
      );
    }
    if (m.attachment_type === "video") {
      return <video src={m.attachment_url} controls className="mb-1 max-w-[200px] rounded-xl" />;
    }
    return (
      <a href={m.attachment_url} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2 text-xs underline">
        <FileText className="h-4 w-4" /> Download file
      </a>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">Messages</h1>
        <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"><Plus className="h-4 w-4" /> New</button>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className={`rounded-2xl border border-border bg-card ${showThread ? "hidden lg:block" : "block"}`}>
          {loading ? (
            <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-4 border-secondary border-t-primary" /></div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <MessageCircle className="mx-auto mb-2 h-8 w-8" />
              No conversations yet.
              <div className="mt-3">
                <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"><Plus className="h-4 w-4" /> New conversation</button>
              </div>
            </div>
          ) : (
            conversations.map((c) => (
              <button key={c.id} onClick={() => { setActive(c); setShowThread(true); }} className={`flex w-full items-start gap-3 border-b border-border p-3 text-left last:border-0 ${active?.id === c.id ? "bg-secondary" : ""}`}>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                  {(c.participant_name || "P").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{c.participant_name}</div>
                  <div className="truncate text-xs text-muted-foreground">{c.last_message || c.listing_title || "Start chatting"}</div>
                </div>
              </button>
            ))
          )}
        </div>

        <div className={`lg:col-span-2 ${showThread ? "block" : "hidden lg:block"}`}>
          {active ? (
            <div className="flex h-[60vh] flex-col rounded-2xl border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border p-3">
                <button onClick={() => setShowThread(false)} className="text-muted-foreground hover:text-foreground lg:hidden">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="text-sm font-bold">{active.participant_name}</div>
                {active.listing_title && <div className="text-xs text-muted-foreground">{active.listing_title}</div>}
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                {messages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Say g'day 👋</p>
                ) : (
                  messages.map((m, i) => (
                    <div key={i} className={`flex ${m.sender_name === senderName ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.sender_name === senderName ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                        {m.sender_name !== senderName && <div className="text-xs font-bold text-primary">{m.sender_name}</div>}
                        {renderAttachment(m)}
                        {m.text}
                      </div>
                    </div>
                  ))
                )}
              </div>
              {attachment && (
                <div className="flex items-center gap-2 border-t border-border px-3 py-2">
                  {attachment.type === "image" ? (
                    <img src={attachment.url} alt="" className="h-12 w-12 rounded-lg object-cover" />
                  ) : attachment.type === "video" ? (
                    <video src={attachment.url} className="h-12 w-12 rounded-lg object-cover" muted />
                  ) : (
                    <div className="flex items-center gap-1 text-xs"><FileText className="h-4 w-4" /> {attachment.name}</div>
                  )}
                  <span className="truncate text-xs text-muted-foreground">{attachment.name}</span>
                  <button onClick={() => setAttachment(null)} className="ml-auto rounded-full bg-destructive p-1 text-white">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              {uploading && (
                <div className="flex items-center justify-center gap-2 border-t border-border py-2 text-xs text-muted-foreground">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-secondary border-t-primary" /> Uploading...
                </div>
              )}
              <div className="space-y-2 border-t border-border p-3">
                {!senderName && (
                  <input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Your name (required to send)" className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-sm outline-none focus:border-primary" />
                )}
                <div className="flex gap-2">
                  <input type="file" accept="image/*,video/*" className="hidden" ref={fileInputRef} onChange={(e) => e.target.files[0] && handleFileSelect(e.target.files[0])} />
                  <button onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center rounded-xl border border-border px-3" style={{ color: "#E60012" }}>
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Type a message..." className="flex-1 rounded-xl border border-border bg-secondary px-3 py-2 text-sm outline-none focus:border-primary" />
                  <button onClick={send} disabled={!senderName.trim() || (!text.trim() && !attachment)} className="rounded-xl bg-primary px-4 text-primary-foreground disabled:opacity-50"><Send className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-[60vh] items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
              Select a conversation
            </div>
          )}
        </div>
      </div>

      {enlargedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setEnlargedImage(null)}>
          <img src={enlargedImage} alt="" className="max-h-[90vh] max-w-full rounded-xl" />
          <button className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white"><X className="h-5 w-5" /></button>
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setShowNew(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">New conversation</h2>
              <button onClick={() => setShowNew(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Enter the recipient's display name or @handle to start a direct conversation.</p>
            {newError && <div className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{newError}</div>}
            <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Recipient name or @handle" className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setShowNew(false)} className="rounded-xl border border-border px-4 py-2 text-sm font-medium">Cancel</button>
              <button onClick={startConversation} disabled={!recipient.trim() || starting} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">{starting ? "Starting..." : "Start"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}