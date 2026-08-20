import React from "react";
import { base44 } from "@/api/base44Client";
import { Bell, Heart, MessageCircle, UserPlus, AtSign, Tag, CalendarDays, Shield, FileWarning, TrendingUp, ShoppingBag, Car } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
  [NotificationType.NEW_MARKETPLACE_MESSAGE]: MessageCircle,
  [NotificationType.LISTING_UPDATE]: ShoppingBag,
  [NotificationType.NEW_VEHICLE_UPDATE]: Car,
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
  [NotificationType.NEW_MARKETPLACE_MESSAGE]: "sent you a marketplace message",
  [NotificationType.LISTING_UPDATE]: "new activity on your listing",
  [NotificationType.NEW_VEHICLE_UPDATE]: "new update on a vehicle you follow",
};

// Type-based fallback routes (no target, or target lookup failed).
const ROUTES = {
  [NotificationType.NEW_MARKETPLACE_MESSAGE]: "/conversations",
  [NotificationType.LISTING_UPDATE]: "/marketplace",
  [NotificationType.NEW_VEHICLE_UPDATE]: "/feed",
  [NotificationType.NEW_COMMENT]: "/feed",
  [NotificationType.NEW_LIKE]: "/feed",
  [NotificationType.NEW_FOLLOWER]: "/feed",
};

// Direct deep links from a polymorphic target.
const TARGET_ROUTES = {
  post: (id) => `/post/${id}`,
  vehicle: (id) => `/vehicle/${id}`,
  group: (id) => `/group/${id}`,
  event: (id) => `/event/${id}`,
  listing: (id) => `/marketplace/${id}`,
  marketplace_message: () => "/conversations",
  moderation_case: (id) => `/moderation/case/${id}`,
  report: () => "/moderation",
};

export default function Notifications() {
  const [notifications, setNotifications] = React.useState([]);
  const [actors, setActors] = React.useState({}); // actor_id -> { name, avatar_url }
  const [routes, setRoutes] = React.useState({}); // notification_id -> route
  const [loading, setLoading] = React.useState(true);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const u = await base44.auth.me();
      const ns = await base44.entities.Notification.filter({ recipient_id: u.id }, "-created_date", 50);
      setNotifications(ns);

      // Fetch every user once (service-role search) so we can show the sender's
      // name + avatar and resolve user-target deep links by handle.
      const usersRes = await base44.functions.invoke("user-profile", { action: "searchUsers", query: "" });
      const userList = usersRes.data?.users || [];
      const userMap = new Map(userList.map((x) => [x.id, x]));

      // Resolve avatar URLs for every actor + user-target in parallel.
      const mediaIds = Array.from(
        new Set(
          [...ns.map((n) => n.actor_id), ...ns.map((n) => (n.target_type === "user" ? n.target_id : null))]
            .filter(Boolean)
            .map((id) => userMap.get(id)?.avatar_media_id)
            .filter(Boolean)
        )
      );
      const avatarEntries = await Promise.all(
        mediaIds.map(async (mid) => {
          try {
            const r = await base44.functions.invoke("media", { action: "get", media_id: mid });
            return [mid, r.data?.media?.file_url || null];
          } catch {
            return [mid, null];
          }
        })
      );
      const avatarUrls = new Map(avatarEntries);

      const actorMap = {};
      for (const n of ns) {
        const id = n.actor_id;
        if (!id || actorMap[id]) continue;
        const u2 = userMap.get(id);
        if (!u2) { actorMap[id] = null; continue; }
        actorMap[id] = {
          name: u2.handle ? `@${u2.handle}` : u2.display_name || u2.full_name || "Member",
          avatar_url: u2.avatar_media_id ? avatarUrls.get(u2.avatar_media_id) || null : null,
        };
      }
      setActors(actorMap);

      // Precompute a tap destination for every notification.
      const commentIds = ns.filter((n) => n.target_type === "comment" && n.target_id).map((n) => n.target_id);
      const commentPost = {};
      await Promise.all(
        Array.from(new Set(commentIds)).map(async (cid) => {
          try {
            const c = await base44.entities.Comment.get(cid);
            if (c?.post_id) commentPost[cid] = c.post_id;
          } catch {}
        })
      );

      const routeMap = {};
      for (const n of ns) {
        const { target_type, target_id, notification_type } = n;
        let route = null;
        if (target_type === "user" && target_id) {
          const tu = userMap.get(target_id);
          const name = tu?.handle || tu?.display_name || tu?.full_name || target_id;
          route = `/user/${encodeURIComponent(name)}`;
        } else if (target_type === "comment" && target_id) {
          const pid = commentPost[target_id];
          route = pid ? `/post/${pid}?comment=${target_id}` : ROUTES[notification_type] || null;
        } else if (target_type && target_id && TARGET_ROUTES[target_type]) {
          route = TARGET_ROUTES[target_type](target_id);
        } else {
          route = ROUTES[notification_type] || null;
        }
        routeMap[n.id] = route;
      }
      setRoutes(routeMap);
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
    await base44.entities.Notification.update(n.id, { read_at: ts }).catch(() => {});
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: ts } : x)));
  };

  const handleTap = (n) => {
    handleMarkRead(n);
    const route = routes[n.id];
    if (route) navigate(route);
  };

  const handleMarkAllRead = async () => {
    const unread = notifications.filter((n) => !n.read_at);
    const ts = new Date().toISOString();
    await Promise.all(unread.map((n) => base44.entities.Notification.update(n.id, { read_at: ts }).catch(() => {})));
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
            const actor = n.actor_id ? actors[n.actor_id] : null;
            const label = LABELS[n.notification_type] || n.notification_type;
            return (
              <div
                key={n.id}
                onClick={() => handleTap(n)}
                className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition active:scale-[0.98]"
                style={{
                  backgroundColor: unread ? "#1F1F1F" : "#1A1A1A",
                  borderColor: unread ? "rgba(230, 0, 18, 0.3)" : undefined,
                }}
              >
                {actor?.avatar_url ? (
                  <img
                    src={actor.avatar_url}
                    alt={actor.name}
                    className="h-10 w-10 shrink-0 rounded-full object-cover"
                  />
                ) : actor ? (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-black text-primary-foreground">
                    {actor.name.replace(/^@/, "").charAt(0).toUpperCase()}
                  </div>
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm" style={{ fontWeight: unread ? 700 : 400 }}>
                    {actor ? <span className="font-bold">{actor.name}</span> : null}
                    {actor ? " " : ""}
                    {label}
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