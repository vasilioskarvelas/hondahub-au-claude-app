import React from "react";
import { Heart, MessageCircle, UserPlus, Mail, Tag, Gift } from "lucide-react";
import { Switch } from "@/components/ui/switch";

const TOGGLES = [
  { key: "likes", label: "Likes", desc: "When someone likes your post", icon: Heart },
  { key: "comments", label: "Comments", desc: "When someone comments on your post", icon: MessageCircle },
  { key: "follows", label: "New Followers", desc: "When someone follows you", icon: UserPlus },
  { key: "messages", label: "Messages", desc: "Marketplace messages from buyers", icon: Mail },
  { key: "listings", label: "New Listings", desc: "New cars & parts matching your search", icon: Tag },
  { key: "giveaways", label: "Giveaways", desc: "Giveaway draws & reward updates", icon: Gift },
];

export default function NotificationSettings() {
  const [prefs, setPrefs] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem("hh_notif") || "{}"); } catch { return {}; }
  });

  const toggle = (key, val) => {
    const next = { ...prefs, [key]: val };
    setPrefs(next);
    localStorage.setItem("hh_notif", JSON.stringify(next));
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {TOGGLES.map((t, i) => {
        const Icon = t.icon;
        return (
          <div key={t.key} className={`flex items-center gap-3 px-4 py-3 ${i !== TOGGLES.length - 1 ? "border-b border-border" : ""}`}>
            <Icon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{t.label}</div>
              <div className="text-xs text-muted-foreground">{t.desc}</div>
            </div>
            <Switch checked={prefs[t.key] !== false} onCheckedChange={(v) => toggle(t.key, v)} />
          </div>
        );
      })}
    </div>
  );
}