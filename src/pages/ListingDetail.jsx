import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  ArrowLeft, MapPin, BadgeCheck, ShieldCheck, Truck, Package, Repeat, AlertTriangle,
  Heart, Share2, Flag, MessageCircle, ChevronLeft, ChevronRight, DollarSign, Gavel, Tag,
} from "lucide-react";
import ListingCard from "@/components/ListingCard";
import OfferModal from "@/components/OfferModal";
import OffersSection from "@/components/OffersSection";
import AuctionBidding from "@/components/AuctionBidding";
import PromoteListing from "@/components/PromoteListing";
import ShareModal from "@/components/ShareModal";
import ListingEngagement from "@/components/ListingEngagement";
import ReportDialog from "@/components/moderation/ReportDialog";
import { getCurrentUser } from "@/lib/userIdentity";

export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = React.useState(null);
  const [related, setRelated] = React.useState([]);
  const [photoIdx, setPhotoIdx] = React.useState(0);
  const [showOffer, setShowOffer] = React.useState(false);
  const [saved, setSavedList] = React.useState(false);
  const [checkingOut, setCheckingOut] = React.useState(false);
  const [topOffer, setTopOffer] = React.useState(null);
  const [showShare, setShowShare] = React.useState(false);
  const [reportOpen, setReportOpen] = React.useState(false);

  React.useEffect(() => {
    base44.entities.Listing.get(id).then((l) => {
      setListing(l);
      base44.entities.Listing.update(id, { views: (l.views || 0) + 1 });
      base44.entities.Listing.filter({ type: l.type, state: l.state }, "-created_date", 4).then((r) =>
        setRelated(r.filter((x) => x.id !== id).slice(0, 3))
      );
    });
    base44.entities.Offer.filter({ listing_id: id }, "-amount", 50).then((offers) => {
      const pending = offers.filter((o) => o.status === "pending" && o.type === "cash");
      setTopOffer(pending.length > 0 ? pending[0] : null);
    });
    const savedKey = "hondahub_saved";
    const savedIds = JSON.parse(localStorage.getItem(savedKey) || "[]");
    setSavedList(savedIds.includes(id));
  }, [id]);

  if (!listing)
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" />
      </div>
    );

  const photos = listing.photos || [];
  const isAuction = listing.selling_format === "auction";
  const isSeller = (getCurrentUser() || "") === (listing.seller_name || "");

  const handleMessage = async () => {
    const existing = await base44.entities.Conversation.filter({ listing_id: listing.id });
    if (existing.length > 0) {
      navigate(`/messages?conv=${existing[0].id}`);
    } else {
      const conv = await base44.entities.Conversation.create({
        listing_id: listing.id,
        listing_title: listing.title,
        participant_name: listing.seller_name || "Seller",
        last_message: "",
      });
      navigate(`/messages?conv=${conv.id}`);
    }
  };

  const toggleSave = () => {
    const savedKey = "hondahub_saved";
    const saved = JSON.parse(localStorage.getItem(savedKey) || "[]");
    if (saved.includes(listing.id)) {
      localStorage.setItem(savedKey, JSON.stringify(saved.filter((id) => id !== listing.id)));
      setSavedList(false);
    } else {
      localStorage.setItem(savedKey, JSON.stringify([...saved, listing.id]));
      setSavedList(true);
    }
  };

  const handleBuyNow = async () => {
    if (window.self !== window.top) {
      alert('Checkout is only available from the published app. Please open the app in a new tab to complete your purchase.');
      return;
    }
    setCheckingOut(true);
    try {
      const res = await base44.functions.invoke('create-checkout-session', { listing_id: listing.id });
      const checkoutUrl = res.data?.url || res.url;
      if (!checkoutUrl) throw new Error('No checkout URL returned');
      window.location.href = checkoutUrl;
    } catch (err) {
      alert('Could not start checkout. Please try again.');
    } finally {
      setCheckingOut(false);
    }
  };

  const priceLabel = isAuction ? "Starting Bid" : listing.selling_format === "make_offer" ? "Asking Price" : "Sale Price";
  const displayPrice = isAuction ? (listing.current_highest_bid || listing.price) : listing.price;

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[44px] px-2">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-secondary">
            <div className="aspect-[4/3]">
              {photos.length ? (
                <img src={photos[photoIdx]} alt={listing.title} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">No photos</div>
              )}
            </div>
            {photos.length > 1 && (
              <>
                <button onClick={() => setPhotoIdx((i) => (i - 1 + photos.length) % photos.length)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white backdrop-blur">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button onClick={() => setPhotoIdx((i) => (i + 1) % photos.length)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white backdrop-blur">
                  <ChevronRight className="h-5 w-5" />
                </button>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
                  {photoIdx + 1} / {photos.length}
                </div>
              </>
            )}
          </div>
          {photos.length > 1 && (
            <div className="mt-2 flex gap-2 overflow-x-auto">
              {photos.map((p, i) => (
                <button key={i} onClick={() => setPhotoIdx(i)} className={`h-16 w-20 shrink-0 overflow-hidden rounded-lg border-2 ${i === photoIdx ? "border-primary" : "border-transparent"}`}>
                  <img src={p} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap gap-2">
              {isAuction && <span className="rounded-md bg-purple-600 px-2 py-0.5 text-[10px] font-bold text-white inline-flex items-center gap-1"><Gavel className="h-2.5 w-2.5" />AUCTION</span>}
              {listing.selling_format === "make_offer" && <span className="rounded-md bg-sky-600 px-2 py-0.5 text-[10px] font-bold text-white inline-flex items-center gap-1"><Tag className="h-2.5 w-2.5" />MAKE OFFER</span>}
              {listing.selling_format === "buy_now" && <span className="rounded-md bg-green-600 px-2 py-0.5 text-[10px] font-bold text-white">BUY NOW</span>}
              {listing.urgent && <span className="rounded-md bg-destructive px-2 py-0.5 text-[10px] font-bold text-white">URGENT</span>}
              {listing.featured && <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold text-white">FEATURED</span>}
              {listing.auction_pro && <span className="rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-black">PRO</span>}
              {listing.status === "sold" && <span className="rounded-md bg-foreground px-2 py-0.5 text-[10px] font-bold text-background">SOLD</span>}
              <span className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{listing.type}</span>
              {listing.oem_aftermarket !== "none" && (
                <span className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{listing.oem_aftermarket}</span>
              )}
            </div>
            <h1 className="mt-2 text-2xl font-black leading-tight">{listing.title}</h1>
            <div className="mt-3 flex flex-wrap items-baseline gap-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{priceLabel}</div>
                <div className="text-3xl font-black text-primary">${displayPrice?.toLocaleString()}</div>
              </div>
              {isAuction && listing.reserve_price && (
                <div className="rounded-xl border border-border bg-secondary px-3 py-1.5">
                  <div className="text-xs text-muted-foreground">Reserve</div>
                  <div className="text-sm font-bold">${listing.reserve_price?.toLocaleString()}</div>
                </div>
              )}
              {!isAuction && topOffer && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5">
                  <div className="text-xs font-medium uppercase tracking-wide text-amber-400">Current Offer</div>
                  <div className="text-2xl font-black text-amber-400">${topOffer.amount?.toLocaleString()}</div>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2 border-y border-border py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                {(listing.seller_name || "P").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1 text-sm font-semibold">
                  {listing.seller_name || "Private seller"}
                  {listing.seller_verified && <BadgeCheck className="h-4 w-4 text-primary" />}
                </div>
                <div className="text-xs text-amber-400">★ {listing.seller_rating?.toFixed(1) || "5.0"} rating</div>
              </div>
              <button onClick={handleMessage} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:border-primary">
                Message
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Spec label="Location" value={`${listing.location || ""} ${listing.state || ""}`} icon={<MapPin className="h-3.5 w-3.5" />} />
              {listing.chassis_code && <Spec label="Chassis" value={listing.chassis_code} mono />}
              {listing.engine_code && <Spec label="Engine" value={listing.engine_code} mono />}
              {listing.transmission && <Spec label="Transmission" value={listing.transmission} />}
              {listing.year && <Spec label="Year" value={listing.year} />}
              {listing.kilometres != null && <Spec label="Kilometres" value={`${listing.kilometres?.toLocaleString()} km`} />}
              {listing.condition && <Spec label="Condition" value={listing.condition} />}
              {listing.car_type && <Spec label="Type" value={listing.car_type} />}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {listing.swap_accepted && <Badge icon={<Repeat className="h-3 w-3" />} text="Swap accepted" color="amber" />}
              {listing.postage_available && <Badge icon={<Truck className="h-3 w-3" />} text="Postage available" color="sky" />}
              {listing.pickup && <Badge icon={<Package className="h-3 w-3" />} text="Pickup available" color="green" />}
              {listing.registered && <Badge icon={<ShieldCheck className="h-3 w-3" />} text="Registered" color="green" />}
              {listing.roadworthy && <Badge icon={<ShieldCheck className="h-3 w-3" />} text="Roadworthy" color="green" />}
            </div>

            {/* Action buttons based on selling format */}
            <div className="mt-5">
              {isAuction ? (
                <AuctionBidding listing={listing} />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {listing.selling_format !== "buy_now" && (
                    <button onClick={() => setShowOffer(true)} className="rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground glow-red">
                      Make Offer
                    </button>
                  )}
                  {listing.selling_format === "buy_now" && (
                    <button onClick={handleBuyNow} disabled={checkingOut || listing.status === "sold"} className="flex items-center justify-center gap-1.5 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground glow-red disabled:opacity-50">
                      <DollarSign className="h-4 w-4" /> {checkingOut ? "Redirecting..." : `Buy Now $${listing.price?.toLocaleString()}`}
                    </button>
                  )}
                  <button onClick={handleMessage} className="flex items-center justify-center gap-1.5 rounded-xl border border-border py-3 text-sm font-bold hover:border-primary">
                    <MessageCircle className="h-4 w-4" /> Message
                  </button>
                </div>
              )}
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2">
              <button onClick={toggleSave} className={`flex flex-col items-center gap-0.5 rounded-xl border py-2 text-xs ${saved ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
                <Heart className={`h-4 w-4 ${saved ? "fill-primary" : ""}`} /> {saved ? "Saved" : "Save"}
              </button>
              <button onClick={() => setShowShare(true)} className="flex flex-col items-center gap-0.5 rounded-xl border border-border py-2 text-xs text-muted-foreground hover:border-primary hover:text-foreground">
                <Share2 className="h-4 w-4" /> Share
              </button>
              <button onClick={() => setReportOpen(true)} className="flex flex-col items-center gap-0.5 rounded-xl border border-border py-2 text-xs text-muted-foreground hover:border-primary hover:text-foreground">
                <Flag className="h-4 w-4" /> Report
              </button>
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Never pay a deposit outside the app. Meet in person for inspections. HondaHub offers trade protection on verified sellers.</span>
            </div>
          </div>
        </div>
      </div>

      {listing.description && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Description</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed">{listing.description}</p>
        </div>
      )}

      {related.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-bold">Similar listings</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {related.map((r) => <ListingCard key={r.id} listing={r} />)}
          </div>
        </div>
      )}

      {listing.selling_format === "make_offer" && <OffersSection listingId={listing.id} />}

      {isSeller && <PromoteListing listing={listing} />}

      <ListingEngagement listingId={listing.id} title={listing.title} />

      {showOffer && <OfferModal listing={listing} onClose={() => setShowOffer(false)} />}

      {showShare && <ShareModal title={listing.title} url={window.location.href} onClose={() => setShowShare(false)} />}

      <ReportDialog targetType="listing" targetId={listing.id} open={reportOpen} onClose={() => setReportOpen(false)} />
    </div>
  );
}

function Spec({ label, value, icon, mono }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">{icon}{label}</div>
      <div className={`font-semibold ${mono ? "font-mono text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function Badge({ icon, text, color }) {
  const colors = { amber: "text-amber-400", sky: "text-sky-400", green: "text-green-400" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg border border-border bg-secondary px-2 py-1 text-xs font-medium ${colors[color]}`}>
      {icon} {text}
    </span>
  );
}