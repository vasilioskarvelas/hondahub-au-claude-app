import React from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Upload, X, ImagePlus, Gavel, Tag, DollarSign, Crown, Star, TrendingUp, AlertTriangle, Home } from "lucide-react";
import { Select as RadixSelect, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { CHASSIS_CODES, ENGINE_CODES, AU_STATES, PART_CATEGORIES } from "@/components/Filters";
import PhotoUploader from "@/components/listing/PhotoUploader";

export default function CreateListing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = React.useState({
    title: "", description: "", type: "car", category: "", price: "", condition: "used",
    brand: "Honda", model: "", chassis_code: "", engine_code: "", transmission: "manual",
    state: "", location: "", postcode: "", kilometres: "", year: "", car_type: "street",
    oem_aftermarket: "none", part_number: "", vehicle_compatibility: "",
    swap_accepted: false, postage_available: false, pickup: true,
    registered: false, roadworthy: false, is_turbo: false, seller_name: "",
    selling_format: "buy_now", auction_duration: 7, reserve_price: "", auto_relist: false, auction_pro: false,
    feature_listing: false, top_search: false, urgent_badge: false, homepage_feature: false,
  });
  const [photos, setPhotos] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (user) {
      const name = user.full_name || user.email?.split("@")[0] || "";
      if (name) set((f) => ({ ...f, seller_name: name }));
    }
  }, [user]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const PRICING = {
    auction_7: 9.99, auction_14: 14.99, reserve_price: 4.99, auto_relist: 4.99, auction_pro: 24.99,
    feature_listing: 9.99, top_search: 9.99, urgent_badge: 4.99, homepage_feature: 14.99,
  };

  const totalCost = () => {
    let total = 0;
    if (form.selling_format === "auction") {
      total += form.auction_duration === 14 ? PRICING.auction_14 : PRICING.auction_7;
      if (form.reserve_price) total += PRICING.reserve_price;
      if (form.auto_relist) total += PRICING.auto_relist;
      if (form.auction_pro) total += PRICING.auction_pro;
    }
    if (!form.auction_pro) {
      if (form.feature_listing) total += PRICING.feature_listing;
      if (form.top_search) total += PRICING.top_search;
      if (form.urgent_badge) total += PRICING.urgent_badge;
      if (form.homepage_feature) total += PRICING.homepage_feature;
    }
    return total;
  };

  const priceLabel = form.selling_format === "auction" ? "Starting Price ($)" : form.selling_format === "make_offer" ? "Asking Price ($)" : "Price ($)";

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const listingData = {
        title: form.title,
        description: form.description,
        type: form.type,
        category: form.category || undefined,
        price: Number(form.price),
        condition: form.condition,
        brand: form.brand,
        model: form.model,
        chassis_code: form.chassis_code,
        engine_code: form.engine_code,
        transmission: form.transmission,
        state: form.state,
        location: form.location,
        postcode: form.postcode,
        kilometres: form.kilometres ? Number(form.kilometres) : undefined,
        year: form.year ? Number(form.year) : undefined,
        car_type: form.car_type,
        oem_aftermarket: form.oem_aftermarket,
        part_number: form.part_number,
        vehicle_compatibility: form.vehicle_compatibility,
        swap_accepted: form.swap_accepted,
        postage_available: form.postage_available,
        pickup: form.pickup,
        registered: form.registered,
        roadworthy: form.roadworthy,
        is_turbo: form.is_turbo,
        seller_name: form.seller_name,
        seller_verified: false,
        selling_format: form.selling_format,
        photos,
        featured: form.feature_listing,
        top_of_search: form.top_search,
        urgent: form.urgent_badge,
        homepage_feature: form.homepage_feature,
        auto_relist: form.auto_relist,
        auction_pro: form.auction_pro,
      };

      if (form.selling_format === "auction") {
        listingData.auction_duration = Number(form.auction_duration);
        listingData.auction_status = "pending";
        if (form.reserve_price) listingData.reserve_price = Number(form.reserve_price);
      }

      const created = await base44.entities.Listing.create(listingData);

      const items = [];
      if (form.selling_format === "auction") {
        items.push(form.auction_duration === 14 ? "auction_14" : "auction_7");
        if (form.reserve_price) items.push("reserve_price");
        if (form.auto_relist) items.push("auto_relist");
        if (form.auction_pro) items.push("auction_pro");
      }
      if (!form.auction_pro) {
        if (form.feature_listing) items.push("feature_listing");
        if (form.top_search) items.push("top_search");
        if (form.urgent_badge) items.push("urgent_badge");
        if (form.homepage_feature) items.push("homepage_feature");
      }

      if (items.length > 0) {
        if (window.self !== window.top) {
          alert("Checkout is only available from the published app. Please open the app in a new tab to complete your purchase.");
          return;
        }
        const res = await base44.functions.invoke("create-checkout-session", {
          listing_id: created.id,
          mode: "features",
          items,
        });
        const checkoutUrl = res.data?.url || res.url;
        if (!checkoutUrl) throw new Error("No checkout URL returned");
        window.location.href = checkoutUrl;
      } else {
        navigate(`/listing/${created.id}`);
      }
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const cost = totalCost();

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-black">List your Honda</h1>

      {/* Selling Format */}
      <Card title="Selling Format">
        <div className="grid grid-cols-3 gap-2">
          <FormatButton active={form.selling_format === "buy_now"} onClick={() => set("selling_format", "buy_now")} icon={DollarSign} label="Buy Now" sub="Free · Fixed price" />
          <FormatButton active={form.selling_format === "make_offer"} onClick={() => set("selling_format", "make_offer")} icon={Tag} label="Make Offer" sub="Free · Negotiable" />
          <FormatButton active={form.selling_format === "auction"} onClick={() => set("selling_format", "auction")} icon={Gavel} label="Auction" sub="Paid · Bidding" />
        </div>
      </Card>

      {/* Photos */}
      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Photos</h2>
        <PhotoUploader photos={photos} setPhotos={setPhotos} />
      </div>

      {/* Details */}
      <Card title="Details">
        <Input label="Title *" value={form.title} onChange={(v) => set("title", v)} placeholder="e.g. 1999 Civic EK Hatch K20 swap" />
        <div className="grid grid-cols-2 gap-3">
          <Input label={priceLabel + " *"} type="number" value={form.price} onChange={(v) => set("price", v)} />
          <Select label="Condition" value={form.condition} onChange={(v) => set("condition", v)} options={["new", "used", "refurbished", "for_parts"]} />
        </div>
        <Input label="Model" value={form.model} onChange={(v) => set("model", v)} placeholder="Civic, Integra, S2000..." />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Chassis Code" value={form.chassis_code} onChange={(v) => set("chassis_code", v)} options={CHASSIS_CODES} />
          <Select label="Engine Code" value={form.engine_code} onChange={(v) => set("engine_code", v)} options={ENGINE_CODES} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Year" type="number" value={form.year} onChange={(v) => set("year", v)} />
          <Input label="Kilometres" type="number" value={form.kilometres} onChange={(v) => set("kilometres", v)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Transmission" value={form.transmission} onChange={(v) => set("transmission", v)} options={["manual", "auto", "other"]} />
          <Select label="Car Type" value={form.car_type} onChange={(v) => set("car_type", v)} options={["street", "track", "project", "wrecking", "show"]} />
        </div>
        {form.type === "part" && (
          <>
            <Select label="Category" value={form.category} onChange={(v) => set("category", v)} options={PART_CATEGORIES} />
            <div className="grid grid-cols-2 gap-3">
              <Select label="OEM / Aftermarket" value={form.oem_aftermarket} onChange={(v) => set("oem_aftermarket", v)} options={["oem", "aftermarket", "none"]} />
              <Input label="Part Number" value={form.part_number} onChange={(v) => set("part_number", v)} />
            </div>
            <Input label="Vehicle Compatibility" value={form.vehicle_compatibility} onChange={(v) => set("vehicle_compatibility", v)} placeholder="e.g. DC5, EP3, CL7" />
          </>
        )}
      </Card>

      {/* Auction Settings */}
      {form.selling_format === "auction" && (
        <Card title="Auction Settings">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => set("auction_duration", 7)} className={`rounded-xl border py-3 text-center ${form.auction_duration === 7 ? "border-primary bg-primary/10" : "border-border"}`}>
              <div className="text-sm font-bold">7 Days</div>
              <div className="text-xs text-primary">$9.99</div>
            </button>
            <button onClick={() => set("auction_duration", 14)} className={`rounded-xl border py-3 text-center ${form.auction_duration === 14 ? "border-primary bg-primary/10" : "border-border"}`}>
              <div className="text-sm font-bold">14 Days</div>
              <div className="text-xs text-primary">$14.99</div>
            </button>
          </div>
          <Input label="Reserve Price ($)" type="number" value={form.reserve_price} onChange={(v) => set("reserve_price", v)} placeholder="Optional — $4.99 add-on" />
          {form.reserve_price && <p className="text-xs text-primary">+ $4.99 reserve price fee</p>}
          <Toggle label="Auto-relist if unsold (+$4.99)" active={form.auto_relist} onClick={() => set("auto_relist", !form.auto_relist)} />
          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold">Auction Pro Bundle</span>
              </div>
              <span className="text-sm font-black text-primary">$24.99</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Includes featured badge, top-of-search boost, featured auction badge, and homepage placement.</p>
            <button onClick={() => set("auction_pro", !form.auction_pro)} className={`mt-2 w-full rounded-lg py-2 text-sm font-bold ${form.auction_pro ? "bg-primary text-primary-foreground" : "border border-primary text-primary"}`}>
              {form.auction_pro ? "✓ Selected" : "Add Auction Pro"}
            </button>
          </div>
        </Card>
      )}

      {/* Location */}
      <Card title="Location">
        <div className="grid grid-cols-2 gap-3">
          <Select label="State *" value={form.state} onChange={(v) => set("state", v)} options={AU_STATES} />
          <Input label="Suburb" value={form.location} onChange={(v) => set("location", v)} />
        </div>
        <Input label="Postcode" value={form.postcode} onChange={(v) => set("postcode", v)} />
      </Card>

      {/* Options */}
      <Card title="Options">
        <div className="grid grid-cols-2 gap-2">
          <Toggle label="Swap accepted" active={form.swap_accepted} onClick={() => set("swap_accepted", !form.swap_accepted)} />
          <Toggle label="Postage available" active={form.postage_available} onClick={() => set("postage_available", !form.postage_available)} />
          <Toggle label="Pickup" active={form.pickup} onClick={() => set("pickup", !form.pickup)} />
          <Toggle label="Registered" active={form.registered} onClick={() => set("registered", !form.registered)} />
          <Toggle label="Roadworthy" active={form.roadworthy} onClick={() => set("roadworthy", !form.roadworthy)} />
          <Toggle label="Turbo" active={form.is_turbo} onClick={() => set("is_turbo", !form.is_turbo)} />
        </div>
      </Card>

      {/* Paid Promotions */}
      <Card title="Paid Promotions">
        <p className="text-xs text-muted-foreground">Boost your listing's visibility. Free to list — pay only for what you need.</p>
        <div className="space-y-2">
          <PromoToggle icon={Star} label="Feature Listing" price={9.99} desc="FEATURED badge" active={form.feature_listing && !form.auction_pro} disabled={form.auction_pro} onClick={() => set("feature_listing", !form.feature_listing)} />
          <PromoToggle icon={TrendingUp} label="Top of Search" price={9.99} desc="Boost in search results" active={form.top_search && !form.auction_pro} disabled={form.auction_pro} onClick={() => set("top_search", !form.top_search)} />
          <PromoToggle icon={AlertTriangle} label="Urgent Sale Badge" price={4.99} desc="URGENT badge" active={form.urgent_badge} disabled={false} onClick={() => set("urgent_badge", !form.urgent_badge)} />
          <PromoToggle icon={Home} label="Homepage Feature" price={14.99} desc="Show on homepage" active={form.homepage_feature} disabled={false} onClick={() => set("homepage_feature", !form.homepage_feature)} />
        </div>
        {form.auction_pro && <p className="text-xs text-amber-400">Feature Listing & Top of Search are included in your Auction Pro bundle.</p>}
      </Card>

      {/* Description */}
      <Card title="Description">
        <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={5} placeholder="Tell buyers about the car or part, history, mods, condition..." className="w-full rounded-lg border border-border bg-secondary p-3 text-sm outline-none focus:border-primary" />
      </Card>

      {error && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <button onClick={submit} disabled={loading || !form.title || !form.price || !form.state} className="w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground glow-red disabled:opacity-50">
        {loading ? "Publishing..." : cost > 0 ? `Publish & Pay $${cost.toFixed(2)}` : "Publish Listing"}
      </button>
    </div>
  );
}

function FormatButton({ active, onClick, icon: Icon, label, sub }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 rounded-xl border py-3 text-center ${active ? "border-primary bg-primary/10" : "border-border"}`}>
      <Icon className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
      <span className={`text-sm font-bold ${active ? "text-primary" : ""}`}>{label}</span>
      <span className="text-[9px] text-muted-foreground">{sub}</span>
    </button>
  );
}

function PromoToggle({ icon: Icon, label, price, desc, active, disabled, onClick }) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${active ? "border-primary bg-primary/10" : "border-border"} ${disabled ? "opacity-50" : ""}`}>
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <span className="text-sm font-bold text-primary">${price}</span>
      <span className={`h-4 w-4 rounded-full border-2 ${active ? "border-primary bg-primary" : "border-muted-foreground"}`} />
    </button>
  );
}

function Card({ title, children }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
function Input({ label, value, onChange, type = "text", placeholder }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus:border-primary" />
    </div>
  );
}
function Select({ label, value, onChange, options }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <RadixSelect value={value || "__any__"} onValueChange={(v) => onChange(v === "__any__" ? "" : v)}>
        <SelectTrigger className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm">
          <SelectValue placeholder="Any" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__any__">Any</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </RadixSelect>
    </div>
  );
}
function Toggle({ label, active, onClick }) {
  return (
    <button onClick={onClick} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
      {label}
      <span className={`h-4 w-4 rounded-full border-2 ${active ? "border-primary bg-primary" : "border-muted-foreground"}`} />
    </button>
  );
}