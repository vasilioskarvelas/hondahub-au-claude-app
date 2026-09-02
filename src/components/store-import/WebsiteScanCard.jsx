import React from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Search, Zap, Globe, AlertCircle, CheckCircle2, Clock, Upload } from "lucide-react";

/**
 * WebsiteScanCard — the primary onboarding surface for a business.
 *
 * Paste a website, and that is the whole job: we fingerprint the site, pick the
 * best route, and create a connection that is ready to import. No API key, no
 * OAuth, no spreadsheet for the common cases.
 *
 * Shopify is the one exception — its Admin API needs OAuth, so a detected
 * Shopify store is handed to that flow instead of connected here.
 *
 * The card stays honest about which route it landed on: reading a WooCommerce
 * feed and crawling a bespoke site page by page are both automatic, but they are
 * not equally exact, and the slower one says so.
 */

const EFFORT = {
  automatic: { icon: Zap, tone: "text-emerald-500", ring: "border-emerald-500/30 bg-emerald-500/5" },
  automatic_slow: { icon: Globe, tone: "text-sky-500", ring: "border-sky-500/30 bg-sky-500/5" },
  manual: { icon: Upload, tone: "text-amber-500", ring: "border-amber-500/30 bg-amber-500/5" },
};

export default function WebsiteScanCard({ onConnected }) {
  const [businesses, setBusinesses] = React.useState([]);
  const [businessId, setBusinessId] = React.useState("");
  const [website, setWebsite] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [connected, setConnected] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    base44.entities.Business.list()
      .then((b) => setBusinesses(Array.isArray(b) ? b : []))
      .catch(() => setBusinesses([]));
  }, []);

  const call = async (payload) => {
    const res = await base44.functions.invoke("store-import", payload);
    return res?.data || res;
  };

  const scan = async () => {
    if (busy || !website.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setConnected(null);
    try {
      const data = await call({ action: "detectPlatform", website: website.trim() });
      if (!data?.ok) {
        const d = data?.details || data?.error?.details;
        throw new Error(d?.website || data?.error?.message || data?.error || "Could not scan that address.");
      }
      setResult(data);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    if (!businessId) return setError("Choose which business this store belongs to.");
    setBusy(true);
    setError(null);
    try {
      const data = await call({ action: "connectWebsite", business_id: businessId, website: website.trim() });
      if (!data?.ok) {
        const d = data?.details || data?.error?.details;
        throw new Error(d?.website || d?.message || data?.error?.message || data?.error || "Could not connect that store.");
      }
      setConnected(data);
      if (!data.requires_oauth) onConnected?.();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const style = result?.effort ? EFFORT[result.effort] : null;
  const Icon = style?.icon || Search;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Globe className="h-5 w-5 text-primary" />
        <h2 className="text-base font-bold">Import from your website</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Enter your store's address. We'll work out how to read it and bring your
        products across — photos, descriptions and prices included.
      </p>

      <div>
        <label className="text-xs font-medium text-muted-foreground">Business</label>
        <select
          value={businessId}
          onChange={(e) => setBusinessId(e.target.value)}
          className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Select a business…</option>
          {businesses.map((b) => <option key={b.id} value={b.id}>{b.name || b.id}</option>)}
        </select>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">Website</label>
        <div className="mt-1 flex gap-2">
          <input
            value={website}
            onChange={(e) => { setWebsite(e.target.value); setResult(null); setConnected(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") scan(); }}
            placeholder="yourstore.com.au"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={scan}
            disabled={busy || !website.trim()}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {busy && !connected ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Scan
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && result.reachable === false && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-500">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{result.message}</span>
        </div>
      )}

      {result && result.reachable && !connected && (
        <div className={`rounded-xl border p-4 ${style?.ring || "border-border"}`}>
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${style?.tone || "text-muted-foreground"}`} />
            <span className={`text-sm font-bold ${style?.tone || ""}`}>{result.headline}</span>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{result.detail}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="rounded-full border border-border px-2 py-0.5">detected: {result.platform}</span>
            {result.confidence > 0 && (
              <span className="rounded-full border border-border px-2 py-0.5">confidence {result.confidence}%</span>
            )}
          </div>

          {result.coming_soon ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-background/60 p-2.5 text-xs text-amber-500">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>We recognise {result.coming_soon} but that importer isn't ready yet. Upload a spreadsheet for now.</span>
            </div>
          ) : (
            <button
              onClick={connect}
              disabled={busy || !businessId}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Connect this store
            </button>
          )}
        </div>
      )}

      {connected && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-500">
            <CheckCircle2 className="h-4 w-4" />
            {connected.requires_oauth ? "Shopify store detected" : "Store connected"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{connected.message}</p>
          {!connected.requires_oauth && (
            <p className="mt-2 text-xs text-muted-foreground">
              Hit <strong>Sync now</strong> on the store below to pull your products in. Nothing
              goes live until you approve it.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
