import React from "react";
import { base44 } from "@/api/base44Client";
import { Bell, Heart, MessageCircle, UserPlus, AtSign, Tag, CalendarDays, Shield, FileWarning, TrendingUp } from "lucide-react";
import { NotificationType } from "@/lib/registries";

const ICONS = {
  [NotificationType.NEW_FOLLOWER]: UserPlus,
  [NotificationType.NEW_COMMENT]: MessageCircle,
  [NotificationType.NEW_LIKE]: Heart,
  [NotificationType.MENTION]: AtSign,
  [NotificationType.BUSINESS_TAG]: Tag,
  [NotificationType.EVENT_REMINDER]: CalendarDays,
  [NotificationType.MODERATION_OUTCOME]: Shield,
  [NotificationType.REPORT_UPDATE]: FileWarning,
  [NotificationType.TRUST_TIER_CHANGE]: TrendingUp,
};

const LABELS = {
  [NotificationType.NEW_FOLLOWER]: "started following you",
  [NotificationType.NEW_COMMENT]: "commented on your post",
  [NotificationType.NEW_LIKE]: "liked your post",
  [NotificationType.MENTION]: "mentioned you",
  [NotificationType.BUSINESS_TAG]: "tagged your business",
  [NotificationType.EVENT_REMINDER]: "event reminder",
  [NotificationType.MODERATION_OUTCOME]: "moderation outcome",
  [NotificationType.REPORT_UPDATE]: "report update",
  [NotificationType.TRUST_TIER_CHANGE]: "your trust tier increased",
};

export default function Notifications() {
  const [notifications, setNotifications] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const load = async () => {
    try {
      const u = await base44.auth.me();
      const ns = await base44.entities.Notification.filter({ recipient_id: u.id }, "-created_date", 50);
      setNotifications(ns);
    } catch (e) {
      // not logged in
    } finally {
      setLoading(false);
    }
  };
  React.useEffect(() => { load(); }, []);

  const handleMarkRead = async (n) => {
    if (n.read_at) return;
    const ts = new Date().toISOString();
    await base44.entities.Notification.update(n.id, { read_at: ts });
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: ts } : x)));
  };

  const handleMarkAllRead = async () => {
    const unread = notifications.filter((n) => !n.read_at);
    const ts = new Date().toISOString();
    await Promise.all(unread.map((n) => base44.entities.Notification.update(n.id, { read_at: ts })));
    setNotifications((prev) => prev.map((x) => ({ ...x, read_at: x.read_at || ts })));
  };

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Notifications</h1>
          <p className="text-sm text-muted-foreground">{unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}</p>
        </div>
        {unreadCount > 0 && (
          <button onClick={handleMarkAllRead} className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">Mark all read</button>
        )}
      </div>
      {loading ? (
        <div className="flex h-32 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" /></div>
      ) : notifications.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <Bell className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="mt-3 font-bold">No notifications</h3>
          <p className="mt-1 text-sm text-muted-foreground">Follows, comments, and tier changes will show up here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const Icon = ICONS[n.notification_type] || Bell;
            const unread = !n.read_at;
            return (
              <div
                key={n.id}
                onClick={() => handleMarkRead(n)}
                className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition active:scale-[0.98]"
                style={{
                  backgroundColor: unread ? "#1F1F1F" : "#1A1A1A",
                  borderColor: unread ? "rgba(230, 0, 18, 0.3)" : undefined,
                }}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm" style={{ fontWeight: unread ? 700 : 400 }}>
                    {LABELS[n.notification_type] || n.notification_type}
                  </p>
                  <p className="text-xs text-muted-foreground">{new Date(n.created_date).toLocaleString()}</p>
                </div>
                {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}