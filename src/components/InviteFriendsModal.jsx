import React from "react";
import { base44 } from "@/api/base44Client";
import { X, Search, Check, Copy, Share2 } from "lucide-react";
import { getCurrentUser } from "@/lib/userIdentity";
import { toast } from "@/components/ui/use-toast";

export default function InviteFriendsModal({ event, onClose }) {
  const [follows, setFollows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [invited, setInvited] = React.useState({});

  React.useEffect(() => {
    const me = getCurrentUser();
    base44.entities.Follow.filter({ follower_name: me })
      .then((f) => {
        setFollows(f);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = follows.filter((f) =>
    f.following_name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleInvite = async (friendName) => {
    const me = getCurrentUser() || "Anonymous";
    await base44.entities.Notification.create({
      type: "event_reminder",
      from_name: me,
      to_name: friendName,
      text: `Invited you to ${event.title}`,
      read: false,
    });
    setInvited((prev) => ({ ...prev, [friendName]: true }));
    toast({ title: `Invitation sent to ${friendName}` });
  };

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(window.location.href);
    toast({ title: "Link copied!" });
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: event.title, text: event.description, url: window.location.href });
      } catch {}
    } else {
      handleCopyLink();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-border sm:rounded-2xl"
        style={{ backgroundColor: "#0A0A0A" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="text-base font-bold">Invite Friends to {event.title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-border p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search friends..."
              className="w-full rounded-xl border border-border py-2.5 pl-10 pr-4 text-sm outline-none focus:border-primary"
              style={{ backgroundColor: "#1A1A1A" }}
            />
          </div>
        </div>

        {/* Friends list */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-secondary border-t-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {search ? "No friends found matching your search." : "You're not following anyone yet. Follow users to invite them to events."}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((f) => {
                const name = f.following_name;
                const isInvited = invited[name];
                return (
                  <div
                    key={f.id}
                    className="flex items-center gap-3 rounded-xl border border-border p-3"
                    style={{ backgroundColor: "#1A1A1A" }}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                      {(name || "?").charAt(0).toUpperCase()}
                    </div>
                    <span className="flex-1 text-sm font-semibold">{name}</span>
                    <button
                      onClick={() => handleInvite(name)}
                      disabled={isInvited}
                      className={`rounded-lg px-4 py-1.5 text-xs font-bold transition ${
                        isInvited ? "bg-green-500/20 text-green-400" : "text-white active:scale-95"
                      }`}
                      style={!isInvited ? { backgroundColor: "#E60012" } : undefined}
                    >
                      {isInvited ? (
                        <span className="flex items-center gap-1"><Check className="h-3 w-3" /> Invited ✓</span>
                      ) : (
                        "Invite"
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="space-y-2 border-t border-border p-3">
          <div className="flex gap-2">
            <button onClick={handleShare} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-xs font-bold text-muted-foreground hover:text-primary">
              <Share2 className="h-3.5 w-3.5" /> Share
            </button>
            <button onClick={handleCopyLink} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-xs font-bold text-muted-foreground hover:text-primary">
              <Copy className="h-3.5 w-3.5" /> Copy link
            </button>
          </div>
          <button onClick={onClose} className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}