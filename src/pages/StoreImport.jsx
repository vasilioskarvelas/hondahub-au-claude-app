import React from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, Store } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import ConnectShopifyCard from "@/components/store-import/ConnectShopifyCard";
import StoreConnectionsCard from "@/components/store-import/StoreConnectionsCard";
import ImportQueue from "@/components/store-import/ImportQueue";
import WebsiteScanCard from "@/components/store-import/WebsiteScanCard";

/**
 * StoreImport — Phase 1 admin surface for Business Store Import (ADR-046).
 * The feature flag is admin-only: this page renders an access-restricted state
 * for non-admins (the frontend gate is supplemental; the backend + RLS are the
 * real boundary).
 *
 * Flow: connect a store (OAuth ownership verification) → sync its catalogue into
 * staging → review each product and set Honda compatibility → approve, which
 * creates a DRAFT listing. Publication remains a separate, explicit act.
 */
export default function StoreImport() {
  const { user } = useAuth();
  const [selected, setSelected] = React.useState(null);
  const [queueKey, setQueueKey] = React.useState(0);

  // Sign-in is the only gate rendered here. Whether this user may actually manage
  // a store is decided server-side from their BusinessMembership — the backend is
  // the boundary, and the cards below surface what it returns. Rendering an
  // admin-only wall would now be wrong as well as unhelpful: business partners
  // manage their own imports.
  if (!user) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-destructive" />
        <h2 className="text-lg font-bold">Sign in required</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with the account linked to your business to manage store imports.
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
            Bring your product catalogue into the Honda Hub marketplace.
          </p>
        </div>
      </header>

      <WebsiteScanCard />

      <StoreConnectionsCard
        selectedId={selected?.id}
        onSelect={setSelected}
        onSyncFinished={() => setQueueKey((k) => k + 1)}
      />

      <ImportQueue key={`${selected?.id || "none"}-${queueKey}`} connection={selected} />

      <ConnectShopifyCard />
    </div>
  );
}
