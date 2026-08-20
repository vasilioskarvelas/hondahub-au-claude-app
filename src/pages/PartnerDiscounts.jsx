import React from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Lock, Crown, ExternalLink, Percent, Copy, Check } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

export default function PartnerDiscounts() {
  const [discounts, setDiscounts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [user, setUser] = React.useState(null);
  const [copied, setCopied] = React.useState({});

  React.useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    base44.entities.PartnerDiscount.list("-created_date", 50).then((d) => {
      setDiscounts(d);
      setLoading(false);
    });
  }, []);

  const userTier = user?.subscription_tier || "free";
  const isSubscribed = userTier === "pro" || userTier === "dealer";

  const handleCopy = async (id, code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied((c) => ({ ...c, [id]: true }));
      setTimeout(() => setCopied((c) => ({ ...c, [id]: false })), 2000);
    } catch {
      toast({ title: "Could not copy code" });
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black">Shop</h1>
        <p className="text-sm text-muted-foreground">Exclusive app-only discounts from trusted Honda parts brands</p>
      </div>

      {!isSubscribed && (
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" />
            <span className="font-bold">Subscriber Exclusive</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Subscribe to Pro or Dealer to unlock exclusive discount codes from brands like Jim Yard, Spool Up and more.</p>
          <Link to="/pricing" className="mt-3 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Upgrade Now</Link>
        </div>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" /></div>
      ) : discounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
          No partner discounts yet. Check back soon!
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {discounts.map((d) => {
            const isCopied = copied[d.id];
            return (
              <div key={d.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  {d.logo_url ? (
                    <img src={d.logo_url} alt="" className="h-12 w-12 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-lg font-black">{d.company_name?.charAt(0)}</div>
                  )}
                  <div className="flex-1">
                    <div className="font-bold">{d.company_name}</div>
                    {d.category && <div className="text-xs text-muted-foreground">{d.category}</div>}
                    {d.discount_percent != null && (
                      <div className="mt-1 inline-flex items-center gap-1 rounded-lg bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
                        <Percent className="h-3 w-3" /> {d.discount_percent}% off
                      </div>
                    )}
                  </div>
                </div>
                {d.description && <p className="mt-2 text-sm text-muted-foreground">{d.description}</p>}

                <div className="mt-3">
                  {isSubscribed ? (
                    <div className="space-y-2">
                      <div className="rounded-lg border border-border bg-secondary p-3">
                        <div className="text-xs font-medium text-muted-foreground">Your member discount code</div>
                        <code className="mt-1 block font-mono text-lg font-bold text-primary">{d.discount_code}</code>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleCopy(d.id, d.discount_code)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground active:scale-[0.98]"
                        >
                          {isCopied ? <><Check className="h-3.5 w-3.5" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy Code</>}
                        </button>
                        {d.website_url && (
                          <a
                            href={d.website_url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-bold text-muted-foreground hover:text-primary"
                          >
                            <ExternalLink className="h-3.5 w-3.5" /> Visit
                          </a>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative overflow-hidden rounded-lg border border-border bg-secondary p-3">
                        <div className="text-xs font-medium text-muted-foreground">Member-exclusive code</div>
                        <code className="mt-1 block select-none font-mono text-lg font-bold text-primary blur-sm">{d.discount_code}</code>
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <div className="flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1 text-xs font-bold text-muted-foreground backdrop-blur">
                            <Lock className="h-3.5 w-3.5" /> Members only
                          </div>
                        </div>
                      </div>
                      <Link to="/pricing" className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground active:scale-[0.98]">
                        <Crown className="h-4 w-4" /> Upgrade to reveal
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}