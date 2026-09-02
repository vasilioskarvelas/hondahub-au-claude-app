import React from "react";
import { base44 } from "@/api/base44Client";
import { invokeFn } from "@/lib/invokeFn";
import { Loader2, RefreshCw, Unlink, AlertCircle, CheckCircle2, Store, Ban } from "lucide-react";

/**
 * StoreConnectionsCard — admin list of BusinessStoreConnections with sync
 * controls (ADR-046 Phase 1, Section 7).
 *
 * Sync is paginated across invocations on the backend, so "Sync now" issues
 * startSync and then repeats continueSync while has_more is true, surfacing
 * progress between pages. The loop is bounded by MAX_PAGES so a backend that
 * kept returning has_more can never spin the browser forever.
 *
 * Selecting a connection drives the import queue below it.
 */

// High enough to finish a large catalogue in one run (a 5,000-product store is
// ~50 pages). This is a runaway guard against a backend that keeps returning
// has_more, not a product limit — and hitting it is reported, never silent.
const MAX_PAGES = 500;

const STATUS_STYLES = {
  verified: "text-emerald-500 border-emerald-500/30",
  unverified: "text-amber-500 border-amber-500/30",
  disconnected: "text-muted-foreground border-border",
};

const SYNC_STYLES = {
  syncing: "text-sky-500 border-sky-500/30",
  completed: "text-emerald-500 border-emerald-500/30",
  failed: "text-destructive border-destructive/30",
  cancelled: "text-amber-500 border-amber-500/30",
  paused: "text-amber-500 border-amber-500/30",
  idle: "text-muted-foreground border-border",
};

function Badge({ children, className = "" }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${className}`}>
      {children}
    </span>
  );
}

export default function StoreConnectionsCard({ selectedId, onSelect, onSyncFinished }) {
  const [connections, setConnections] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState(null);
  const [progress, setProgress] = React.useState(null);
  const [error, setError] = React.useState(null);

  // Throws with the backend's own explanation rather than "Request failed with
  // status code 502", which is all the raw SDK surfaces on a non-2xx.
  const call = React.useCallback(async (payload) => {
    const r = await invokeFn("store-import", payload);
    if (!r.ok) throw new Error(r.error || "Something went wrong.");
    return r.data;
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    const r = await invokeFn("store-connector", { action: "listConnections" });
    if (r.ok) setConnections(Array.isArray(r.data?.connections) ? r.data.connections : []);
    else setError(r.error);
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const sync = async (conn) => {
    if (busyId) return;
    setBusyId(conn.id);
    setError(null);
    setProgress({ staged: 0, failed: 0, page: 0 });
    try {
      let data = await call({ action: "startSync", connection_id: conn.id });
      let staged = data.staged || 0;
      let failed = data.failed || 0;
      let page = 1;
      setProgress({ staged, failed, page });

      while (data.has_more && page < MAX_PAGES) {
        data = await call({ action: "continueSync", connection_id: conn.id, run_id: data.run_id });
        if (data.cancelled) break;
        staged += data.staged || 0;
        failed += data.failed || 0;
        page += 1;
        setProgress({ staged, failed, page });
      }
      if (data.has_more && page >= MAX_PAGES) {
        setError(`Stopped after ${MAX_PAGES} pages — the store has more products than one run will import. Run sync again to continue.`);
      }
      await load();
      onSyncFinished?.();
    } catch (e) {
      setError(String(e?.message || e));
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async (conn) => {
    try {
      await call({ action: "cancelSync", connection_id: conn.id });
      await load();
    } catch (e) {
      setError(String(e?.message || e));
    }
  };

  const disconnect = async (conn) => {
    if (busyId) return;
    setBusyId(conn.id);
    try {
      await base44.functions.invoke("store-connector", { action: "disconnectStore", connection_id: conn.id });
      await load();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Store className="h-5 w-5 text-primary" />
          <h2 className="text-base font-bold">Connected Stores</h2>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && connections.length === 0 && (
        <p className="text-sm text-muted-foreground">Loading connections…</p>
      )}

      {!loading && connections.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No stores connected yet. Use the form below to connect one.
        </p>
      )}

      <div className="space-y-2">
        {connections.map((c) => {
          const isSelected = c.id === selectedId;
          const isBusy = busyId === c.id;
          const canSync = c.connection_status === "verified";
          return (
            <div
              key={c.id}
              onClick={() => onSelect?.(c)}
              className={`cursor-pointer rounded-xl border p-3 transition-colors ${
                isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold">{c.store_name || c.store_domain}</span>
                    <Badge className={STATUS_STYLES[c.connection_status] || STATUS_STYLES.disconnected}>
                      {c.connection_status}
                    </Badge>
                    <Badge className={SYNC_STYLES[c.sync_status] || SYNC_STYLES.idle}>
                      sync: {c.sync_status}
                    </Badge>
                    <Badge className="border-border text-muted-foreground">{c.platform}</Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{c.store_domain}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {c.sync_processed || 0} processed
                    {c.sync_failed ? ` · ${c.sync_failed} failed` : ""}
                    {c.last_sync_finished_at ? ` · last run ${new Date(c.last_sync_finished_at).toLocaleString("en-AU")}` : ""}
                  </p>
                  {c.last_error && (
                    <p className="mt-0.5 text-xs text-destructive">{c.last_error}</p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                  {canSync && c.sync_status !== "syncing" && (
                    <button
                      onClick={() => sync(c)}
                      disabled={!!busyId}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground disabled:opacity-50"
                    >
                      {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Sync now
                    </button>
                  )}
                  {c.sync_status === "syncing" && (
                    <button
                      onClick={() => cancel(c)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-2.5 py-1 text-xs font-medium text-amber-500"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      Cancel
                    </button>
                  )}
                  {c.connection_status !== "disconnected" && (
                    <button
                      onClick={() => disconnect(c)}
                      disabled={!!busyId}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
                    >
                      <Unlink className="h-3.5 w-3.5" />
                      Disconnect
                    </button>
                  )}
                </div>
              </div>

              {isBusy && progress && (
                <div className="mt-2 flex items-center gap-2 text-xs text-sky-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Page {progress.page} · {progress.staged} staged
                  {progress.failed ? ` · ${progress.failed} failed` : ""}
                </div>
              )}

              {!canSync && c.connection_status === "unverified" && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-500">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Ownership not verified — complete the Shopify OAuth flow before syncing.
                </p>
              )}
              {isSelected && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-primary">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Showing this store's import queue below.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
