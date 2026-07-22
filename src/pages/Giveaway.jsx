import React from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Gift, Ticket, Crown, Calendar, Users, Trophy, Sparkles } from "lucide-react";

export default function Giveaway() {
  const [giveaway, setGiveaway] = React.useState(null);
  const [entries, setEntries] = React.useState([]);
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [buying, setBuying] = React.useState(false);
  const [claiming, setClaiming] = React.useState(false);
  const [buyerName, setBuyerName] = React.useState("");

  React.useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    base44.entities.Giveaway.filter({ status: "active" }, "-created_date", 1).then((g) => {
      if (g.length > 0) {
        const active = g[0];
        setGiveaway(active);
        base44.entities.GiveawayEntry.filter({ giveaway_id: active.id }, "-created_date", 50).then(setEntries);
      }
      setLoading(false);
    });
  }, []);

  const userTier = user?.subscription_tier || "free";
  const isSubscribed = userTier === "pro" || userTier === "dealer";
  const totalTickets = entries.reduce((sum, e) => sum + (e.tickets || 1), 0);
  const userDisplayName = user?.full_name || user?.email;
  const hasSubscriberEntry = user && entries.some((e) => e.user_name === userDisplayName && e.entry_type === "subscriber_points");

  const handleBuyTicket = async () => {
    if (window.self !== window.top) {
      alert("Checkout is only available from the published app. Please open the app in a new tab to purchase raffle tickets.");
      return;
    }
    setBuying(true);
    try {
      const res = await base44.functions.invoke("create-checkout-session", {
        mode: "raffle",
        giveaway_id: giveaway.id,
        buyer_name: buyerName || "Guest",
      });
      window.location.href = res.data?.url || res.url;
    } catch (err) {
      alert("Could not start checkout. Please try again.");
    } finally {
      setBuying(false);
    }
  };

  const handleClaimSubscriberEntry = async () => {
    if (!user) return;
    setClaiming(true);
    try {
      const tickets = userTier === "dealer" ? 3 : 1;
      await base44.entities.GiveawayEntry.create({
        giveaway_id: giveaway.id,
        user_name: userDisplayName,
        entry_type: "subscriber_points",
        tickets,
      });
      const newTotal = (giveaway.total_entries || 0) + tickets;
      await base44.entities.Giveaway.update(giveaway.id, { total_entries: newTotal });
      setGiveaway({ ...giveaway, total_entries: newTotal });
      base44.entities.GiveawayEntry.filter({ giveaway_id: giveaway.id }, "-created_date", 50).then(setEntries);
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" />
      </div>
    );
  }

  if (!giveaway) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
        <Gift className="mx-auto h-10 w-10 text-muted-foreground" />
        <h3 className="mt-3 font-bold">No active giveaway</h3>
        <p className="mt-1 text-sm text-muted-foreground">Check back soon for our next car giveaway.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-3xl border border-border">
        <div className="relative">
          <img src={giveaway.car_photo || "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800"} alt={giveaway.car_name} className="h-64 w-full object-cover sm:h-80" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
          <div className="absolute bottom-0 p-5">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
              <Sparkles className="h-3 w-3" /> Monthly Giveaway
            </span>
            <h1 className="mt-2 text-3xl font-black leading-tight">{giveaway.title}</h1>
            <p className="text-sm text-muted-foreground">{giveaway.car_name}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat icon={Calendar} label="Draw Date" value={giveaway.draw_date} />
        <Stat icon={Ticket} label="Entries" value={totalTickets} />
        <Stat icon={Trophy} label="Odds" value={totalTickets > 0 ? `1:${totalTickets}` : "—"} />
      </div>

      {giveaway.description && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-sm leading-relaxed text-muted-foreground">{giveaway.description}</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" />
            <h2 className="font-bold">Subscriber Entry</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSubscribed ? "Claim your free entries as a subscribed member." : "Subscribers get free entries every month."}
          </p>
          {isSubscribed ? (
            <button onClick={handleClaimSubscriberEntry} disabled={claiming || hasSubscriberEntry} className="mt-3 w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
              {hasSubscriberEntry ? "Entry Claimed ✓" : claiming ? "Claiming..." : `Claim ${userTier === "dealer" ? "3 Free Entries" : "Free Entry"}`}
            </button>
          ) : (
            <Link to="/pricing" className="mt-3 block w-full rounded-xl border border-primary py-2.5 text-center text-sm font-bold text-primary">
              Subscribe to Enter Free
            </Link>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" />
            <h2 className="font-bold">Buy Raffle Ticket</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">${giveaway.raffle_ticket_price || 5} per ticket. Open to everyone.</p>
          <input
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            placeholder="Your name"
            className="mt-2 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button onClick={handleBuyTicket} disabled={buying || !buyerName} className="mt-2 w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
            {buying ? "Redirecting..." : `Buy Ticket · $${giveaway.raffle_ticket_price || 5}`}
          </button>
        </div>
      </div>

      {entries.length > 0 && (
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><Users className="h-5 w-5 text-primary" /> Recent Entries</h2>
          <div className="space-y-2">
            {entries.slice(0, 10).map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                    {e.user_name?.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium">{e.user_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {e.entry_type === "subscriber_points" ? (
                    <span className="rounded-md bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">Subscriber</span>
                  ) : (
                    <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-400">Raffle</span>
                  )}
                  <span className="text-muted-foreground">{e.tickets} ticket(s)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-center">
      <Icon className="mx-auto h-4 w-4 text-primary" />
      <div className="mt-1 text-sm font-black">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}