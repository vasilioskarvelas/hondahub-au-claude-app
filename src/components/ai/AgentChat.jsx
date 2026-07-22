import React from "react";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Plus, MessageSquare } from "lucide-react";
import MessageBubble from "./MessageBubble";

export default function AgentChat({ agentName, agentLabel, onClose }) {
  const [conversation, setConversation] = React.useState(null);
  const [conversations, setConversations] = React.useState([]);
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [showConvList, setShowConvList] = React.useState(false);
  const scrollRef = React.useRef(null);

  // Load conversations for this agent
  React.useEffect(() => {
    loadConversations();
  }, [agentName]);

  // Subscribe to conversation updates
  React.useEffect(() => {
    if (!conversation?.id) return;
    const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (data) => {
      setMessages(data.messages || []);
      setSending(false);
    });
    return () => unsubscribe();
  }, [conversation?.id]);

  // Auto-scroll to bottom
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const loadConversations = async () => {
    setLoading(true);
    try {
      const list = await base44.agents.listConversations({ agent_name: agentName });
      const sorted = (list || []).sort((a, b) => new Date(b.updated_date || 0) - new Date(a.updated_date || 0));
      setConversations(sorted);
      if (sorted.length > 0) {
        const loaded = await base44.agents.getConversation(sorted[0].id);
        setConversation(loaded);
        setMessages(loaded.messages || []);
      } else {
        await startNewConversation();
      }
    } catch (e) {
      console.error("Failed to load conversations:", e);
    } finally {
      setLoading(false);
    }
  };

  const startNewConversation = async () => {
    setLoading(true);
    try {
      const conv = await base44.agents.createConversation({
        agent_name: agentName,
        metadata: { name: `Chat with ${agentLabel}`, description: agentLabel },
      });
      setConversation(conv);
      setMessages(conv.messages || []);
      setShowConvList(false);
      // Refresh conversation list
      const list = await base44.agents.listConversations({ agent_name: agentName });
      setConversations(list || []);
    } catch (e) {
      console.error("Failed to create conversation:", e);
    } finally {
      setLoading(false);
    }
  };

  const selectConversation = async (convId) => {
    setLoading(true);
    try {
      const loaded = await base44.agents.getConversation(convId);
      setConversation(loaded);
      setMessages(loaded.messages || []);
      setShowConvList(false);
    } catch (e) {
      console.error("Failed to load conversation:", e);
    } finally {
      setLoading(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || !conversation || sending) return;
    setInput("");
    setSending(true);
    try {
      await base44.agents.addMessage(conversation, { role: "user", content: text });
    } catch (e) {
      console.error("Failed to send message:", e);
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="relative flex h-full w-full max-w-md flex-col bg-background"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3" style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowConvList(!showConvList)} className="rounded-lg p-1.5 hover:bg-secondary">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </button>
            <div>
              <h3 className="text-sm font-bold">{agentLabel}</h3>
              <p className="text-[10px] text-muted-foreground">AI Agent</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={startNewConversation} className="rounded-lg p-1.5 hover:bg-secondary" title="New conversation">
              <Plus className="h-4 w-4 text-muted-foreground" />
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-secondary">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Conversation list dropdown */}
        <AnimatePresence>
          {showConvList && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-border"
            >
              <div className="max-h-48 overflow-y-auto">
                {conversations.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-muted-foreground">No conversations yet</p>
                ) : (
                  conversations.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => selectConversation(c.id)}
                      className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-secondary ${conversation?.id === c.id ? "bg-secondary" : ""}`}
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{c.metadata?.name || "Conversation"}</span>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <MessageSquare className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm font-medium">Start a conversation</p>
              <p className="mt-1 text-xs text-muted-foreground">Send a message to begin chatting with the {agentLabel}</p>
            </div>
          ) : (
            messages.map((msg, i) => <MessageBubble key={i} message={msg} />)
          )}
          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md bg-secondary px-4 py-3">
                <div className="flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "0ms" }} />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "150ms" }} />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border p-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}>
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder={`Message ${agentLabel}...`}
              className="flex-1 resize-none rounded-2xl border border-border bg-secondary px-4 py-2.5 text-sm outline-none focus:border-primary"
              style={{ maxHeight: "120px" }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || sending}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40 active:scale-90 transition-transform"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}