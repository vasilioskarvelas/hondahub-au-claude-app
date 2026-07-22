import React from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  ArrowLeft, Gauge, Zap, Cog, Flag, Instagram, Share2, Wrench, Calendar,
  ChevronLeft, ChevronRight,
} from "lucide-react";

export default function GarageCarDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [car, setCar] = React.useState(null);
  const [related, setRelated] = React.useState([]);
  const [photoIdx, setPhotoIdx] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    base44.entities.GarageCar.get(id)
      .then((c) => {
        setCar(c);
        setLoading(false);
        if (c.owner_name) {
          base44.entities.GarageCar.filter({ owner_name: c.owner_name }, "-created_date", 10).then((r) =>
            setRelated(r.filter((x) => x.id !== id).slice(0, 4))
          );
        }
      })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading)
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" />
      </div>
    );

  if (!car)
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-bold">Build not found</p>
        <button onClick={() => navigate("/garage")} className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
          Back to Garage
        </button>
      </div>
    );

  const photos = car.photos || [];

  const handleShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: `${car.year || ""} ${car.model}`, url: window.location.href }); } catch {}
    } else {
      navigator.clipboard?.writeText(window.location.href);
    }
  };

  return (
    <div className="space-y-5 pb-6">
      <button onClick={() => navigate("/garage")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Garage
      </button>

      {/* Hero Photo */}
      {photos.length > 0 ? (
        <div className="relative overflow-hidden rounded-2xl border border-border">
          <img src={photos[photoIdx]} alt={car.model} className="aspect-video w-full object-cover" />
          {photos.length > 1 && (
            <>
              <button
                onClick={() => setPhotoIdx((i) => (i - 1 + photos.length) % photos.length)}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1.5 text-white"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => setPhotoIdx((i) => (i + 1) % photos.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1.5 text-white"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-white">
                {photoIdx + 1} / {photos.length}
              </div>
            </>
          )}
          {car.is_featured && (
            <span className="absolute left-2 top-2 rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold text-white">FEATURED</span>
          )}
        </div>
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-card">
          <p className="text-sm text-muted-foreground">No photos</p>
        </div>
      )}

      {/* Title */}
      <div>
        <div className="flex flex-wrap items-baseline gap-2">
          {car.year && <span className="text-lg font-bold text-muted-foreground">{car.year}</span>}
          <h1 className="text-2xl font-black">{car.model}</h1>
        </div>
        <div className="mt-1 flex flex-wrap gap-2">
          {car.chassis_code && <span className="font-mono text-sm text-primary">{car.chassis_code}</span>}
          {car.engine_code && <span className="font-mono text-sm text-primary">{car.engine_code}</span>}
          {car.engine_family && (
            <span className="rounded bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">{car.engine_family}-Series</span>
          )}
          {car.induction_type && (
            <span className="rounded bg-secondary px-2 py-0.5 text-xs font-bold text-muted-foreground">
              {car.induction_type === "fi" ? "Forced Induction" : "Naturally Aspirated"}
            </span>
          )}
        </div>
      </div>

      {/* Owner Card */}
      {car.owner_name && (
        <Link
          to={`/user/${encodeURIComponent(car.owner_name)}`}
          className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 active:scale-[0.98]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
            {car.owner_name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Built by</p>
            <p className="text-sm font-bold">{car.owner_name}</p>
          </div>
        </Link>
      )}

      {/* Specs Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SpecCard icon={Gauge} label="Power" value={car.power_kw ? `${car.power_kw} kW` : "N/A"} />
        <SpecCard icon={Zap} label="Dyno" value={car.dyno_kw ? `${car.dyno_kw} kW` : "N/A"} highlight={!!car.dyno_kw} />
        <SpecCard icon={Cog} label="Gearbox" value={car.gearbox || "N/A"} />
        <SpecCard icon={Calendar} label="Year" value={car.year?.toString() || "N/A"} />
        <SpecCard icon={Wrench} label="Chassis" value={car.chassis_code || "N/A"} />
        <SpecCard icon={Wrench} label="Engine" value={car.engine_code || "N/A"} />
      </div>

      {/* Track Times */}
      {(car.track_time || car.drag_time) && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Flag className="h-4 w-4 text-primary" /> Track Times
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {car.track_time && (
              <div>
                <p className="text-xs text-muted-foreground">Circuit ({car.track_name || "—"})</p>
                <p className="text-lg font-black text-primary">{car.track_time}</p>
                {car.time_verified && car.time_verified !== "pending" && (
                  <span className={`text-[10px] font-bold ${car.time_verified === "verified" ? "text-green-500" : "text-destructive"}`}>
                    {car.time_verified.toUpperCase()}
                  </span>
                )}
              </div>
            )}
            {car.drag_time && (
              <div>
                <p className="text-xs text-muted-foreground">Drag</p>
                <p className="text-lg font-black text-primary">{car.drag_time}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modifications */}
      {car.modifications && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
            <Wrench className="h-4 w-4 text-primary" /> Modifications
          </h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{car.modifications}</p>
        </div>
      )}

      {/* Future Plans */}
      {car.future_plans && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-2 text-sm font-bold">Future Plans</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{car.future_plans}</p>
        </div>
      )}

      {/* Photo Gallery */}
      {photos.length > 1 && (
        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Gallery ({photos.length})</h2>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p, i) => (
              <button
                key={i}
                onClick={() => setPhotoIdx(i)}
                className={`aspect-square overflow-hidden rounded-lg border-2 ${photoIdx === i ? "border-primary" : "border-transparent"}`}
              >
                <img src={p} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Time Slip */}
      {car.time_slip_url && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-bold">Time Slip</h2>
          <img src={car.time_slip_url} alt="Time slip" className="w-full rounded-lg" />
        </div>
      )}

      {/* Social & Share */}
      <div className="flex gap-3">
        {car.instagram && (
          <a
            href={`https://instagram.com/${car.instagram.replace("@", "")}`}
            target="_blank"
            rel="noreferrer"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-bold"
          >
            <Instagram className="h-4 w-4 text-pink-400" /> {car.instagram}
          </a>
        )}
        <button
          onClick={handleShare}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-bold"
        >
          <Share2 className="h-4 w-4" /> Share
        </button>
      </div>

      {/* Related Cars */}
      {related.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">More from {car.owner_name}</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {related.map((c) => (
              <Link key={c.id} to={`/garage/${c.id}`} className="w-56 shrink-0 overflow-hidden rounded-2xl border border-border bg-card">
                {c.photos?.[0] && <img src={c.photos[0]} alt={c.model} className="aspect-video w-full object-cover" />}
                <div className="p-3">
                  <h3 className="text-sm font-bold">{c.model}</h3>
                  <p className="text-xs text-muted-foreground">
                    {c.chassis_code} · {c.year}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SpecCard({ icon: Icon, label, value, highlight }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 text-primary" />
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <p className={`mt-1 text-sm font-bold ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}