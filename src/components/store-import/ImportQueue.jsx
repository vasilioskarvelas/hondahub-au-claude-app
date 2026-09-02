import React from "react";
import { invokeFn } from "@/lib/invokeFn";
import { Loader2, RefreshCw, Check, X, AlertCircle, Copy, PackageSearch, ExternalLink, Sparkles, Rocket } from "lucide-react";

/**
 * ImportQueue — review, correct and resolve staged StoreImportItems
 * (ADR-046 Phase 1, Section 7).
 *
 * "Suggest fitment" asks the model which Hondas each product fits and fills the
 * ADR-043 arrays. That is a SUGGESTION: it can move an item from needs_attention
 * to ready_for_approval, never to approved. The reviewer confirms or corrects
 * every product, and anything they change is recorded as business_edited
 * provenance. Fitment is the kind of claim that hurts a buyer when it is wrong,
 * so a person stays in the loop by design.
 *
 * Approving creates a DRAFT MarketplaceListing. It does not publish.
 */

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "needs_attention", label: "Needs attention" },
  { value: "possible_duplicate", label: "Duplicates" },
  { value: "ready_for_approval", label: "Ready" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const STATUS_STYLES = {
  needs_attention: "text-amber-500 border-amber-500/30",
  possible_duplicate: "text-orange-500 border-orange-500/30",
  ready_for_approval: "text-emerald-500 border-emerald-500/30",
  approved: "text-emerald-500 border-emerald-500/30",
  rejected: "text-muted-foreground border-border",
  failed: "text-destructive border-destructive/30",
  pending: "text-muted-foreground border-border",
  extracting: "text-sky-500 border-sky-500/30",
};

const CATEGORIES = [
  "engine", "transmission", "forced_induction", "wheels_tyres", "suspension",
  "brakes", "electronics", "interior", "exterior", "performance_part",
  "tools_equipment", "other",
];
const CONDITIONS = ["new", "used", "for_parts_or_repair"];
// ADR-042 requires this on 8 of the 12 categories, so an import cannot be
// approved without it. AI suggests a value; the reviewer confirms.
const OEM_OPTIONS = ["", "aftermarket", "oem", "not_applicable"];
const MODELS = ["civic", "integra", "accord", "crv", "s2000", "nsx", "other"];
const CHASSIS = ["eg", "ek", "dc2", "dc5", "ep3", "fn2", "cl7", "cl9", "fd2", "fk8", "fl5", "other"];
const ENGINES = ["d_series", "b_series", "k_series", "j_series", "f_series", "h_series", "other"];

const money = (cents) =>
  cents === null || cents === undefined ? "—" : `$${(cents / 100).toFixed(2)}`;

function Chips({ options, selected, onToggle }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              on ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

function ItemRow({ item, onResolved }) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [form, setForm] = React.useState({
    category: item.category || "other",
    condition: item.condition || "new",
    price_cents: item.price_cents ?? "",
    compatible_models: item.compatible_models || [],
    compatible_chassis_codes: item.compatible_chassis_codes || [],
    compatible_engine_families: item.compatible_engine_families || [],
    compatible_year_from: item.compatible_year_from ?? "",
    compatible_year_to: item.compatible_year_to ?? "",
    oem_or_aftermarket: item.oem_or_aftermarket ?? "",
  });

  const resolved = item.status === "approved" || item.status === "rejected";

  const toggle = (field, value) =>
    setForm((f) => ({
      ...f,
      [field]: f[field].includes(value) ? f[field].filter((v) => v !== value) : [...f[field], value],
    }));

  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      const overrides = {
        category: form.category,
        condition: form.condition,
        compatible_models: form.compatible_models,
        compatible_chassis_codes: form.compatible_chassis_codes,
        compatible_engine_families: form.compatible_engine_families,
      };
      if (form.price_cents !== "") overrides.price_cents = Number(form.price_cents);
      if (form.compatible_year_from !== "") overrides.compatible_year_from = Number(form.compatible_year_from);
      if (form.compatible_year_to !== "") overrides.compatible_year_to = Number(form.compatible_year_to);
      if (form.oem_or_aftermarket !== "") overrides.oem_or_aftermarket = form.oem_or_aftermarket;
      const r = await invokeFn("store-import", { action: "approveItem", item_id: item.id, overrides });
      if (!r.ok) throw new Error(r.error || "Approval failed.");
      onResolved?.();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    setBusy(true);
    setError(null);
    try {
      const reason = window.prompt("Reason for rejecting this product? (optional)") ?? "";
      const r = await invokeFn("store-import", { action: "rejectItem", item_id: item.id, reason });
      if (!r.ok) throw new Error(r.error || "Rejection failed.");
      onResolved?.();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-start gap-3">
        {item.photo_urls?.[0] ? (
          <img
            src={item.photo_urls[0]}
            alt=""
            className="h-14 w-14 shrink-0 rounded-lg object-cover"
            onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted">
            <PackageSearch className="h-5 w-5 text-muted-foreground" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold">{item.title}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[item.status] || STATUS_STYLES.pending}`}>
              {item.status?.replace(/_/g, " ")}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {money(item.price_cents)}
            {item.sku ? ` · SKU ${item.sku}` : ""}
            {item.brand ? ` · ${item.brand}` : ""}
          </p>
          {item.status === "possible_duplicate" && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-orange-500">
              <Copy className="h-3.5 w-3.5" />
              Possible duplicate — matched on {item.duplicate_match_method?.replace(/_/g, " ")}
            </p>
          )}
          {item.honda_compatibility_status && item.honda_compatibility_status !== "unknown" && (
            <p className="mt-1 text-xs text-sky-500">
              Suggested fit: {item.honda_compatibility_status.replace(/_/g, " ")}
              {item.compatibility_confidence_score != null ? ` (${item.compatibility_confidence_score}% confidence)` : ""}
              {item.compatible_models?.length ? ` · ${item.compatible_models.join(", ")}` : ""}
            </p>
          )}
          {item.sync_error && (
            <p className="mt-1 text-xs text-destructive">{item.sync_error}</p>
          )}
          {item.approved_listing_id && (
            <a
              href={`/marketplace/`}
              className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-500 hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> View listing
            </a>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-1.5">
          {!resolved && (
            <button
              onClick={() => setOpen((o) => !o)}
              className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {open ? "Close" : "Review"}
            </button>
          )}
          {item.external_url && (
            <a
              href={item.external_url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
              Source
            </a>
          )}
        </div>
      </div>

      {open && !resolved && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            Compatibility is not auto-detected. Set what this part actually fits before approving —
            anything you change here is recorded as business-edited.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Condition</label>
              <select
                value={form.condition}
                onChange={(e) => setForm({ ...form, condition: e.target.value })}
                className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
              >
                {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Price (cents)</label>
              <input
                value={form.price_cents}
                onChange={(e) => setForm({ ...form, price_cents: e.target.value.replace(/[^0-9]/g, "") })}
                placeholder="required"
                className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">OEM or aftermarket</label>
            <select
              value={form.oem_or_aftermarket}
              onChange={(e) => setForm({ ...form, oem_or_aftermarket: e.target.value })}
              className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
            >
              {OEM_OPTIONS.map((o) => (
                <option key={o || "unset"} value={o}>{o ? o.replace(/_/g, " ") : "— choose —"}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Required for most part categories. Genuine Honda is <em>oem</em>; brands like
              AEM or Skunk2 are <em>aftermarket</em>; fluids and tools are <em>not applicable</em>.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Fits models</label>
            <div className="mt-1"><Chips options={MODELS} selected={form.compatible_models} onToggle={(v) => toggle("compatible_models", v)} /></div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Chassis codes</label>
            <div className="mt-1"><Chips options={CHASSIS} selected={form.compatible_chassis_codes} onToggle={(v) => toggle("compatible_chassis_codes", v)} /></div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Engine families</label>
            <div className="mt-1"><Chips options={ENGINES} selected={form.compatible_engine_families} onToggle={(v) => toggle("compatible_engine_families", v)} /></div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Year from</label>
              <input
                value={form.compatible_year_from}
                onChange={(e) => setForm({ ...form, compatible_year_from: e.target.value.replace(/[^0-9]/g, "").slice(0, 4) })}
                placeholder="e.g. 2001"
                className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Year to</label>
              <input
                value={form.compatible_year_to}
                onChange={(e) => setForm({ ...form, compatible_year_to: e.target.value.replace(/[^0-9]/g, "").slice(0, 4) })}
                placeholder="e.g. 2005"
                className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={approve}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Approve → draft listing
            </button>
            <button
              onClick={reject}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-destructive disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ImportQueue({ connection }) {
  const [items, setItems] = React.useState([]);
  const [status, setStatus] = React.useState("needs_attention");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [extracting, setExtracting] = React.useState(false);
  const [extractProgress, setExtractProgress] = React.useState(null);
  const [approving, setApproving] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [publishResult, setPublishResult] = React.useState(null);
  const [approveResult, setApproveResult] = React.useState(null);
  const [readyCount, setReadyCount] = React.useState(0);

  const load = React.useCallback(async () => {
    if (!connection?.id) { setItems([]); return; }
    setLoading(true);
    setError(null);
    try {
      const r = await invokeFn("store-import", {
        action: "listImportItems",
        connection_id: connection.id,
        ...(status ? { status } : {}),
        limit: 100,
      });
      if (!r.ok) throw new Error(r.error || "Could not load items.");
      setItems(Array.isArray(r.data.items) ? r.data.items : []);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [connection?.id, status]);

  React.useEffect(() => { load(); }, [load]);

  // Publishing is the step that actually puts products in front of buyers, so it
  // is separate from approving and never implied by it.
  const publishAll = async () => {
    if (publishing) return;
    setPublishing(true);
    setPublishResult(null);
    setError(null);
    try {
      let published = 0, pending = 0, failed = 0, rounds = 0;
      let more = true;
      while (more && rounds < 200) {
        const r = await invokeFn("store-import", { action: "publishApproved", connection_id: connection.id });
        if (!r.ok) throw new Error(r.error || "Could not publish.");
        published += r.data.published || 0;
        pending += r.data.pending_review || 0;
        failed += r.data.failed || 0;
        more = !!r.data.has_more && ((r.data.published || 0) + (r.data.pending_review || 0)) > 0;
        rounds += 1;
        setPublishResult({ published, pending, failed });
      }
      await load();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setPublishing(false);
    }
  };

  // Bulk approve, looping the server batches. Only items already marked ready
  // are touched — see the backend note on why this is not "approve everything".
  const approveAllReady = async () => {
    if (approving) return;
    setApproving(true);
    setApproveResult(null);
    setError(null);
    try {
      let approved = 0, failed = 0, rounds = 0;
      let more = true;
      while (more && rounds < 200) {
        const r = await invokeFn("store-import", { action: "approveReady", connection_id: connection.id });
        if (!r.ok) throw new Error(r.error || "Could not approve.");
        approved += r.data.approved || 0;
        failed += r.data.failed || 0;
        more = !!r.data.has_more && (r.data.approved || 0) > 0;
        rounds += 1;
        setApproveResult({ approved, failed });
      }
      await load();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setApproving(false);
    }
  };

  // Extraction runs in server-side batches (one LLM call per product), so the
  // client loops until nothing is left. Bounded so a bad has_more cannot spin.
  const runExtraction = async () => {
    if (extracting) return;
    setExtracting(true);
    setExtractProgress(null);
    try {
      let updated = 0, skipped = 0, rounds = 0;
      let more = true;
      while (more && rounds < 100) {
        const r = await invokeFn("store-import", {
          action: "extractCompatibility", connection_id: connection.id,
        });
        if (!r.ok) throw new Error(r.error || "Could not suggest fitment.");
        updated += r.data.updated || 0;
        skipped += r.data.skipped || 0;
        more = !!r.data.has_more;
        rounds += 1;
        setExtractProgress({ updated, skipped, remaining: r.data.remaining || 0 });
      }
      await load();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setExtracting(false);
    }
  };

  if (!connection) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
        Select a connected store above to review its import queue.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PackageSearch className="h-5 w-5 text-primary" />
          <h2 className="text-base font-bold">Import Queue</h2>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        {connection.store_name || connection.store_domain} · approving creates a{" "}
        <strong>draft</strong> listing, which still has to be published separately.
      </p>

      <div className="rounded-xl border border-border bg-background/50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold">Suggest Honda fitment</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Reads each product and suggests which Hondas it fits, so you confirm
              rather than fill in every field. Suggestions only — you still approve
              each product.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={runExtraction}
              disabled={extracting || approving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {extracting ? "Working…" : "Suggest fitment"}
            </button>
            <button
              onClick={approveAllReady}
              disabled={approving || extracting}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs font-bold text-emerald-500 disabled:opacity-50"
            >
              {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {approving ? "Approving…" : "Approve all ready"}
            </button>
            <button
              onClick={publishAll}
              disabled={publishing || approving || extracting}
              className="inline-flex items-center gap-2 rounded-lg border border-sky-500/40 px-3 py-1.5 text-xs font-bold text-sky-500 disabled:opacity-50"
            >
              {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
              {publishing ? "Publishing…" : "Publish approved"}
            </button>
          </div>
        </div>

        <p className="mt-2 text-[11px] text-muted-foreground">
          Approving creates <strong>drafts</strong>, which stay invisible on the storefront.
          <strong> Publish approved</strong> is what puts them in front of buyers.
        </p>

        {publishResult && (
          <div className="mt-1 text-xs">
            <span className="text-sky-500">{publishResult.published} now live</span>
            {publishResult.pending > 0 && (
              <span className="text-amber-500"> · {publishResult.pending} sent to review</span>
            )}
            {publishResult.failed > 0 && (
              <span className="text-destructive"> · {publishResult.failed} failed</span>
            )}
            {publishResult.published === 0 && publishResult.pending === 0 && publishResult.failed === 0 && (
              <span className="text-muted-foreground"> — no approved drafts waiting.</span>
            )}
          </div>
        )}

        {approveResult && (
          <div className="mt-2 text-xs">
            <span className="text-emerald-500">{approveResult.approved} approved as drafts</span>
            {approveResult.failed > 0 && (
              <span className="text-amber-500"> · {approveResult.failed} sent back for a look</span>
            )}
            {approveResult.approved === 0 && approveResult.failed === 0 && (
              <span className="text-muted-foreground">
                Nothing was ready. Only products marked <strong>ready</strong> are bulk-approved —
                anything needing attention or flagged as a duplicate still wants your eyes.
              </span>
            )}
          </div>
        )}
        {extractProgress && (
          <p className="mt-2 text-xs text-sky-500">
            {extractProgress.updated} updated
            {extractProgress.skipped ? ` · ${extractProgress.skipped} unclear` : ""}
            {extractProgress.remaining ? ` · ${extractProgress.remaining} to go` : " · done"}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              status === f.value ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && items.length === 0 && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!loading && items.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">
          Nothing here. Run a sync on the store above, or change the filter.
        </p>
      )}

      <div className="space-y-2">
        {items.map((item) => (
          <ItemRow key={item.id} item={item} onResolved={load} />
        ))}
      </div>
    </div>
  );
}
