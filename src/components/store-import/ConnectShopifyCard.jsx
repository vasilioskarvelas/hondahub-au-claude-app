import React from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Store, ExternalLink, AlertCircle } from "lucide-react";

/**
 * ConnectShopifyCard — minimal admin-only trigger for the Shopify connector
 * (ADR-046 Phase 1, Section 2). Calls store-connector.connectStore and either
 * redirects the browser to Shopify's OAuth authorize URL, or reports that
 * Shopify credentials are not yet configured. The full catalogue dashboard
 * replaces this minimal card in Section 7.
 */
export default function ConnectShopifyCard() {
  const [businesses, setBusinesses] = React.useState([]);
  const [businessId, setBusinessId] = React.useState("");
  const [storeDomain, setStoreDomain] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [needsCredentials, setNeedsCredentials] = React.useState(false);

  React.useEffect(() => {
    base44.entities.Business.list()
      .then((b) => setBusinesses(Array.isArray(b) ? b : []))
      .catch(() => setBusinesses([]));
  }, []);

  const connect = async () => {
    if (busy) return;
    setError(null);
    setNeedsCredentials(false);
    if (!businessId) return setError("Select a business.");
    if (!storeDomain.trim()) return setError("Enter your *.myshopify.com domain.");
    setBusy(true);
    try {
      const res = await base44.functions.invoke("store-connector", {
        action: "connectStore",
        business_id: businessId,
        platform: "shopify",
        store_domain: storeDomain.trim(),
      });
      const data = res?.data || res;
      if (!data?.ok) {
        const det = data?.error?.details;
        const msg = (det && (det.store_domain || det.platform || det.business_id)) || data?.error || "Connection failed.";
        throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
      }
      if (data.authorize_url) {
        window.location.href = data.authorize_url;
      } else {
        setNeedsCredentials(true);
      }
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Store className="h-5 w-5 text-primary" />
        <h2 className="text-base font-bold">Connect a Shopify Store</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Verify ownership via Shopify OAuth. Admin-only (ADR-046 Phase 1).
      </p>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Business</label>
          <select
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Select a business…</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>{b.name || b.business_name || b.id}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Shopify domain</label>
          <input
            value={storeDomain}
            onChange={(e) => setStoreDomain(e.target.value)}
            placeholder="your-store.myshopify.com"
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>
      {error && (
        <div className="flex items-start gap-2 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {needsCredentials && (
        <div className="flex items-start gap-2 text-xs text-amber-500">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Connection created, but Shopify credentials are not configured. Set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET to enable the OAuth flow.</span>
        </div>
      )}
      <button
        onClick={connect}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
        Connect &amp; verify
      </button>
    </div>
  );
}