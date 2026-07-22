import React from "react";
import { Link } from "react-router-dom";

export default function PartnerWall({ partners }) {
  if (!partners || partners.length === 0) return null;

  const logos = [...partners, ...partners];

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="h-5 w-1 rounded-full bg-primary" />
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Trusted Partners</h2>
        <Link to="/shop" className="ml-auto text-xs text-primary">View all →</Link>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card py-4">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-card to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-card to-transparent" />
        <div className="flex animate-[scroll_30s_linear_infinite] gap-6 px-4" style={{ width: "max-content" }}>
          {logos.map((p, i) => (
            <Link
              key={i}
              to="/shop"
              className="flex h-12 shrink-0 items-center gap-2 rounded-xl border border-border bg-secondary px-4 transition hover:border-primary/50"
            >
              {p.logo_url ? (
                <img src={p.logo_url} alt={p.company_name} className="h-7 w-7 rounded object-cover" />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/15 text-xs font-black text-primary">
                  {p.company_name.charAt(0)}
                </div>
              )}
              <span className="whitespace-nowrap text-xs font-bold">{p.company_name}</span>
              {p.discount_percent && (
                <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                  {p.discount_percent}% OFF
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}