import React from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";

/**
 * CsvUploadCard — the universal import route.
 *
 * Works whatever the business's website runs on: they export a spreadsheet and
 * upload it. The file is read in the browser and its text posted to the backend,
 * so no file-storage plumbing is involved.
 *
 * Deliberately two-step. The preview is a dry run that stages nothing, showing
 * which columns were understood and which were ignored, so a business finds out
 * their price column was named something unexpected BEFORE importing hundreds of
 * priceless products.
 */

const MAX_BYTES = 2_000_000;

export default function CsvUploadCard({ onImported }) {
  const [businesses, setBusinesses] = React.useState([]);
  const [businessId, setBusinessId] = React.useState("");
  const [fileName, setFileName] = React.useState("");
  const [csvText, setCsvText] = React.useState("");
  const [preview, setPreview] = React.useState(null);
  const [result, setResult] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    base44.entities.Business.list()
      .then((b) => setBusinesses(Array.isArray(b) ? b : []))
      .catch(() => setBusinesses([]));
  }, []);

  const call = async (payload) => {
    const res = await base44.functions.invoke("store-import", payload);
    return res?.data || res;
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPreview(null);
    setResult(null);
    if (file.size > MAX_BYTES) {
      setError(`That file is ${(file.size / 1_000_000).toFixed(1)} MB. The limit is 2 MB — try splitting it.`);
      return;
    }
    setFileName(file.name);
    setBusy(true);
    try {
      const text = await file.text();
      setCsvText(text);
      const data = await call({ action: "previewCsv", csv: text });
      if (!data?.ok) throw new Error(data?.error?.message || data?.error || "Could not read that file.");
      if (data.ok === true && data.error) throw new Error(data.error);
      setPreview(data);
    } catch (e2) {
      setError(String(e2?.message || e2));
      setCsvText("");
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    if (!businessId) return setError("Choose which business this catalogue belongs to.");
    setBusy(true);
    setError(null);
    try {
      const data = await call({ action: "importCsv", business_id: businessId, csv: csvText });
      if (!data?.ok) {
        const d = data?.details || data?.error?.details;
        throw new Error(d?.csv || data?.error?.message || data?.error || "Import failed.");
      }
      setResult(data);
      setPreview(null);
      setCsvText("");
      setFileName("");
      if (inputRef.current) inputRef.current.value = "";
      onImported?.();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="h-5 w-5 text-primary" />
        <h2 className="text-base font-bold">Upload a product spreadsheet</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Works with any store software. Export your products to CSV and upload it —
        include at least a product name, and a price column if you have one.
      </p>

      <div>
        <label className="text-xs font-medium text-muted-foreground">Business</label>
        <select
          value={businessId}
          onChange={(e) => setBusinessId(e.target.value)}
          className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Select a business…</option>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>{b.name || b.id}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">CSV file</label>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onFile}
          className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:font-bold file:text-primary-foreground"
        />
        {fileName && <p className="mt-1 text-xs text-muted-foreground">{fileName}</p>}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {preview && (
        <div className="rounded-xl border border-border bg-background/50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            {preview.total_rows} product{preview.total_rows === 1 ? "" : "s"} found
          </div>

          {!preview.has_price && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-500">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                No price column was recognised. These will import without prices and
                each one needs a price before it can be listed.
              </span>
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Understood:</span>{" "}
            {preview.mapped_fields?.join(", ") || "—"}
          </div>
          {preview.unmapped_columns?.length > 0 && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Ignored:</span>{" "}
              {preview.unmapped_columns.join(", ")}
            </div>
          )}

          {preview.preview?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Product</th>
                    <th className="py-1 pr-3 font-medium">Price</th>
                    <th className="py-1 font-medium">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((p, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-1.5 pr-3">{p.title}</td>
                      <td className="py-1.5 pr-3">
                        {p.price_cents === null ? <span className="text-amber-500">—</span> : `$${(p.price_cents / 100).toFixed(2)}`}
                      </td>
                      <td className="py-1.5 text-muted-foreground">{p.category}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button
            onClick={runImport}
            disabled={busy || !businessId}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import {preview.total_rows} product{preview.total_rows === 1 ? "" : "s"}
          </button>
          <p className="text-center text-[11px] text-muted-foreground">
            Nothing goes live — every product waits for your approval first.
          </p>
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
          <div className="flex items-center gap-2 font-bold text-emerald-500">
            <CheckCircle2 className="h-4 w-4" />
            Imported {result.staged} product{result.staged === 1 ? "" : "s"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {result.skipped > 0 && `${result.skipped} skipped (already imported or no name). `}
            {result.failed > 0 && `${result.failed} failed. `}
            Review them in the import queue and approve the ones you want listed.
          </p>
        </div>
      )}

      {busy && !preview && !result && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading file…
        </p>
      )}
    </div>
  );
}
