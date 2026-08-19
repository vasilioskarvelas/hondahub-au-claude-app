import React from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { CalendarDays, Gift, ArrowRight, MapPin, Ticket, Star, Eye, Mail, ShieldCheck, TrendingUp, Flame, Users } from "lucide-react";

import MarketplaceListingCard from "@/components/MarketplaceListingCard";
import Hero from "@/components/home/Hero";
import PartnerWall from "@/components/home/PartnerWall";
import Benefits from "@/components/home/Benefits";
import TrackLeaderboard from "@/components/home/TrackLeaderboard";

export default function Home() {
  const [listings, setListings] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [nextEvent, setNextEvent] = React.useState(null);
  const [activeGiveaway, setActiveGiveaway] = React.useState(null);
  const [communitySpotlight, setCommunitySpotlight] = React.useState(null);
  const [partnerDiscounts, setPartnerDiscounts] = React.useState([]);
  const [trending, setTrending] = React.useState([]);
  const [liveCounts, setLiveCounts] = React.useState({ listings: 0, garage_builds: 0, members: 0 });

  React.useEffect(() => {
    base44.functions.invoke("marketplace", { action: "listListings", limit: 12 }).then((res) => {
      setListings(res.data?.listings || []);
      setLoading(false);
    });
    base44.functions.invoke("event", { action: "listDirectory" }).then((res) => {
      const events = res.data?.events || [];
      const upcoming = events.find((x) => new Date(x.starts_at).getTime() >= Date.now());
      setNextEvent(upcoming || null);
    }).catch(() => setNextEvent(null));
    base44.entities.Giveaway.filter({ status: "active" }, "-created_date", 1).then((g) => setActiveGiveaway(g[0] || null));
    base44.functions.invoke("social", { action: "listFeed", limit: 1 }).then((res) => setCommunitySpotlight(res.data?.posts?.[0] || null)).catch(() => setCommunitySpotlight(null));
    base44.entities.PartnerDiscount.list("-created_date", 20).then((d) => setPartnerDiscounts(d));
    base44.functions.invoke("marketplace", { action: "listListings", sort: "views", limit: 6 }).then((res) => setTrending(res.data?.listings || []));
    base44.functions.invoke("homepage-stats", {}).then((res) => {
      if (res.data?.ok) setLiveCounts(res.data.counts);
    }).catch(() => {});
  }, []);

  const featuredCars = listings.filter((l) => l.category === "vehicle");
  const featuredParts = listings.filter((l) => l.category !== "vehicle");

  const stats = {
    total: liveCounts.listings,
    garageCars: liveCounts.garage_builds,
    members: liveCounts.members,
    prizeValue: 500,
  };

  return (
    <div className="space-y-6">
      <Hero stats={stats} />
      <Benefits />
      <PartnerWall partners={partnerDiscounts} />

      <div className="grid gap-4 sm:grid-cols-2">
        <section>
          <div className="mb-2.5 flex items-center gap-2">
            <span className="h-5 w-1 rounded-full bg-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Upcoming Events</h2>
            {nextEvent && <Link to="/events" className="ml-auto text-xs text-primary">See all <ArrowRight className="inline h-3 w-3" /></Link>}
          </div>
          {nextEvent ? (
            <Link to={`/event/${nextEvent.id}`} className="group relative block overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary/50">
              <div className="relative h-32 overflow-hidden">
                {nextEvent.cover_url ? (
                  <img src={nextEvent.cover_url} alt={nextEvent.title} className="h-full w-full object-cover transition group-hover:scale-105" />
                ) : (
                  <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/20 to-secondary"><CalendarDays className="h-10 w-10 text-primary/50" /></div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <div className="line-clamp-1 text-sm font-bold">{nextEvent.title}</div>
                <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" /> {nextEvent.location_general || "TBA"} · {new Date(nextEvent.starts_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })} · {new Date(nextEvent.starts_at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            </Link>
          ) : (
            <div className="flex h-32 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card">
              <CalendarDays className="h-8 w-8 text-muted-foreground/40" />
              <p className="mt-2 text-xs text-muted-foreground">No upcoming events.</p>
            </div>
          )}
        </section>

        <section>
          <div className="mb-2.5 flex items-center gap-2">
            <span className="h-5 w-1 rounded-full bg-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Active Giveaways</h2>
            {activeGiveaway && <Link to="/giveaway" className="ml-auto text-xs text-primary">Enter now <ArrowRight className="inline h-3 w-3" /></Link>}
          </div>
          {activeGiveaway ? (
            <Link to="/giveaway" className="group relative block overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary/50">
              <div className="relative h-32 overflow-hidden">
                {activeGiveaway.car_photo ? (
                  <img src={activeGiveaway.car_photo} alt={activeGiveaway.car_name} className="h-full w-full object-cover transition group-hover:scale-105" />
                ) : (
                  <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/20 to-secondary"><Gift className="h-10 w-10 text-primary/50" /></div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
                <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">LIVE</span>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <div className="line-clamp-1 text-sm font-bold">{activeGiveaway.car_name}</div>
                <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><Ticket className="h-3 w-3" /> Draw {activeGiveaway.draw_date} · {activeGiveaway.total_entries} entries</div>
              </div>
            </Link>
          ) : (
            <div className="flex h-32 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card">
              <Gift className="h-8 w-8 text-muted-foreground/40" />
              <p className="mt-2 text-xs text-muted-foreground">No active giveaways.</p>
            </div>
          )}
        </section>
      </div>

      {featuredCars.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Star className="h-5 w-5 fill-primary text-primary" />
            <h2 className="text-lg font-bold">Featured Cars</h2>
            <span className="ml-auto rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">Premium</span>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {featuredCars.slice(0, 4).map((l) => <MarketplaceListingCard key={l.id} listing={l} />)}
          </div>
        </section>
      )}

      {trending.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Trending Now</h2>
            <span className="ml-auto rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">Most Viewed</span>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {trending.slice(0, 6).map((l) => <MarketplaceListingCard key={l.id} listing={l} />)}
          </div>
        </section>
      )}

      <TrackLeaderboard />

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Star className="h-5 w-5 fill-primary text-primary" />
          <h2 className="text-lg font-bold">Featured Parts</h2>
          <span className="ml-auto rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">Premium</span>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl bg-secondary" />)}
          </div>
        ) : featuredParts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No featured parts yet. <Link to="/marketplace" className="text-primary">Browse all parts →</Link></p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {featuredParts.slice(0, 4).map((l) => <MarketplaceListingCard key={l.id} listing={l} />)}
          </div>
        )}
      </section>

      {featuredCars.length === 0 && featuredParts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No featured listings yet. <Link to="/marketplace" className="text-primary">Browse the market →</Link></p>
        </div>
      )}

      {communitySpotlight && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Community Spotlight</h2>
            <Link to="/feed" className="ml-auto text-xs text-primary">See more <ArrowRight className="inline h-3 w-3" /></Link>
          </div>
          <Link to={`/post/${communitySpotlight.id}`} className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-primary/50 sm:flex-row">
            <div className="h-32 w-full overflow-hidden rounded-xl bg-secondary sm:h-24 sm:w-32">
              {communitySpotlight.media_url ? (
                <img src={communitySpotlight.media_url} alt={communitySpotlight.caption || "post"} className="h-full w-full object-cover transition group-hover:scale-105" />
              ) : (
                <div className="flex h-full items-center justify-center"><Users className="h-8 w-8 text-muted-foreground/40" /></div>
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">{communitySpotlight.author?.display_name || communitySpotlight.author?.handle || "Honda Enthusiast"}</span>
                {communitySpotlight.vehicle?.chassis_code && <span className="font-mono text-xs text-primary">{communitySpotlight.vehicle.chassis_code}</span>}
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{communitySpotlight.caption}</p>
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                <span>❤️ {communitySpotlight.like_count || 0} likes</span>
                <span>💬 {communitySpotlight.comment_count || 0} comments</span>
              </div>
            </div>
          </Link>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-secondary p-6 text-center">
        <Mail className="mx-auto h-8 w-8 text-primary" />
        <h2 className="mt-2 text-lg font-bold">Stay in the Loop</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Get notified about new listings, giveaways, events, and platform updates.</p>
        <div className="mx-auto mt-4 flex max-w-sm gap-2">
          <input type="email" placeholder="your@email.com" className="flex-1 rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary" />
          <button className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Subscribe</button>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 rounded-2xl border border-border bg-card px-4 py-3 text-center">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Verified sellers</span>
        <span className="text-border">•</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><TrendingUp className="h-3.5 w-3.5 text-primary" /> Swap & trade</span>
        <span className="text-border">•</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Flame className="h-3.5 w-3.5 text-primary" /> Community-driven</span>
        <span className="text-border">•</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Gift className="h-3.5 w-3.5 text-primary" /> Giveaways</span>
      </div>
    </div>
  );
}