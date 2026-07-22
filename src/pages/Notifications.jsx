import React from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Heart, MessageCircle, UserPlus, AtSign, CornerDownRight, Bell, Mail, Tag, Gavel, Gift, CalendarDays, Percent } from "lucide-react";

const ICONS = {
  like: Heart,
  comment: MessageCircle,
  reply: CornerDownRight,
  follow: UserPlus,
  mention: AtSign,
  story_reaction: Heart,
  marketplace_message: Mail,
  message_received: Mail,
  offer_received: Tag,
  bid_placed: Gavel,
  giveaway_update: Gift,
  event_reminder: CalendarDays,
  partner_discount: Percent,
};

function getNavigatePath(n) {
  switch (n.type) {
    case "comment":
    case "like":
    case "mention":
    case "reply":
    case "story_reaction":
    case "event_reminder":
      return "/community";
    case "follow":
      return `/user/${encodeURIComponent(n.from_name)}`;
    case "message_received":
    case "marketplace_message":
      return "/messages";
    case "offer_received":
      return n.listing_id ? `/listing/${n.listing_id}` : "/messages";
    case "bid_placed":
      return n.listing_id ? `/listing/${n.listing_id}` : "/market";
    case "giveaway_update":
      return "/giveaway";
    case "partner_discount":
      return "/shop";
    default:
      return null;
  }
}

export default function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const load = () => {
    base44.entities.Notification.list("-created_date", 50).then((n) => {
      setNotifications(n);
      setLoading(false);
    });
  };
  React.useEffect(load, []);

  const handleClick = async (n) => {
    if (!n.read) {
      base44.entities.Notification.update(n.id, { read: true });
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
    const path = getNavigatePath(n);
    if (path) navigate(path);
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <h1 className="text-2xl font-black">Notifications</h1>
        <p className="text-sm text-muted-foreground">Stay updated on your activity</p>
      </div>
      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <Bell className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="mt-3 font-bold">No notifications</h3>
          <p className="mt-1 text-sm text-muted-foreground">Likes, comments, and follows will show up here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const Icon = ICONS[n.type] || Bell;
            return (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 transition active:scale-[0.98]"
                style={{
                  backgroundColor: n.read ? "#1A1A1A" : "#1F1F1F",
                  borderColor: n.read ? undefined : "rgba(230, 0, 18, 0.3)",
                }}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm" style={{ fontWeight: n.read ? 400 : 700 }}>
                    <span className="font-bold">{n.from_name}</span> {n.text}
                  </p>
                  <p className="text-xs text-muted-foreground">{new Date(n.created_date).toLocaleDateString()}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}