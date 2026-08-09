import React from "react";
import { base44 } from "@/api/base44Client";
import { Settings, MapPin, Save, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import TierBadge from "@/components/identity/TierBadge";
import MediaField from "@/components/identity/MediaField";
import { AccountTier } from "@/lib/registries";

export default function Profile() {
  const { user: authUser, checkAppState } = useAuth();
  const [user, setUser] = React.useState(authUser);
  const [trustScore, setTrustScore] = React.useState(null);
  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState({});
  const [avatarId, setAvatarId] = React.useState(null);
  const [coverId, setCoverId] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const navigate = useNavigate();

  // Use the globally-bootstrapped user from AuthContext (no separate API call,
  // no separate 12s timeout — the global bootstrap handles all of that).
  React.useEffect(() => {
    if (!authUser) return;
    setUser(authUser);
    setAvatarId(authUser.avatar_media_id || null);
    setCoverId(authUser.cover_media_id || null);
    setForm({
      handle: authUser.handle || "",
      display_name: authUser.display_name || authUser.full_name || "",
      bio: authUser.bio || "",
      location_general: authUser.location_general || "",
      phone: authUser.phone || "",
    });
    // Lazy-init TrustScore — non-blocking.
    base44.functions.invoke("trust-score", { action: "init" })
      .then((res) => setTrustScore(res.data?.trust_score || null))
      .catch(() => {});
  }, [authUser]);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      const res = await base44.functions.invoke("user-profile", { action: "update", ...form });
      if (res.data?.ok) {
        setUser(res.data.user);
        setEditing(false);
      } else {
        setError(res.data?.error || "Save failed");
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const saveMediaField = async (field, mediaId) => {
    try {
      const res = await base44.functions.invoke("user-profile", { action: "update", [field]: mediaId || null });
      if (res.data?.ok) setUser(res.data.user);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const handleLogout = async () => {
    await base44.auth.logout("/");
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-center">
          <h2 className="text-base font-bold text-destructive">Couldn't load your profile</h2>
          <p className="mt-1 text-sm text-muted-foreground">{error || "Your session could not be loaded."}</p>
          <div className="mt-4 flex justify-center gap-2">
            <button onClick={() => checkAppState()} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Retry</button>
            <button onClick={() => navigate("/login")} className="rounded-xl border border-border px-4 py-2 text-sm font-medium">Sign in</button>
          </div>
        </div>
      </div>
    );
  }

  const tier = trustScore?.current_tier || user.account_tier || AccountTier.NEW_MEMBER;
  const score = trustScore?.current_score ?? 0;
  const name = user.display_name || user.handle || user.full_name || user.email?.split("@")[0] || "Honda Enthusiast";

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="relative carbon-bg h-24 bg-secondary">
          {coverId && <CoverPreview mediaId={coverId} />}
        </div>
        <div className="px-5 pb-5">
          <div className="-mt-10 flex items-end gap-4">
            <AvatarPreview mediaId={avatarId} name={name} />
            <div className="flex-1 pb-1">
              <h1 className="text-xl font-black">{name}</h1>
              {user.handle && <p className="text-xs text-muted-foreground">@{user.handle}</p>}
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <TierBadge tier={tier} score={score} />
                {user.location_general && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" /> {user.location_general}</span>
                )}
              </div>
            </div>
            <button onClick={() => setEditing(!editing)} className="mb-1 rounded-xl border border-border p-2 text-muted-foreground hover:text-foreground"><Settings className="h-4 w-4" /></button>
          </div>
          {user.bio && !editing && <p className="mt-4 text-sm text-muted-foreground">{user.bio}</p>}
        </div>
      </div>

      {editing && (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Edit Profile</h2>
          {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <MediaField
            label="Avatar"
            kind="avatar"
            source="user"
            mediaId={avatarId}
            onUpdated={(id) => { setAvatarId(id); saveMediaField("avatar_media_id", id); }}
            onCleared={() => { setAvatarId(null); saveMediaField("avatar_media_id", null); }}
          />
          <MediaField
            label="Cover"
            kind="cover"
            source="user"
            mediaId={coverId}
            onUpdated={(id) => { setCoverId(id); saveMediaField("cover_media_id", id); }}
            onCleared={() => { setCoverId(null); saveMediaField("cover_media_id", null); }}
          />
          <Field label="Handle" value={form.handle} onChange={(v) => setForm({ ...form, handle: v })} hint="Public username. 3-20 chars, alphanumeric/underscore. Must be unique." />
          <Field label="Display Name" value={form.display_name} onChange={(v) => setForm({ ...form, display_name: v })} />
          <Field label="Bio" value={form.bio} onChange={(v) => setForm({ ...form, bio: v })} multiline hint="Max 500 characters." />
          <Field label="Location (city/region)" value={form.location_general} onChange={(v) => setForm({ ...form, location_general: v })} />
          <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
              <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={() => setEditing(false)} className="rounded-xl border border-border px-4 py-2 text-sm font-medium">Cancel</button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Account</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="Email" value={user.email} />
          <Row label="Account Status" value={user.account_status || "active"} />
          <Row label="Trust Score" value={`${score} · ${tier}`} />
          <Row label="Role" value={user.role} />
        </dl>
        <button onClick={handleLogout} className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, multiline, hint }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {multiline ? (
        <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} maxLength={500} rows={3} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
      ) : (
        <input value={value || ""} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
      )}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-right">{value || "—"}</dd>
    </div>
  );
}

function AvatarPreview({ mediaId, name }) {
  const [url, setUrl] = React.useState(null);
  React.useEffect(() => {
    let active = true;
    if (!mediaId) { setUrl(null); return; }
    base44.functions.invoke("media", { action: "get", media_id: mediaId })
      .then((r) => active && setUrl(r.data?.media?.file_url || null))
      .catch(() => active && setUrl(null));
    return () => { active = false; };
  }, [mediaId]);
  if (url) {
    return <img src={url} alt={name} className="h-20 w-20 rounded-full border-4 border-card object-cover" />;
  }
  return (
    <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-card bg-primary text-2xl font-black text-primary-foreground">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function CoverPreview({ mediaId }) {
  const [url, setUrl] = React.useState(null);
  React.useEffect(() => {
    let active = true;
    if (!mediaId) { setUrl(null); return; }
    base44.functions.invoke("media", { action: "get", media_id: mediaId })
      .then((r) => active && setUrl(r.data?.media?.file_url || null))
      .catch(() => active && setUrl(null));
    return () => { active = false; };
  }, [mediaId]);
  if (!url) return null;
  return <img src={url} alt="Cover" className="absolute inset-0 h-full w-full object-cover opacity-80" />;
}