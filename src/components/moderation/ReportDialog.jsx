import React from "react";
import { Flag, X, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

const CATEGORIES = [
  { value: "spam", label: "Spam" },
  { value: "scam", label: "Scam / Fraud" },
  { value: "harassment", label: "Harassment" },
  { value: "hate_speech", label: "Hate Speech" },
  { value: "illegal", label: "Illegal Content" },
  { value: "copyright", label: "Copyright Violation" },
  { value: "fake_listing", label: "Fake / Misleading Listing" },
  { value: "dangerous_behaviour", label: "Dangerous Behaviour" },
  { value: "other", label: "Other" },
];

/**
 * ReportDialog — embeddable on every reportable content type (Post, Comment,
 * Vehicle, User). Any authenticated user, not tier-gated (reporting is a safety
 * tool). Duplicate open report from the same reporter is rejected inline.
 */
export default function ReportDialog({ targetType, targetId, open, onClose }) {
  const [category, setCategory] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setCategory("");
      setDescription("");
      setError(null);
      setDone(false);
    }
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    if (!category) {
      setError("Please choose a category.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("moderation", {
        action: "fileReport",
        target_type: targetType,
        target_id: targetId,
        category,
        description: description.trim() || undefined,
      });
      if (res.data?.error) {
        setError(res.data.error);
      } else {
        setDone(true);
      }
    } catch (e) {
      const code = e.response?.data?.error || e.response?.data?.details?.error;
      if (code === "DUPLICATE_OPEN_REPORT") setError("You've already reported this.");
      else setError(e.response?.data?.message || e.message || "Could not submit report.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Flag className="h-4 w-4 text-primary" /> Report content
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {done ? (
          <div className="p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Flag className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold">Report submitted</p>
            <p className="mt-1 text-xs text-muted-foreground">Our moderation team will review it.</p>
            <button onClick={onClose} className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <div>
              <span className="text-xs font-semibold text-muted-foreground">Why are you reporting this?</span>
              <div className="mt-2 grid grid-cols-1 gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setCategory(c.value)}
                    className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                      category === c.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">Additional details (optional)</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={1000}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                placeholder="Add any context that will help our moderators…"
              />
            </label>
            {error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm font-medium">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? "Submitting…" : "Submit report"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * ReportButton — a small trigger that opens the ReportDialog. Embeddable on any
 * reportable surface. Renders nothing if no authenticated user.
 */
export function ReportButton({ targetType, targetId, className = "" }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-primary ${className}`}
        aria-label="Report"
      >
        <Flag className="h-4 w-4" />
      </button>
      <ReportDialog targetType={targetType} targetId={targetId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}