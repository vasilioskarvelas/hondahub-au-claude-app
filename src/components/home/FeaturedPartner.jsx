import React from "react";
import { Link } from "react-router-dom";
import { Crown, Percent, ArrowRight } from "lucide-react";

/**
 * FeaturedPartner — a highlighted partner-shop banner for the home page.
 * Shows the partner logo, discount badge, and a CTA to the Shop where members
 * can reveal the exclusive discount code.
 */
export default function FeaturedPartner({ partner }) {
  if (!partner) return null;
  return (
    <section className="overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card">
      <div className="flex flex-col items-center gap-4 p-5 sm:flex-row sm:p-6">
        {partner.logo_url ? (
          <img src={partner.logo_url} alt={partner.company_name} className="h-20 w-20 shrink-0 rounded-2xl object-cover ring-1 ring-border" />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-secondary text-2xl font-black">
            {partner.company_name?.charAt(0)}
          </div>
        )}
        <div className="flex-1 text-center sm:text-left">
          <div className="flex items-center justify-center gap-2 sm:justify-start">
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Featured Partner</span>
            {partner.discount_percent != null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                <Percent className="h-3 w-3" /> {partner.discount_percent}% off
              </span>
            )}
          </div>
          <h2 className="mt-1.5 text-lg font-black">{partner.company_name}</h2>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{partner.description}</p>
        </div>
        <Link
          to="/shop"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground active:scale-[0.98]"
        >
          <Crown className="h-4 w-4" /> Unlock Discount <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}