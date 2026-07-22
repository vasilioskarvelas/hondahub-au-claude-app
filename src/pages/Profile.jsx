import React from "react";
import { base44 } from "@/api/base44Client";
import { BadgeCheck, MapPin, Star, Settings, Shield, Heart, Rocket, Wrench } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import ProfileOffers from "@/components/ProfileOffers";

export default function Profile() {
  const [user, setUser] = React.useState(null);
  const [listings, setListings] = React.useState([]);
  const navigate = useNavigate();

  React.useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      const sellerName = u?.full_name || u?.email?.split("@")[0];
      if (sellerName) {
        base44.entities.Listing.filter({ seller_name: sellerName }, "-created_date", 20).then(setListings);
      } else {
        base44.entities.Listing.list("-created_date", 6).then(setListings);
      }
    }).catch(() => {
      base44.entities.Listing.list("-created_date", 6).then(setListings);
    });
  }, []);

  const [boosting, setBoosting] = React.useState(null);
  const [profileTab, setProfileTab] = React.useState("listings");

  const name = user?.full_name || user?.email?.split("@")[0] || "Honda Enthusiast";

  const handleBoost = async (listingId) => {
    if (window.self !== window.top) {
      alert('Checkout is only available from the published app. Please open the app in a new tab to boost your listing.');
      return;
    }
    setBoosting(listingId);
    try {
      const res = await base44.functions.invoke('create-checkout-session', { listing_id: listingId, mode: 'boost' });
      const checkoutUrl = res.data?.url || res.url;
      if (!checkoutUrl) throw new Error('No checkout URL returned');
      window.location.href = checkoutUrl;
    } catch (err) {
      alert('Could not start checkout. Please try again.');
    } finally {
      setBoosting(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="carbon-bg h-24 bg-secondary" />
        <div className="px-5 pb-5">
          <div className="-mt-10 flex items-end gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-card bg-primary text-2xl font-black text-primary-foreground">
              {name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 pb-1">
              <div className="flex items-center gap-1.5">
                <h1 className="text-xl font-black">{name}</h1>
                <BadgeCheck className="h-5 w-5 text-primary" />
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> Australia</span>
                <span className="inline-flex items-center gap-1 text-amber-400"><Star className="h-3 w-3" /> 5.0</span>
              </div>
            </div>
            <button onClick={() => navigate('/settings')} className="rounded-xl border border-border p-2 text-muted-foreground hover:text-foreground"><Settings className="h-4 w-4" /></button>
          </div>
          <div className="mt-4 flex gap-6 text-sm">
            <Stat label="Listings" value={listings.length} />
            <Stat label="Followers" value={0} />
            <Stat label="Sales" value={0} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/garage" className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium">
              <Wrench className="h-4 w-4" /> My Garage
            </Link>
            <button className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium">
              <Heart className="h-4 w-4" /> Saved
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium">
              <Shield className="h-4 w-4" /> Get Verified
            </button>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-3 flex gap-2">
          <button onClick={() => setProfileTab("listings")} className={`flex-1 rounded-xl border py-2.5 text-sm font-bold transition ${profileTab === "listings" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
            My Listings
          </button>
          <button onClick={() => setProfileTab("offers")} className={`flex-1 rounded-xl border py-2.5 text-sm font-bold transition ${profileTab === "offers" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
            Offers
          </button>
        </div>

        {profileTab === "offers" ? (
          <ProfileOffers />
        ) : listings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No listings yet. <Link to="/create" className="text-primary font-semibold">Create one →</Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {listings.map((l) => (
              <div key={l.id} className="overflow-hidden rounded-xl border border-border bg-card">
                <Link to={`/listing/${l.id}`}>
                  <div className="relative aspect-square bg-secondary">
                    {l.photos?.[0] && <img src={l.photos[0]} alt="" className="h-full w-full object-cover" />}
                    {l.featured && <span className="absolute left-1.5 top-1.5 rounded-md bg-primary px-1.5 py-0.5 text-[9px] font-bold text-white">FEATURED</span>}
                  </div>
                  <div className="p-2">
                    <div className="truncate text-xs font-semibold">{l.title}</div>
                    <div className="text-sm font-black text-primary">${l.price?.toLocaleString()}</div>
                  </div>
                </Link>
                {!l.featured && (
                  <button onClick={() => handleBoost(l.id)} className="flex w-full items-center justify-center gap-1 border-t border-border py-1.5 text-[11px] font-bold text-primary hover:bg-primary/10">
                    <Rocket className="h-3 w-3" /> Boost $10
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-lg font-black">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}