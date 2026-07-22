import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Check, Zap, Crown } from "lucide-react";

const PLANS = {
  free: { name: "Free", price: 0, priceId: null, icon: Check, color: "text-muted-foreground", features: ["3 active listings", "Browse all listings", "Make offers & message", "Buy raffle tickets"] },
  pro: { name: "Pro", price: 15, priceId: "price_1Tq4mgBoLwMT73MxeCC7vib2", icon: Zap, color: "text-primary", features: ["Unlimited listings", "1 free boost / month", "Verified badge", "Partner discount codes", "1 free giveaway entry / month", "Priority support"] },
  dealer: { name: "Dealer", price: 49, priceId: "price_1Tq4mgBoLwMT73MkslPo770", icon: Crown, color: "text-amber-400", features: ["Everything in Pro", "5 free boosts / month", "Featured dealer badge", "All partner discounts", "3 free giveaway entries / month", "Bulk listing tools"] },
};

export default function Pricing() {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(null);

  React.useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const subscribe = async (planKey) => {
    const plan = PLANS[planKey];
    if (!plan.priceId) return;
    if (window.self !== window.top) {
      alert("Checkout is only available from the published app. Please open the app in a new tab.");
      return;
    }
    setLoading(planKey);
    try {
      const res = await base44.functions.invoke("create-checkout-session", { mode: "subscribe", price_id: plan.priceId });
      window.location.href = res.data.url;
    } catch {
      alert("Could not start checkout. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  const currentTier = user?.subscription_tier || "free";

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-black">Choose Your Plan</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sell more, boost higher, stand out.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {Object.entries(PLANS).map(([key, plan]) => {
          const Icon = plan.icon;
          const isCurrent = currentTier === key;
          return (
            <div key={key} className={`relative rounded-2xl border bg-card p-5 ${key === "pro" ? "border-primary glow-red" : "border-border"}`}>
              {key === "pro" && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[10px] font-bold text-primary-foreground">MOST POPULAR</span>}
              <div className="flex items-center gap-2">
                <Icon className={`h-5 w-5 ${plan.color}`} />
                <h2 className="text-lg font-bold">{plan.name}</h2>
              </div>
              <div className="mt-2">
                <span className="text-3xl font-black">${plan.price}</span>
                {plan.price > 0 && <span className="text-sm text-muted-foreground">/mo</span>}
              </div>
              <ul className="mt-4 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {f}
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                {plan.price === 0 ? (
                  <button disabled={isCurrent} className="w-full rounded-xl border border-border py-2.5 text-sm font-bold disabled:opacity-50">
                    {isCurrent ? "Current Plan" : "Free Forever"}
                  </button>
                ) : isCurrent ? (
                  <button disabled className="w-full rounded-xl bg-secondary py-2.5 text-sm font-bold text-muted-foreground">Current Plan</button>
                ) : (
                  <button onClick={() => subscribe(key)} disabled={loading === key} className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
                    {loading === key ? "Redirecting..." : `Upgrade to ${plan.name}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Cancel anytime. Pricing in AUD. <Link to="/" className="text-primary font-semibold">Back to home</Link>
      </p>
    </div>
  );
}