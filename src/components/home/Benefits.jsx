import React from "react";
import { Link } from "react-router-dom";
import { ShoppingCart, Wrench, Users, Gift, CalendarDays, Percent } from "lucide-react";

const benefits = [
  { icon: ShoppingCart, title: "Marketplace", desc: "Buy & sell Honda builds and parts", to: "/marketplace", color: "from-primary/20 to-transparent" },
  { icon: Wrench, title: "Garage", desc: "Showcase your build with full specs", to: "/garage", color: "from-primary/20 to-transparent" },
  { icon: Users, title: "Social Feed", desc: "Share posts, photos & reels", to: "/feed", color: "from-primary/20 to-transparent" },
  { icon: Percent, title: "Workshop Discounts", desc: "Exclusive partner savings", to: "/shop", color: "from-primary/20 to-transparent" },
  { icon: Gift, title: "Monthly Giveaways", desc: "Win parts, mods & accessories", to: "/giveaway", color: "from-primary/20 to-transparent" },
  { icon: CalendarDays, title: "Events", desc: "Meets, cruises & track days", to: "/events", color: "from-primary/20 to-transparent" },
];

export default function Benefits() {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="h-5 w-1 rounded-full bg-primary" />
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Everything HondaHub</h2>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {benefits.map((b) => {
          const Icon = b.icon;
          return (
            <Link
              key={b.title}
              to={b.to}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 transition hover:border-primary/50"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${b.color} opacity-0 transition group-hover:opacity-100`} />
              <div className="relative">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 transition group-hover:scale-110">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mt-2.5 text-sm font-bold">{b.title}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{b.desc}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}