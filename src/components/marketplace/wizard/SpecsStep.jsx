import React from "react";
import AdditionalSpecsEditor from "@/components/marketplace/AdditionalSpecsEditor";

export default function SpecsStep({ f, setSpecs }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black tracking-tight">Additional specifications</h2>
        <p className="text-sm text-muted-foreground">Add any extra label/value pairs buyers might want. Optional, up to 10.</p>
      </div>
      <AdditionalSpecsEditor specs={f.additional_specifications} setSpecs={setSpecs} />
    </div>
  );
}