import React from "react";
import { Crown, CreditCard, Rocket } from "lucide-react";
import { Link } from "react-router-dom";
import { SettingsRow } from "@/components/settings/SettingsSection";

export default function SubscriptionSection() {
  const plan = localStorage.getItem("hh_plan") || "free";

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border bg-primary/5 px-4 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
          <Crown className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-black capitalize">{plan === "dealer" ? "Dealer Plan" : plan === "pro" ? "Pro Plan" : "Free Plan"}</div>
          <div className="text-xs text-muted-foreground">
            {plan === "free" ? "Upgrade for partner discounts & more" : "Active subscription"}
          </div>
        </div>
        <Link to="/pricing" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
          {plan === "free" ? "Upgrade" : "Manage"}
        </Link>
      </div>
      <SettingsRow icon={CreditCard} label="Payment Methods" sublabel="Manage saved cards" right="chevron" onClick={() => {}} />
      <SettingsRow icon={Rocket} label="Listing Boosts" sublabel="$10 to feature your listing" right="chevron" onClick={() => {}} last />
    </div>
  );
}