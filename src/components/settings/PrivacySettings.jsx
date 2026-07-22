import React from "react";
import { Eye, Mail, Wrench } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { SettingsRow } from "@/components/settings/SettingsSection";

export default function PrivacySettings() {
  const [profileVis, setProfileVis] = React.useState(localStorage.getItem("hh_privacy_profile") || "everyone");
  const [canMsg, setCanMsg] = React.useState(localStorage.getItem("hh_privacy_msg") || "everyone");
  const [garagePublic, setGaragePublic] = React.useState(localStorage.getItem("hh_garage_public") !== "false");

  const set = (key, val, setter) => { localStorage.setItem(key, val); setter(val); };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <SettingsRow icon={Eye} label="Profile Visibility" sublabel={`Visible to ${profileVis === "everyone" ? "everyone" : "followers only"}`} right="chevron" onClick={() => {
        const next = profileVis === "everyone" ? "followers" : "everyone";
        set("hh_privacy_profile", next, setProfileVis);
      }} />
      <SettingsRow icon={Mail} label="Who Can Message You" sublabel={canMsg === "everyone" ? "Everyone" : "Followers only"} right="chevron" onClick={() => {
        const next = canMsg === "everyone" ? "followers" : "everyone";
        set("hh_privacy_msg", next, setCanMsg);
      }} />
      <div className="flex items-center gap-3 px-4 py-3 border-t border-border">
        <Wrench className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
        <div className="flex-1">
          <div className="text-sm font-semibold">Public Garage</div>
          <div className="text-xs text-muted-foreground">Show your garage to everyone</div>
        </div>
        <Switch checked={garagePublic} onCheckedChange={(v) => set("hh_garage_public", String(v), setGaragePublic)} />
      </div>
    </div>
  );
}