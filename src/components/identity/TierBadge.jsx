import React from "react";
import { Shield, Star, BadgeCheck, Crown, UserCog } from "lucide-react";
import { AccountTier } from "@/lib/registries";

const TIER_META = {
  [AccountTier.GUEST]: { label: "Guest", icon: Shield, color: "text-muted-foreground" },
  [AccountTier.NEW_MEMBER]: { label: "New Member", icon: UserCog, color: "text-blue-400" },
  [AccountTier.TRUSTED_MEMBER]: { label: "Trusted Member", icon: Star, color: "text-emerald-400" },
  [AccountTier.VERIFIED_MEMBER]: { label: "Verified Member", icon: BadgeCheck, color: "text-primary" },
  [AccountTier.BUSINESS_VERIFIED]: { label: "Business Verified", icon: BadgeCheck, color: "text-amber-400" },
  [AccountTier.MODERATOR]: { label: "Moderator", icon: Shield, color: "text-purple-400" },
  [AccountTier.ADMIN]: { label: "Administrator", icon: Crown, color: "text-primary" },
};

export default function TierBadge({ tier, score, size = "sm" }) {
  const meta = TIER_META[tier] || TIER_META[AccountTier.NEW_MEMBER];
  const Icon = meta.icon;
  const sizeCls = size === "lg" ? "px-3 py-1.5 text-sm" : "px-2 py-1 text-xs";
  const iconCls = size === "lg" ? "h-4 w-4" : "h-3 w-3";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-card ${sizeCls} font-semibold ${meta.color}`}>
      <Icon className={iconCls} />
      {meta.label}
      {score !== undefined && score !== null && (
        <span className="text-muted-foreground">· {score}</span>
      )}
    </span>
  );
}