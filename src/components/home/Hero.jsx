import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Trophy, ShoppingCart, Wrench, Users } from "lucide-react";

export default function Hero({ stats }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-background" />
      <div className="absolute inset-0 carbon-bg opacity-30" />
      <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />

      <div className="relative flex flex-col items-center px-6 py-10 text-center sm:py-14">
        <span className="rounded-full bg-primary/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary backdrop-blur">
          Australia's Honda Community
        </span>

        <h1 className="mt-4 text-4xl font-black leading-none tracking-tighter sm:text-6xl">
          BUILT BY<span className="mx-2 inline-block rounded-lg bg-primary px-3 py-0.5 text-primary-foreground glow-red">ENTHUSIASTS</span>
        </h1>
        <p className="mt-1 text-2xl font-black tracking-tight text-muted-foreground sm:text-3xl">
          FOR ENTHUSIASTS
        </p>

        <p className="mt-4 max-w-lg text-sm text-muted-foreground sm:text-base">
          Buy and sell builds, showcase your garage, unlock workshop discounts, and win monthly parts giveaways — all in one place.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link to="/market" className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground glow-red transition hover:scale-105">
            Browse Marketplace <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/giveaway" className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-6 py-3 text-sm font-bold backdrop-blur transition hover:border-primary/50">
            <Trophy className="h-4 w-4 text-primary" /> Enter Giveaway
          </Link>
        </div>

        {stats && (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 sm:gap-x-10">
            <Stat icon={ShoppingCart} value={stats.total} label="Listings" />
            <Divider />
            <Stat icon={Wrench} value={stats.garageCars} label="Garage Builds" />
            <Divider />
            <Stat icon={Users} value={stats.members} label="Members" />
            <Divider />
            <Stat icon={Trophy} value={`$${stats.prizeValue}`} label="In Prizes" />
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({ icon: Icon, value, label }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" />
      <div className="text-left">
        <div className="text-lg font-black leading-none">{value}</div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function Divider() {
  return <span className="hidden h-8 w-px bg-border sm:block" />;
}