import React from "react";
import { OEM_OPTIONS, TESTED_OPTIONS, LOCK_OPTIONS, OEM_REQUIRED } from "./categoryAttrs";

const inputCls = "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary";
const smallInput = "rounded-lg border border-border bg-background px-2.5 py-2 text-xs outline-none focus:border-primary";

function Field({ label, required, children }) {
  return (
    <div>
      <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}{required && <span className="text-primary"> *</span>}
      </label>
      {children}
    </div>
  );
}

export default function CategoryAttributesForm({ category, values, onChange }) {
  if (category === "vehicle") return null;
  const showWheels = category === "wheels_tyres";
  const showDrivetrain = ["engine", "transmission", "forced_induction"].includes(category);
  const showElectronics = category === "electronics";
  const oemRequired = OEM_REQUIRED.includes(category);

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Part details</p>

      <Field label="Brand">
        <input
          value={values.brand || ""}
          onChange={(e) => onChange("brand", e.target.value)}
          placeholder="e.g. Spoon, OEM Honda, K&N"
          maxLength={100}
          className={inputCls}
        />
      </Field>

      <Field label="OEM / Aftermarket" required={oemRequired}>
        <select
          value={values.oem_or_aftermarket || ""}
          onChange={(e) => onChange("oem_or_aftermarket", e.target.value)}
          className={inputCls}
        >
          <option value="">{oemRequired ? "Select..." : "Optional"}</option>
          {OEM_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <input
            type="checkbox"
            checked={!!values.shipping_available}
            onChange={(e) => onChange("shipping_available", e.target.checked)}
          />
          Shipping available
        </label>
        <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <input
            type="checkbox"
            checked={values.pickup_available !== false}
            onChange={(e) => onChange("pickup_available", e.target.checked)}
          />
          Pickup available
        </label>
      </div>

      {values.shipping_available && (
        <Field label="Shipping cost (AUD)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={values.shipping_cost || ""}
            onChange={(e) =>
              onChange("shipping_cost_cents", e.target.value === "" ? null : Math.round(Number(e.target.value) * 100))
            }
            placeholder="0 = free shipping"
            className={inputCls}
          />
        </Field>
      )}

      {showWheels && (
        <div className="space-y-3 border-t border-border pt-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Wheels &amp; Tyres</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Diameter (in)"><input type="number" min="10" max="24" value={values.wheel_diameter_inches ?? ""} onChange={(e) => onChange("wheel_diameter_inches", e.target.value)} className={smallInput} /></Field>
            <Field label="Width (in)"><input type="number" min="3" max="15" step="0.1" value={values.wheel_width_inches ?? ""} onChange={(e) => onChange("wheel_width_inches", e.target.value)} className={smallInput} /></Field>
            <Field label="Offset (mm)"><input type="number" min="-50" max="80" value={values.wheel_offset_mm ?? ""} onChange={(e) => onChange("wheel_offset_mm", e.target.value)} className={smallInput} /></Field>
            <Field label="PCD"><input value={values.wheel_pcd || ""} onChange={(e) => onChange("wheel_pcd", e.target.value)} placeholder="5x114.3" className={smallInput} /></Field>
            <Field label="Quantity"><input type="number" min="1" max="5" value={values.wheel_quantity ?? ""} onChange={(e) => onChange("wheel_quantity", e.target.value)} className={smallInput} /></Field>
          </div>
          <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <input type="checkbox" checked={!!values.tyres_included} onChange={(e) => onChange("tyres_included", e.target.checked)} />
            Tyres included
          </label>
          {values.tyres_included && (
            <Field label="Tyre tread (%)">
              <input type="number" min="0" max="100" value={values.tyre_tread_percentage ?? ""} onChange={(e) => onChange("tyre_tread_percentage", e.target.value)} className={smallInput} />
            </Field>
          )}
        </div>
      )}

      {showDrivetrain && (
        <div className="space-y-3 border-t border-border pt-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Drivetrain component</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Component km"><input type="number" min="0" value={values.component_kilometres ?? ""} onChange={(e) => onChange("component_kilometres", e.target.value)} placeholder="unknown" className={smallInput} /></Field>
            <Field label="Tested before listing">
              <select value={values.tested_before_listing || ""} onChange={(e) => onChange("tested_before_listing", e.target.value)} className={smallInput}>
                <option value="">Not specified</option>
                {TESTED_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <input type="checkbox" checked={!!values.warranty_included} onChange={(e) => onChange("warranty_included", e.target.checked)} />
            Warranty included
          </label>
        </div>
      )}

      {showElectronics && (
        <div className="space-y-3 border-t border-border pt-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Electronics</p>
          <div className="grid grid-cols-2 gap-2 items-start">
            <Field label="Lock status">
              <select value={values.lock_status || ""} onChange={(e) => onChange("lock_status", e.target.value)} className={smallInput}>
                <option value="">Not specified</option>
                {LOCK_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </Field>
            <label className="flex items-center gap-2 pt-6 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <input type="checkbox" checked={!!values.tuned} onChange={(e) => onChange("tuned", e.target.checked)} />
              Tuned
            </label>
          </div>
        </div>
      )}
    </div>
  );
}