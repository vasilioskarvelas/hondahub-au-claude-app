import React from "react";
import { Plus, Wrench, Car, Gauge, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { callGarage, vehicleLabel } from "@/lib/garage";
import VehicleCard from "@/components/garage/VehicleCard";
import VehicleForm from "@/components/garage/VehicleForm";
import DiscoverGarages from "@/components/garage/DiscoverGarages";

export default function Garage() {
  const [vehicles, setVehicles] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await callGarage("vehicle", { action: "list" });
      if (data?.ok) setVehicles(data.vehicles || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };
  React.useEffect(() => { load(); }, []);

  const totalPower = vehicles.reduce((s, v) => s + (v.power_kw || 0), 0);
  const maxPower = vehicles.reduce((m, v) => Math.max(m, v.power_kw || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tighter">My Garage</h1>
          <p className="text-sm text-muted-foreground">Your Honda builds, specs, mods & results — all in one place.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground glow-red">
          <Plus className="h-4 w-4" /> Add Vehicle
        </button>
      </div>

      {!loading && vehicles.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Stat icon={Car} label="Vehicles" value={vehicles.length} />
          <Stat icon={Gauge} label="Total kW" value={totalPower} />
          <Stat icon={Zap} label="Peak kW" value={maxPower} />
        </div>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" /></div>
      ) : vehicles.length === 0 ? (
        <EmptyGarage onAdd={() => setShowForm(true)} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((v) => <VehicleCard key={v.id} vehicle={v} />)}
        </div>
      )}

      <DiscoverGarages />

      {showForm && (
        <VehicleForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-center">
      <Icon className="mx-auto h-4 w-4 text-primary" />
      <div className="mt-1 text-2xl font-black">{value}</div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
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
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">Add your first Honda build — specs, mods, maintenance and performance results.</p>
      <button onClick={onAdd} className="mt-4 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20">Add your first Honda</button>
    </div>
  );
}