import React from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Search, Zap, Upload, AlertCircle, Clock } from "lucide-react";

/**
 * WebsiteScanCard — the onboarding step for a business partner.
 *
 * They paste their website; we fingerprint it and tell them the fastest import
 * route their platform supports, instead of asking them to know what their site
 * runs on.
 *
 * The card is deliberately honest about three outcomes rather than only the
 * happy one: available now, recognised but not built yet, and unreachable.
 * Presenting a route we cannot actually run would waste the partner's time.
 */

const EFFORT_STYLES = {
  automatic: { icon: Zap, className: "text-emerald-500", ring: "border-emerald-500/30 bg-emerald-500/5" },
  manual: { icon: Upload, className: "text-amber-500", ring: "border-amber-500/30 bg-amber-500/5" },
};

export default function WebsiteScanCard({ defaultWebsite = "" }) {
  const [website, setWebsite] = React.useState(defaultWebsite);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState(null);

  const scan = async () => {
    if (busy || !website.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await base44.functions.invoke("store-import", {
        action: "detectPlatform",
        website: website.trim(),
      });
      const data = res?.data || res;
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

  const effort = result?.effort ? EFFORT_STYLES[result.effort] : null;
  const EffortIcon = effort?.icon || Search;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Search className="h-5 w-5 text-primary" />
        <h2 className="text-base font-bold">Scan your website</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Enter your store's web address and we'll work out the quickest way to bring
        your products across.
      </p>

      <div className="flex gap-2">
        <input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") scan(); }}
          placeholder="yourstore.com.au"
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={scan}
          disabled={busy || !website.trim()}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Scan
        </button>
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

      {result && result.reachable && (
        <div className={`rounded-xl border p-4 ${effort?.ring || "border-border"}`}>
          <div className="flex items-center gap-2">
            <EffortIcon className={`h-4 w-4 ${effort?.className || "text-muted-foreground"}`} />
            <span className={`text-sm font-bold ${effort?.className || ""}`}>{result.headline}</span>
          </div>

          <p className="mt-1.5 text-xs text-muted-foreground">{result.detail}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
              detected: {result.platform}
            </span>
            {result.confidence > 0 && (
              <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
                confidence {result.confidence}%
              </span>
            )}
            {result.signals?.length > 0 && (
              <span className="text-muted-foreground">via {result.signals.join(", ")}</span>
            )}
          </div>

          {result.coming_soon && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-background/60 p-2.5 text-xs text-amber-500">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                We recognise {result.coming_soon} and it's on the roadmap, but the
                importer isn't built yet. Use a spreadsheet upload for now.
              </span>
            </div>
          )}

          {!result.available_now && !result.coming_soon && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-background/60 p-2.5 text-xs text-muted-foreground">
              <Upload className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                We couldn't identify a supported store platform, so there's no
                automatic route for this site yet.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
