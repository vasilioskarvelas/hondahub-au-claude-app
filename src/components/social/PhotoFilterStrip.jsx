import React from "react";

export const FILTERS = [
  { id: "none", name: "Touge", css: "none" },
  { id: "vivid", name: "Suzuka", css: "saturate(1.5) contrast(1.1)" },
  { id: "warm", name: "Daikoku", css: "sepia(0.3) saturate(1.3) brightness(1.05)" },
  { id: "crisp", name: "Fuji", css: "contrast(1.2) brightness(1.1) saturate(1.1)" },
  { id: "cool", name: "Tsukuba", css: "hue-rotate(-10deg) saturate(1.2) brightness(0.95) contrast(1.1)" },
  { id: "vintage", name: "Hakone", css: "sepia(0.4) saturate(0.7) contrast(0.9) brightness(1.05)" },
  { id: "mono", name: "Akina", css: "grayscale(1) contrast(1.1) brightness(0.95)" },
  { id: "bright", name: "Haruna", css: "brightness(1.15) saturate(1.2) contrast(0.95)" },
];

export function getFilterCss(filterId) {
  return FILTERS.find((f) => f.id === filterId)?.css || "none";
}

export async function bakeFilter(imageUrl, filterCss) {
  if (!filterCss || filterCss === "none") return null;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = imageUrl;
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.filter = filterCss;
  ctx.drawImage(img, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
}

export default function PhotoFilterStrip({ photos, selectedFilter, onSelectFilter }) {
  const previewPhoto = photos[0];
  if (!previewPhoto) return null;

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground">Filters</label>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => onSelectFilter(f.id)}
            className="flex shrink-0 flex-col items-center gap-1"
          >
            <div className={`h-14 w-14 overflow-hidden rounded-lg border-2 ${selectedFilter === f.id ? "border-primary" : "border-transparent"}`}>
              <img
                src={previewPhoto}
                alt={f.name}
                className="h-full w-full object-cover"
                style={{ filter: f.css === "none" ? undefined : f.css }}
              />
            </div>
            <span className={`text-[10px] font-medium ${selectedFilter === f.id ? "text-primary" : "text-muted-foreground"}`}>
              {f.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}