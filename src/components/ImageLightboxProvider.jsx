import React from "react";
import PhotoLightbox from "@/components/garage/PhotoLightbox";

/**
 * App-wide image lightbox. Any content image (not inside a link/button, not
 * flagged data-no-lightbox, and at least 100px wide) becomes clickable to open
 * a fullscreen viewer — swipe down to dismiss, swipe across for next.
 *
 * Group images into a swipeable gallery by wrapping them in a container with
 * `data-gallery="<id>"` (e.g. a listing's photo grid).
 */
export default function ImageLightboxProvider({ children }) {
  const [state, setState] = React.useState(null);

  const open = React.useCallback((photos, index = 0) => {
    if (photos && photos.length) setState({ photos, index: Math.max(0, Math.min(photos.length - 1, index)) });
  }, []);
  const close = React.useCallback(() => setState(null), []);
  const setIndex = React.useCallback((i) => setState((s) => (s ? { ...s, index: i } : s)), []);

  React.useEffect(() => {
    const onClick = (e) => {
      const img = e.target.closest("img");
      if (!img) return;
      if (img.closest("[data-no-lightbox]")) return;
      if (img.closest("[data-lightbox-root]")) return;
      if (img.closest("a, button, [role='button']")) return;
      const rect = img.getBoundingClientRect();
      if (rect.width < 100) return;
      const src = img.currentSrc || img.src;
      if (!src) return;

      const gallery = img.closest("[data-gallery]");
      let photos;
      let index;
      if (gallery) {
        const imgs = Array.from(gallery.querySelectorAll("img")).filter(
          (i) =>
            !i.closest("[data-no-lightbox]") &&
            !i.closest("a, button, [role='button']") &&
            i.getBoundingClientRect().width >= 100 &&
            (i.currentSrc || i.src)
        );
        index = imgs.indexOf(img);
        photos = index === -1 ? [src] : imgs.map((i) => i.currentSrc || i.src);
        if (index === -1) index = 0;
      } else {
        photos = [src];
        index = 0;
      }

      e.preventDefault();
      e.stopPropagation();
      open(photos, index);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [open]);

  return (
    <>
      {children}
      {state && (
        <div data-lightbox-root>
          <PhotoLightbox photos={state.photos} index={state.index} onClose={close} onIndex={setIndex} />
        </div>
      )}
    </>
  );
}