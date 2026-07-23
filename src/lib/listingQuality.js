// ADR-045 §2 — Listing Quality Score (client-side live preview).
// Mirrors the authoritative server computation in base44/shared/marketplace.ts
// (computeListingQualityScore). The server value from getListing() is the
// source of truth for a saved draft; this helper powers the live preview that
// updates as the seller edits the creation wizard. Does not block publishing.

export function computeListingQuality(form) {
  const photos = Array.isArray(form.photo_urls) ? form.photo_urls.length : 0;
  const photosPoints = photos >= 8 ? 40 : photos >= 4 ? 30 : photos >= 2 ? 20 : photos >= 1 ? 10 : 0;
  const descLen = (form.description || "").length;
  const descPoints = descLen >= 150 ? 20 : descLen >= 50 ? 10 : 0;
  const hasVideo = Array.isArray(form.video_urls) && form.video_urls.length > 0;
  const videoPoints = hasVideo ? 20 : 0;
  const isVehicle = form.category === "vehicle";
  const photoOk = photosPoints === 40;
  const descOk = descPoints === 20;
  const videoOk = videoPoints === 20;

  if (isVehicle) {
    const score = Math.round(((photosPoints + descPoints + videoPoints) / 80) * 100);
    return {
      score,
      checklist: [
        { key: "photos", label: "8 or more photos", ok: photoOk },
        { key: "description", label: "Detailed description (150+ characters)", ok: descOk },
        { key: "video", label: "Video added", ok: videoOk },
      ],
    };
  }

  // Compatibility is satisfied by an active seller selection. The defaulting
  // compatible_make="Honda" does not count; compatible_model or
  // compatible_chassis_code (the ADR-042 singular fields) do.
  const compatActive =
    !!(form.compatible_model && String(form.compatible_model).trim()) ||
    !!(form.compatible_chassis_code && String(form.compatible_chassis_code).trim());
  const compatPoints = compatActive ? 20 : 0;
  const score = photosPoints + descPoints + compatPoints + videoPoints;
  return {
    score,
    checklist: [
      { key: "photos", label: "8 or more photos", ok: photoOk },
      { key: "compatibility", label: "Compatibility selected", ok: compatPoints === 20 },
      { key: "description", label: "Detailed description (150+ characters)", ok: descOk },
      { key: "video", label: "Video added", ok: videoOk },
    ],
  };
}