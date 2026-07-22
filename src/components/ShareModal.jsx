import React from "react";
import { Share2, Copy, Check, X } from "lucide-react";

export default function ShareModal({ title, url, onClose }) {
  const [copied, setCopied] = React.useState(false);

  const copyLink = () => {
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ title, url }); } catch {}
    } else {
      copyLink();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-3xl border border-border bg-card p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">Share</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-2">
          <button onClick={nativeShare} className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-sm font-medium hover:border-primary">
            <Share2 className="h-5 w-5 text-primary" /> Share via...
          </button>
          <button onClick={copyLink} className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-sm font-medium hover:border-primary">
            {copied ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5 text-primary" />}
            {copied ? "Link copied!" : "Copy link"}
          </button>
          <div className="rounded-xl border border-border bg-secondary p-3">
            <p className="truncate text-xs text-muted-foreground">{url}</p>
          </div>
        </div>
      </div>
    </div>
  );
}