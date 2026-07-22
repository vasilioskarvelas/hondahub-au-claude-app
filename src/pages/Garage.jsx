import React from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Wrench, Gauge, Zap, Car, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import GarageCarCard from "@/components/GarageCarCard";
import { getCurrentUser, setCurrentUser } from "@/lib/userIdentity";

const PREVIEW_CAR = {
  model: "Civic EK Hatch",
  chassis_code: "EK9",
  engine_code: "B16B",
  year: 1999,
  dyno_kw: 140,
  gearbox: "S4 LSD",
  modifications: "Type R conversion, coilovers, full exhaust, intake, tuned ECU",
  photos: ["https://media.base44.com/images/public/6a4b2077ed97c621f24f7e1f/d16b37588_generated_image.png"],
  is_featured: false,
};

export default function Garage() {
  const [cars, setCars] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [touchStart, setTouchStart] = React.useState(0);

  const handleTouchStart = (e) => setTouchStart(e.touches[0].clientY);
  const handleTouchEnd = async (e) => {
    const diff = e.changedTouches[0].clientY - touchStart;
    if (diff > 80 && window.scrollY === 0 && !refreshing) {
      setRefreshing(true);
      await load();
      setRefreshing(false);
    }
  };

  const load = () => {
    base44.entities.GarageCar.list("-created_date", 50).then((c) => { setCars(c); setLoading(false); });
  };
  React.useEffect(load, []);

  const groupedByOwner = React.useMemo(() => {
    const map = {};
    for (const c of cars) {
      const owner = c.owner_name || "Unknown";
      if (!map[owner]) map[owner] = [];
      map[owner].push(c);
    }
    return Object.entries(map)
      .map(([owner, ownerCars]) => ({ owner, ownerCars }))
      .sort((a, b) => b.ownerCars.length - a.ownerCars.length);
  }, [cars]);

  const myName = getCurrentUser();
  const myCars = React.useMemo(() => cars.filter((c) => (c.owner_name || "Anonymous") === (myName || "Anonymous")), [cars, myName]);
  const otherGroups = React.useMemo(() => groupedByOwner.filter(({ owner }) => owner !== (myName || "Anonymous")), [groupedByOwner, myName]);
  const totalPower = myCars.reduce((sum, c) => sum + (c.dyno_kw || c.power_kw || 0), 0);
  const maxDyno = myCars.reduce((max, c) => Math.max(max, c.dyno_kw || 0), 0);

  return (
    <div className="space-y-5" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {refreshing && (
        <div className="flex items-center justify-center py-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-secondary border-t-primary" />
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tighter">My Garage</h1>
          <p className="text-sm text-muted-foreground">Your Honda builds, specs & dyno numbers — all in one place.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground glow-red">
          <Plus className="h-4 w-4" /> Add Car
        </button>
      </div>

      {!loading && cars.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-border bg-card p-3 text-center">
            <Car className="mx-auto h-4 w-4 text-primary" />
            <div className="mt-1 text-2xl font-black">{myCars.length}</div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Builds</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3 text-center">
            <Gauge className="mx-auto h-4 w-4 text-primary" />
            <div className="mt-1 text-2xl font-black">{totalPower}</div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total kW</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3 text-center">
            <Zap className="mx-auto h-4 w-4 text-primary" />
            <div className="mt-1 text-2xl font-black">{maxDyno}</div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Peak Dyno</div>
          </div>
        </div>
      )}

      {PREVIEW_CAR && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-5 w-1 rounded-full bg-primary" />
            <span className="text-sm font-black uppercase tracking-wide text-primary">Preview</span>
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">Silver EK Civic</span>
          </div>
          <div className="max-w-md">
            <GarageCarCard car={PREVIEW_CAR} />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" /></div>
      ) : cars.length === 0 ? (
        <EmptyGarage onAdd={() => setShowForm(true)} />
      ) : (
        <div className="space-y-6">
          {myCars.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="h-5 w-1 rounded-full bg-primary" />
                <span className="text-sm font-black uppercase tracking-wide text-primary">My Builds</span>
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
                  {myCars.length} {myCars.length === 1 ? "car" : "cars"}
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {myCars.map((c) => <GarageCarCard key={c.id} car={c} />)}
              </div>
            </div>
          )}

          {otherGroups.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pt-2">
                <span className="h-5 w-1 rounded-full bg-muted-foreground" />
                <span className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Community Garages</span>
              </div>
              {otherGroups.map(({ owner, ownerCars }) => (
                <div key={owner} className="space-y-3">
                  <Link to={`/user/${encodeURIComponent(owner)}/garage`} className="flex items-center gap-2 text-sm font-bold hover:text-primary">
                    {owner || "Unknown"}'s Garage
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                      {ownerCars.length}
                    </span>
                    {ownerCars.length > 1 && <span className="text-xs text-primary">🔥</span>}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {ownerCars.map((c) => <GarageCarCard key={c.id} car={c} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showForm && <AddCarModal onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
    </div>
  );
}

function EmptyGarage({ onAdd }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-dashed border-border bg-gradient-to-b from-primary/5 to-card p-10 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Wrench className="h-8 w-8 text-primary" />
      </div>
      <h3 className="mt-4 text-lg font-black">Your garage is waiting</h3>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">Add your first Honda build — specs, photos, dyno numbers and all.</p>
      <button onClick={onAdd} className="mt-4 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20">Add your first Honda</button>
    </div>
  );
}

function AddCarModal({ onClose, onSaved }) {
  const [form, setForm] = React.useState({ model: "", chassis_code: "", engine_code: "", engine_family: "Other", induction_type: "na", gearbox: "", power_kw: "", year: "", modifications: "", dyno_kw: "", track_name: "", track_time: "", drag_time: "", instagram: "", future_plans: "" });
  const [photos, setPhotos] = React.useState([]);
  const [timeSlip, setTimeSlip] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [ownerName, setOwnerName] = React.useState(getCurrentUser());
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleFiles = async (files) => {
    for (const file of Array.from(files)) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setPhotos((p) => [...p, file_url]);
    }
  };

  const submit = async () => {
    setLoading(true);
    try {
      if (ownerName) setCurrentUser(ownerName);
      await base44.entities.GarageCar.create({
        ...form,
        owner_name: ownerName || "Anonymous",
        year: form.year ? Number(form.year) : undefined,
        power_kw: form.power_kw ? Number(form.power_kw) : undefined,
        dyno_kw: form.dyno_kw ? Number(form.dyno_kw) : undefined,
        time_slip_url: timeSlip || undefined,
        photos,
      });
      onSaved();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-border bg-card p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-bold">Add to Garage</h3>
        <div className="space-y-3">
          <In label="Your Name *" value={ownerName} onChange={(v) => setOwnerName(v)} placeholder="Jake R" />
          <In label="Model *" value={form.model} onChange={(v) => set("model", v)} placeholder="Civic EK Hatch" />
          <div className="grid grid-cols-2 gap-3">
            <In label="Chassis Code" value={form.chassis_code} onChange={(v) => set("chassis_code", v)} placeholder="EK" />
            <In label="Engine Code" value={form.engine_code} onChange={(v) => set("engine_code", v)} placeholder="K20A" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <In label="Year" value={form.year} onChange={(v) => set("year", v)} />
            <In label="Gearbox" value={form.gearbox} onChange={(v) => set("gearbox", v)} placeholder="S80 LSD" />
          </div>
          <In label="Power (kW)" value={form.power_kw} onChange={(v) => set("power_kw", v)} />
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Track Name</label>
            <input value={form.track_name} onChange={(e) => set("track_name", e.target.value)} placeholder="Winton Raceway" className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus:border-primary" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <In label="Track Time" value={form.track_time} onChange={(v) => set("track_time", v)} placeholder="1:08.2" />
            <In label="Drag Time" value={form.drag_time} onChange={(v) => set("drag_time", v)} placeholder="12.4@110" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Engine Family</label>
              <select value={form.engine_family} onChange={(e) => set("engine_family", e.target.value)} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus:border-primary">
                <option value="K">K Series</option>
                <option value="B">B Series</option>
                <option value="D">D Series</option>
                <option value="H">H Series</option>
                <option value="F">F Series</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Induction</label>
              <select value={form.induction_type} onChange={(e) => set("induction_type", e.target.value)} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus:border-primary">
                <option value="na">Naturally Aspirated</option>
                <option value="fi">Forced Induction</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Time Slip (required for leaderboard)</label>
            <label className="flex h-16 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-xs text-muted-foreground hover:border-primary">
              <Plus className="h-4 w-4" /> {timeSlip ? "Slip uploaded ✓" : "Upload time slip"}
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const { file_url } = await base44.integrations.Core.UploadFile({ file });
                  setTimeSlip(file_url);
                }
              }} />
            </label>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Car Photos</label>
            <label className="flex h-20 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary">
              <Plus className="h-4 w-4" /> Add Photos
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            </label>
            {photos.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{photos.length} photo(s) added</p>}
          </div>
          <In label="Instagram" value={form.instagram} onChange={(v) => set("instagram", v)} placeholder="@yourbuild" />
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Modifications</label>
            <textarea value={form.modifications} onChange={(e) => set("modifications", e.target.value)} rows={2} className="w-full rounded-lg border border-border bg-secondary p-2.5 text-sm outline-none focus:border-primary" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Future Plans</label>
            <textarea value={form.future_plans} onChange={(e) => set("future_plans", e.target.value)} rows={2} className="w-full rounded-lg border border-border bg-secondary p-2.5 text-sm outline-none focus:border-primary" />
          </div>
        </div>
        <button onClick={submit} disabled={loading || !form.model || !ownerName} className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
          {loading ? "Saving..." : "Add to Garage"}
        </button>
      </div>
    </div>
  );
}

function In({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus:border-primary" />
    </div>
  );
}