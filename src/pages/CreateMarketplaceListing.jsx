import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { applicableCategoryFields, DEFAULT_ATTRS, EMPTY_ATTRS } from "@/components/marketplace/categoryAttrs";
import { computeListingQuality } from "@/lib/listingQuality";
import ProgressBar from "@/components/marketplace/wizard/ProgressBar";
import TypeStep from "@/components/marketplace/wizard/TypeStep";
import VehicleStep from "@/components/marketplace/wizard/VehicleStep";
import CategoryStep from "@/components/marketplace/wizard/CategoryStep";
import DetailsStep from "@/components/marketplace/wizard/DetailsStep";
import CompatibilityStep from "@/components/marketplace/wizard/CompatibilityStep";
import SpecsStep from "@/components/marketplace/wizard/SpecsStep";
import FormatStep from "@/components/marketplace/wizard/FormatStep";
import PhotosStep from "@/components/marketplace/wizard/PhotosStep";
import VideoStep from "@/components/marketplace/wizard/VideoStep";
import PricingStep from "@/components/marketplace/wizard/PricingStep";
import ShippingStep from "@/components/marketplace/wizard/ShippingStep";
import LocationStep from "@/components/marketplace/wizard/LocationStep";
import DescriptionStep from "@/components/marketplace/wizard/DescriptionStep";
import ReviewStep from "@/components/marketplace/wizard/ReviewStep";
import { VEHICLE_STEPS, PART_STEPS, isStepComplete } from "@/components/marketplace/wizard/constants";

const EMPTY = {
  flow: null, listing_type: "for_sale", category: "", title: "", description: "",
  price_type: "fixed", price: "", condition: "used", quantity: "1",
  primary_vehicle_id: "", compatible_make: "", compatible_model: "", compatible_chassis_code: "",
  compatible_year_from: "", compatible_year_to: "", location_general: "",
  photo_urls: [], video_urls: [], additional_specifications: [],
  ...DEFAULT_ATTRS, ...EMPTY_ATTRS,
};

export default function CreateMarketplaceListing() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = !!id;

  const [f, setF] = useState(EMPTY);
  const [stepIndex, setStepIndex] = useState(0);
  const [draftId, setDraftId] = useState(id || null);
  const [vehicles, setVehicles] = useState([]);
  const [busy, setBusy] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const fRef = useRef(f); useEffect(() => { fRef.current = f; }, [f]);
  const draftIdRef = useRef(draftId); useEffect(() => { draftIdRef.current = draftId; }, [draftId]);
  const vehiclesRef = useRef(vehicles); useEffect(() => { vehiclesRef.current = vehicles; }, [vehicles]);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);

  const steps = useMemo(() => {
    if (!f.flow) return ["type"];
    return f.flow === "vehicle" ? VEHICLE_STEPS : PART_STEPS;
  }, [f.flow]);

  const quality = useMemo(
    () => computeListingQuality({ ...f, category: f.flow === "vehicle" ? "vehicle" : f.category }),
    [f],
  );

  const markDirty = () => { dirtyRef.current = true; };
  const field = useCallback((k, v) => { markDirty(); setF((prev) => ({ ...prev, [k]: v })); }, []);
  const setPhotos = useCallback((u) => { markDirty(); setF((prev) => ({ ...prev, photo_urls: typeof u === "function" ? u(prev.photo_urls) : u })); }, []);
  const setVideos = useCallback((u) => { markDirty(); setF((prev) => ({ ...prev, video_urls: typeof u === "function" ? u(prev.video_urls) : u })); }, []);
  const setSpecs = useCallback((u) => { markDirty(); setF((prev) => ({ ...prev, additional_specifications: typeof u === "function" ? u(prev.additional_specifications) : u })); }, []);

  // Auto-derived title for vehicle listings, from the selected Garage vehicle.
  const autoTitle = () => {
    const form = fRef.current;
    if (form.flow !== "vehicle") return "";
    const v = vehiclesRef.current.find((x) => x.id === form.primary_vehicle_id);
    if (!v) return "";
    return [v.year, v.make, v.model].filter(Boolean).join(" ") + (v.chassis_code ? ` ${v.chassis_code}` : "") + (v.nickname ? ` — ${v.nickname}` : "");
  };

  const buildPayload = (title) => {
    const form = fRef.current;
    const p = {
      listing_type: form.listing_type,
      category: form.category,
      title: title || form.title.trim(),
      description: form.description.trim() || undefined,
      price_type: form.price_type,
      condition: form.condition,
      quantity: Number(form.quantity) || 1,
      location_general: form.location_general.trim() || undefined,
      primary_vehicle_id: form.primary_vehicle_id || undefined,
      photo_urls: form.photo_urls,
      video_urls: form.video_urls,
      additional_specifications: form.additional_specifications,
    };
    p.price_cents = (form.price_type === "fixed" || form.price_type === "negotiable") ? Math.round(Number(form.price) * 100) : null;
    if (form.category !== "vehicle") {
      p.compatible_make = form.compatible_make.trim() || undefined;
      p.compatible_model = form.compatible_model.trim() || undefined;
      p.compatible_chassis_code = form.compatible_chassis_code.trim() || undefined;
      p.compatible_year_from = form.compatible_year_from === "" ? undefined : Number(form.compatible_year_from);
      p.compatible_year_to = form.compatible_year_to === "" ? undefined : Number(form.compatible_year_to);
      for (const key of applicableCategoryFields(form.category)) {
        if (key === "shipping_cost_cents") {
          p.shipping_cost_cents = form.shipping_available ? Math.round((Number(form.shipping_cost) || 0) * 100) : null;
          continue;
        }
        const val = form[key];
        if (val === "" || val === undefined || val === null) continue;
        p[key] = val;
      }
    }
    return p;
  };

  const saveDraft = async ({ silent = false } = {}) => {
    if (savingRef.current) return null;
    const form = fRef.current;
    const title = form.title.trim() || (form.flow === "vehicle" ? autoTitle() : "");
    const hasId = !!draftIdRef.current;
    if (!title && !hasId) return null; // not enough to create a draft yet
    savingRef.current = true;
    if (!silent) setSaving(true);
    try {
      const payload = buildPayload(title);
      let res;
      if (hasId) {
        res = await base44.functions.invoke("marketplace", { action: "updateListing", listing_id: draftIdRef.current, ...payload });
      } else {
        res = await base44.functions.invoke("marketplace", { action: "createListingDraft", ...payload });
        if (res.data?.ok) { setDraftId(res.data.listing_id); draftIdRef.current = res.data.listing_id; }
      }
      if (res.data?.ok) { dirtyRef.current = false; setSavedAt(Date.now()); return res.data; }
      if (!silent) setError(res.data?.error?.message || res.data?.error || "Save failed");
    } catch (e) {
      if (!silent) setError(e.message);
    } finally {
      savingRef.current = false;
      if (!silent) setSaving(false);
    }
    return null;
  };

  // Load garage vehicles + existing draft (resume at first incomplete step).
  useEffect(() => {
    (async () => {
      try { const vs = await base44.entities.Vehicle.list(); setVehicles(vs || []); } catch {}
      if (editing) {
        try {
          const res = await base44.functions.invoke("marketplace", { action: "getListing", listing_id: id });
          const l = res.data?.listing;
          if (l) {
            const flow = l.category === "vehicle" ? "vehicle" : "part";
            const loaded = {
              ...EMPTY, flow,
              listing_type: l.listing_type || "for_sale", category: l.category || "",
              title: l.title || "", description: l.description || "",
              price_type: l.price_type || "fixed", price: l.price_cents != null ? String(l.price_cents / 100) : "",
              condition: l.condition || "used", quantity: String(l.quantity ?? 1),
              primary_vehicle_id: l.primary_vehicle_id || "",
              compatible_make: l.compatible_make || "", compatible_model: l.compatible_model || "",
              compatible_chassis_code: l.compatible_chassis_code || "",
              compatible_year_from: l.compatible_year_from ?? "", compatible_year_to: l.compatible_year_to ?? "",
              location_general: l.location_general || "",
              photo_urls: l.photo_urls || [], video_urls: l.video_urls || [],
              additional_specifications: l.additional_specifications || [],
              brand: l.brand || "", oem_or_aftermarket: l.oem_or_aftermarket || "",
              shipping_available: l.shipping_available ?? false, pickup_available: l.pickup_available ?? true,
              shipping_cost: l.shipping_cost_cents != null ? String(l.shipping_cost_cents / 100) : "",
              wheel_diameter_inches: l.wheel_diameter_inches ?? "", wheel_width_inches: l.wheel_width_inches ?? "",
              wheel_offset_mm: l.wheel_offset_mm ?? "", wheel_pcd: l.wheel_pcd || "", wheel_quantity: l.wheel_quantity ?? "",
              tyres_included: l.tyres_included ?? false, tyre_tread_percentage: l.tyre_tread_percentage ?? "",
              component_kilometres: l.component_kilometres ?? "", tested_before_listing: l.tested_before_listing || "",
              warranty_included: l.warranty_included ?? false, lock_status: l.lock_status || "", tuned: l.tuned ?? false,
            };
            setF(loaded); fRef.current = loaded;
            setDraftId(l.id); draftIdRef.current = l.id;
            const arr = flow === "vehicle" ? VEHICLE_STEPS : PART_STEPS;
            let idx = arr.length - 1;
            for (let i = 0; i < arr.length; i++) { if (!isStepComplete(arr[i], loaded)) { idx = i; break; } }
            setStepIndex(idx);
          }
        } catch {}
      }
      setLoaded(true);
    })();
  }, [id]);

  // Auto-save every 30s while editing (only when there's something to save).
  useEffect(() => {
    const t = setInterval(() => {
      if (!dirtyRef.current) return;
      const form = fRef.current;
      const title = form.title.trim() || (form.flow === "vehicle" ? autoTitle() : "");
      if (title || draftIdRef.current) saveDraft({ silent: true });
    }, 30000);
    return () => clearInterval(t);
  }, []);

  // Scroll to top on step change (mobile UX).
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [stepIndex]);

  const chooseFlow = (flow) => {
    markDirty();
    if (flow === "vehicle") {
      setF((prev) => ({ ...prev, flow, category: "vehicle", ...DEFAULT_ATTRS, ...EMPTY_ATTRS }));
    } else {
      setF((prev) => ({ ...prev, flow, category: "", primary_vehicle_id: "", ...DEFAULT_ATTRS, ...EMPTY_ATTRS }));
    }
    setStepIndex(1);
  };

  const chooseCategory = (cat) => {
    markDirty();
    setF((prev) => ({ ...prev, category: cat, ...DEFAULT_ATTRS, ...EMPTY_ATTRS }));
    setStepIndex(2);
  };

  const selectVehicle = (vid) => {
    markDirty();
    setF((prev) => {
      const v = vehiclesRef.current.find((x) => x.id === vid);
      const t = v ? [v.year, v.make, v.model].filter(Boolean).join(" ") + (v.chassis_code ? ` ${v.chassis_code}` : "") + (v.nickname ? ` — ${v.nickname}` : "") : "";
      return { ...prev, primary_vehicle_id: vid, title: prev.title || t };
    });
  };

  const next = async () => {
    if (!isStepComplete(steps[stepIndex], f)) return;
    await saveDraft();
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };
  const back = () => setStepIndex((i) => Math.max(i - 1, 0));
  const jump = (i) => { if (i <= stepIndex) setStepIndex(i); };

  const publish = async () => {
    setBusy("publish"); setError("");
    try {
      await saveDraft();
      const did = draftIdRef.current;
      if (!did) { setError("Could not save the draft before publishing."); setBusy(""); return; }
      const res = await base44.functions.invoke("marketplace", { action: "publishListing", listing_id: did });
      if (res.data?.ok) navigate(`/marketplace/${did}`);
      else setError(res.data?.error?.message || res.data?.error || "Publish failed");
    } catch (e) { setError(e.message); } finally { setBusy(""); }
  };

  const curKey = steps[stepIndex];
  const curComplete = isStepComplete(curKey, f);
  const isType = curKey === "type";
  const isReview = curKey === "review";

  const renderStep = () => {
    switch (curKey) {
      case "type": return <TypeStep flow={f.flow} onChoose={chooseFlow} />;
      case "vehicle": return <VehicleStep vehicles={vehicles} primary_vehicle_id={f.primary_vehicle_id} onSelect={selectVehicle} />;
      case "category": return <CategoryStep category={f.category} onSelect={chooseCategory} />;
      case "details": return <DetailsStep f={f} field={field} />;
      case "compatibility": return <CompatibilityStep f={f} field={field} />;
      case "specs": return <SpecsStep f={f} setSpecs={setSpecs} />;
      case "format": return <FormatStep f={f} field={field} />;
      case "photos": return <PhotosStep f={f} setPhotos={setPhotos} />;
      case "video": return <VideoStep f={f} setVideos={setVideos} />;
      case "pricing": return <PricingStep f={f} field={field} />;
      case "shipping": return <ShippingStep f={f} field={field} />;
      case "location": return <LocationStep f={f} field={field} />;
      case "description": return <DescriptionStep f={f} field={field} flow={f.flow} />;
      case "review": return <ReviewStep f={f} vehicles={vehicles} quality={quality} busy={busy} onPublish={publish} />;
      default: return null;
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link to="/marketplace" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Marketplace
      </Link>

      <div>
        <h1 className="text-2xl font-black tracking-tighter">Create a Marketplace Listing</h1>
        {!isType && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            {saving ? <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</span>
              : savedAt ? <span>Saved</span>
              : <span>Draft auto-saves as you go</span>}
          </div>
        )}
      </div>

      {!isType && <ProgressBar steps={steps} currentIndex={stepIndex} onJump={jump} />}

      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      <div className="rounded-2xl border border-border bg-card p-5">
        {loaded || !editing ? renderStep() : <div className="py-12 text-center text-sm text-muted-foreground">Loading draft…</div>}
      </div>

      {!isType && !isReview && (
        <div className="flex items-center gap-2">
          <button onClick={back} disabled={stepIndex === 0} className="inline-flex items-center gap-1 rounded-xl border border-border px-4 py-2.5 text-sm font-bold disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <button onClick={next} disabled={!curComplete} className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground glow-red disabled:opacity-50">
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
      {!isType && !isReview && !curComplete && (
        <p className="text-center text-xs text-muted-foreground">Complete this step to continue.</p>
      )}
    </div>
  );
}