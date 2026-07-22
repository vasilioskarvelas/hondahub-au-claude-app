import React from "react";
import { base44 } from "@/api/base44Client";
import { UserPlus, UserMinus, Loader2 } from "lucide-react";

export default function FollowButton({ targetType, targetId, initialFollowing, onToggle, size = "sm" }) {
  const [following, setFollowing] = React.useState(!!initialFollowing);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => { setFollowing(!!initialFollowing); }, [initialFollowing]);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const prev = following;
    setFollowing(!prev);
    try {
      const action = prev ? "unfollowTarget" : "followTarget";
      const res = await base44.functions.invoke("social", { action, target_type: targetType, target_id: targetId });
      const next = res.data?.following ?? !prev;
      setFollowing(next);
      onToggle?.(next);
    } catch (e) {
      setFollowing(prev);
    } finally {
      setBusy(false);
    }
  };

  const pad = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";
  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 rounded-xl font-bold transition disabled:opacity-50 ${pad} ${following ? "border border-border text-muted-foreground hover:text-foreground" : "bg-primary text-primary-foreground"}`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : following ? <UserMinus className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
      {following ? "Following" : "Follow"}
    </button>
  );
}