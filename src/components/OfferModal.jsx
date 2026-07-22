import React from "react";
import { X, DollarSign, Repeat } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { getCurrentUser, setCurrentUser } from "@/lib/userIdentity";

export default function OfferModal({ listing, onClose }) {
  const [type, setType] = React.useState("cash");
  const [amount, setAmount] = React.useState("");
  const [cashDiff, setCashDiff] = React.useState("");
  const [offeredTitle, setOfferedTitle] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [buyerName, setBuyerName] = React.useState(getCurrentUser());
  const [loading, setLoading] = React.useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      if (buyerName) setCurrentUser(buyerName);
      await base44.entities.Offer.create({
        listing_id: listing.id,
        listing_title: listing.title,
        buyer_name: buyerName || "Anonymous",
        type,
        amount: type === "cash" ? Number(amount) : undefined,
        cash_difference: type !== "cash" ? Number(cashDiff) || undefined : undefined,
        offered_listing_title: type !== "cash" ? offeredTitle : undefined,
        message,
        status: "pending",
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl border border-border bg-card p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">Make an Offer</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button onClick={() => setType("cash")} className={`rounded-xl py-2.5 text-sm font-bold ${type === "cash" ? "bg-primary text-primary-foreground" : "border border-border"}`}>
            <DollarSign className="mr-1 inline h-4 w-4" /> Cash Offer
          </button>
          <button onClick={() => setType("swap")} className={`rounded-xl py-2.5 text-sm font-bold ${type === "swap" ? "bg-primary text-primary-foreground" : "border border-border"}`}>
            <Repeat className="mr-1 inline h-4 w-4" /> Trade / Swap
          </button>
        </div>
        <Field label="Your Name">
          <input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Your name" className="input" />
        </Field>
        {type === "cash" ? (
          <Field label="Your offer ($)">
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={listing.price} className="input" />
          </Field>
        ) : (
          <>
            <Field label="What are you offering?">
              <input value={offeredTitle} onChange={(e) => setOfferedTitle(e.target.value)} placeholder="e.g. K24A3 engine + gearbox" className="input" />
            </Field>
            <Field label="Cash difference ($)">
              <input type="number" value={cashDiff} onChange={(e) => setCashDiff(e.target.value)} placeholder="0" className="input" />
            </Field>
          </>
        )}
        <Field label="Message">
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Hey mate, interested in this. Is the price negotiable?" className="input" />
        </Field>
        <button onClick={submit} disabled={loading} className="mt-2 w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
          {loading ? "Sending..." : "Send Offer"}
        </button>
        <style>{`.input{width:100%;border-radius:.75rem;border:1px solid hsl(var(--border));background:hsl(var(--secondary));padding:.6rem .9rem;font-size:.875rem;outline:none}.input:focus{border-color:hsl(var(--primary))}`}</style>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}