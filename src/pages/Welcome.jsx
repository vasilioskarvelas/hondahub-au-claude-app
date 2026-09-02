import React from "react";
import { useNavigate } from "react-router-dom";
import { invokeFn } from "@/lib/invokeFn";
import { useAuth } from "@/lib/AuthContext";
import { User, Store, ArrowRight, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

/**
 * Welcome — post-signup account setup: personal member or business partner.
 *
 * Placed after registration rather than inside the email form so it catches
 * every signup route, including Google, which never touches Register.jsx.
 *
 * The business path does NOT create a usable business. It calls
 * business.requestBusinessAccount, which creates a PENDING business awaiting
 * moderator review. That is deliberate: a self-serve path that instantly
 * produced a live storefront would be a spam vector, and it is also how we come
 * to know a person actually represents the business they are claiming.
 *
 * Skipping is always allowed — nobody is trapped here — and a business can be
 * registered later from the Businesses directory.
 */

const CATEGORIES = [
  { value: "parts_supplier", label: "Parts supplier" },
  { value: "workshop", label: "Workshop" },
  { value: "tuner", label: "Tuner" },
  { value: "dealer", label: "Dealer" },
  { value: "detailer", label: "Detailer" },
  { value: "panel_shop", label: "Panel shop" },
  { value: "tyre_shop", label: "Tyre shop" },
  { value: "other", label: "Other" },
];

export default function Welcome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = React.useState(null); // null | "personal" | "business"
  const [form, setForm] = React.useState({
    name: "", category: "parts_supplier", website: "", location_general: "", about: "",
  });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [submitted, setSubmitted] = React.useState(false);

  const submitBusiness = async () => {
    if (!form.name.trim()) return setError("Enter your business name.");
    setBusy(true);
    setError(null);
    try {
      const r = await invokeFn("business", {
        action: "requestBusinessAccount",
        name: form.name.trim(),
        category: form.category,
        website: form.website.trim(),
        location_general: form.location_general.trim(),
        about: form.about.trim(),
      });
      if (!r.ok) throw new Error(r.error || "Could not submit your business.");
      setSubmitted(true);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-500" />
        <h1 className="text-xl font-black tracking-tight">Business submitted for review</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          We'll check the details and get back to you. Once approved you'll be able
          to import your catalogue and your storefront goes live.
        </p>
        <button
          onClick={() => navigate("/")}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
        >
          Explore Honda Hub <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 py-10 pb-20">
      <header className="text-center">
        <h1 className="text-2xl font-black tracking-tight">
          Welcome{user?.full_name ? `, ${String(user.full_name).split(" ")[0]}` : ""}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          How will you be using Honda Hub? You can change this later.
        </p>
      </header>

      {!mode && (
        <div className="grid gap-3">
          <button
            onClick={() => navigate("/")}
            className="rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/50"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/15 p-2"><User className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-base font-bold">I'm here personally</p>
                <p className="text-xs text-muted-foreground">
                  Show your builds, buy and sell parts, join the community.
                </p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setMode("business")}
            className="rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/50"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/15 p-2"><Store className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-base font-bold">I represent a business</p>
                <p className="text-xs text-muted-foreground">
                  Get a storefront and import your product catalogue.
                </p>
              </div>
            </div>
          </button>
        </div>
      )}

      {mode === "business" && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div>
            <h2 className="text-base font-bold">Tell us about your business</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              We review each business before it goes live, so your storefront won't
              appear straight away.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Business name *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="A2R Batteries & Performance"
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">What do you do? *</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Website</label>
            <input
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              placeholder="yourstore.com.au"
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Used to check your business is real, and to work out the quickest way
              to import your products later.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Location</label>
            <input
              value={form.location_general}
              onChange={(e) => setForm({ ...form, location_general: e.target.value })}
              placeholder="Sydney, NSW"
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">About</label>
            <textarea
              value={form.about}
              onChange={(e) => setForm({ ...form, about: e.target.value })}
              rows={3}
              placeholder="What you sell and who you look after."
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={submitBusiness}
              disabled={busy || !form.name.trim()}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
              Submit for review
            </button>
            <button
              onClick={() => { setMode(null); setError(null); }}
              className="rounded-xl border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Back
            </button>
          </div>
        </div>
      )}

      <p className="text-center">
        <button onClick={() => navigate("/")} className="text-xs text-muted-foreground hover:text-foreground">
          Skip for now
        </button>
      </p>
    </div>
  );
}
