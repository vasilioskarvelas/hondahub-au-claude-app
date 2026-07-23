import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Crown, Trash2, Plus, ShieldAlert, Search } from "lucide-react";

const ENTITLEMENT_KEYS = [
  "create_listing", "maximum_active_listings", "create_group", "maximum_groups",
  "business_profile", "business_analytics", "promoted_listing", "advanced_search",
  "premium_media_limits", "verified_business_badge",
];
const NUMERIC_KEYS = new Set(["maximum_active_listings", "maximum_groups"]);
const isNumeric = (k) => NUMERIC_KEYS.has(k);
const prettyKey = (k) => k.replace(/_/g, " ");

export default function EntitlementOverrides() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    subscriber_type: "user", subscriber_id: "", entitlement_key: "create_listing",
    bool_value: true, numeric_value: 5, reason: "", expires_at: "",
  });
  const [saving, setSaving] = useState(false);
  const [overrides, setOverrides] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [preview, setPreview] = useState({ subscriber_type: "user", subscriber_id: "", result: null, loading: false });

  const load = useCallback(async () => {
    setLoadingList(true);
    try {
      const r = await base44.functions.invoke("entitlement", { action: "override.list" });
      if (r.data?.ok) setOverrides(r.data.overrides || []);
    } catch {} finally { setLoadingList(false); }
  }, []);
  useEffect(() => { if (user?.role === "admin") load(); }, [user, load]);

  if (user?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="mb-3 h-10 w-10 text-destructive" />
        <h2 className="text-xl font-bold">Admin access required</h2>
        <p className="mt-1 text-sm text-muted-foreground">Entitlement overrides are managed by admins only.</p>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (!form.subscriber_id.trim() || !form.reason.trim()) return;
    setSaving(true);
    try {
      const payload = {
        action: "override.create",
        subscriber_type: form.subscriber_type,
        subscriber_id: form.subscriber_id.trim(),
        entitlement_key: form.entitlement_key,
        reason: form.reason.trim(),
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      };
      if (isNumeric(form.entitlement_key)) payload.numeric_value = Number(form.numeric_value);
      else payload.bool_value = form.bool_value;
      const r = await base44.functions.invoke("entitlement", payload);
      if (r.data?.ok) {
        setForm((f) => ({ ...f, reason: "", expires_at: "" }));
        await load();
      }
    } catch {} finally { setSaving(false); }
  };

  const remove = async (id) => {
    await base44.functions.invoke("entitlement", { action: "override.remove", override_id: id });
    await load();
  };

  const runPreview = async () => {
    if (!preview.subscriber_id.trim()) return;
    setPreview((p) => ({ ...p, loading: true, result: null }));
    try {
      const r = await base44.functions.invoke("entitlement", {
        action: "resolveEffectiveEntitlements",
        subscriber_type: preview.subscriber_type,
        subscriber_id: preview.subscriber_id.trim(),
      });
      setPreview((p) => ({ ...p, result: r.data }));
    } catch {} finally { setPreview((p) => ({ ...p, loading: false })); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-20">
      <header className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/15 p-2"><Crown className="h-6 w-6 text-primary" /></div>
        <div>
          <h1 className="text-2xl font-black tracking-tight">Entitlement Overrides</h1>
          <p className="text-sm text-muted-foreground">Admin-managed per-subscriber entitlement exceptions (Phase 10 scaffolding).</p>
        </div>
      </header>

      {/* Resolve preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Search className="h-4 w-4" /> Resolve effective entitlements</CardTitle>
          <CardDescription>Preview what a subscriber resolves to (override → plan → free).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Subscriber type</Label>
              <Select value={preview.subscriber_type} onValueChange={(v) => setPreview((p) => ({ ...p, subscriber_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="user">User</SelectItem><SelectItem value="business">Business</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Subscriber ID</Label>
              <Input value={preview.subscriber_id} onChange={(e) => setPreview((p) => ({ ...p, subscriber_id: e.target.value }))} placeholder="User or Business id" />
            </div>
          </div>
          <Button onClick={runPreview} disabled={preview.loading || !preview.subscriber_id.trim()}>
            {preview.loading ? "Resolving…" : "Resolve"}
          </Button>
          {preview.result?.ok && (
            <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary">plan: {preview.result.plan_code}</Badge>
                <Badge variant="outline">{preview.result.has_active_subscription ? "active subscription" : "free tier (no subscription row)"}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                {ENTITLEMENT_KEYS.map((k) => {
                  const v = preview.result.entitlements[k];
                  return (
                    <div key={k} className="flex items-center justify-between gap-2 border-b border-border/40 py-1">
                      <span className="truncate text-muted-foreground">{prettyKey(k)}</span>
                      <span className="font-mono font-semibold">{String(v)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create override */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4" /> Create override</CardTitle>
          <CardDescription>Exactly one value (bool or numeric) per entitlement; reason required, expiry optional.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Subscriber type</Label>
                <Select value={form.subscriber_type} onValueChange={(v) => setForm((f) => ({ ...f, subscriber_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="user">User</SelectItem><SelectItem value="business">Business</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Subscriber ID *</Label>
                <Input value={form.subscriber_id} onChange={(e) => setForm((f) => ({ ...f, subscriber_id: e.target.value }))} placeholder="User or Business id" required />
              </div>
              <div className="space-y-1.5">
                <Label>Entitlement key</Label>
                <Select value={form.entitlement_key} onValueChange={(v) => setForm((f) => ({ ...f, entitlement_key: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ENTITLEMENT_KEYS.map((k) => (<SelectItem key={k} value={k}>{prettyKey(k)}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Value</Label>
                {isNumeric(form.entitlement_key) ? (
                  <Input type="number" min={0} value={form.numeric_value} onChange={(e) => setForm((f) => ({ ...f, numeric_value: e.target.value }))} />
                ) : (
                  <Select value={String(form.bool_value)} onValueChange={(v) => setForm((f) => ({ ...f, bool_value: v === "true" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="true">true (granted)</SelectItem><SelectItem value="false">false (revoked)</SelectItem></SelectContent>
                  </Select>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason *</Label>
              <Textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Why this override is being created…" required rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Expires at (optional)</Label>
              <Input type="datetime-local" value={form.expires_at} onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))} />
            </div>
            <Button type="submit" disabled={saving || !form.subscriber_id.trim() || !form.reason.trim()}>
              {saving ? "Creating…" : "Create override"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Existing overrides */}
      <Card>
        <CardHeader>
          <CardTitle>Existing overrides</CardTitle>
          <CardDescription>{overrides.length} record(s).</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingList ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : overrides.length === 0 ? (
            <p className="text-sm text-muted-foreground">No overrides yet.</p>
          ) : (
            <div className="space-y-2">
              {overrides.map((o) => (
                <div key={o.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-secondary/20 p-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary">{o.subscriber_type}</Badge>
                      <span className="font-mono text-xs text-muted-foreground">{o.subscriber_id}</span>
                    </div>
                    <div className="text-sm font-semibold">{prettyKey(o.entitlement_key)}</div>
                    <div className="font-mono text-sm text-primary">
                      = {o.bool_value !== null && o.bool_value !== undefined ? String(o.bool_value) : o.numeric_value}
                    </div>
                    {o.expires_at && <div className="text-xs text-muted-foreground">expires {new Date(o.expires_at).toLocaleString()}</div>}
                    <div className="text-xs text-muted-foreground">reason: {o.reason}</div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => remove(o.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}