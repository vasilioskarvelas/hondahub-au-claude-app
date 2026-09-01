import React from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, Store } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import ConnectShopifyCard from "@/components/store-import/ConnectShopifyCard";

/**
 * StoreImport — Phase 1 admin surface for Business Store Import (ADR-046).
 * The feature flag is admin-only: this page renders an access-restricted state
 * for non-admins (the frontend gate is supplemental; the backend + RLS are the
 * real boundary). The full catalogue dashboard replaces this placeholder in
 * Section 7.
 */
export default function StoreImport() {
  const { user } = useAuth();

  if (user?.role !== "admin") {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-destructive" />
        <h2 className="text-lg font-bold">Admin access required</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Business Store Import is an admin-only test feature (ADR-046 Phase 1).
        </p>
        <Link to="/" className="mt-4 inline-block text-sm text-primary hover:underline">
          Go back home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-20">
      <header className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/15 p-2">
          <Store className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight">Business Store Import</h1>
          <p className="text-sm text-muted-foreground">
            ADR-046 Phase 1 — admin test build. Scaffolding is in place.
          </p>
        </div>
      </header>

      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Phase 1 scaffolding (entities, feature flag, additive listing field) is
        live. Shopify/WooCommerce connectors (Sections 2–3), sync jobs (Section 4),
        AI extraction (Section 5), duplicate detection (Section 6), and the full
        catalogue dashboard (Section 7) are built in subsequent sections.
      </div>

      <ConnectShopifyCard />
    </div>
  );
}