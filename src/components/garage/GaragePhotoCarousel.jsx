import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function GaragePhotoCarousel({ photos = [], alt = "", onPhotoClick }) {
  const [index, setIndex] = React.useState(0);

  if (!photos.length) return null;
  if (photos.length === 1) {
    return (
      <img
        src={photos[0]}
        alt={alt}
        data-no-lightbox
        className="aspect-[16/9] w-full cursor-zoom-in object-cover"
        onClick={() => onPhotoClick?.(0)}
      />
    );
  }

  const prev = (e) => { e.stopPropagation(); setIndex((i) => (i - 1 + photos.length) % photos.length); };
  const next = (e) => { e.stopPropagation(); setIndex((i) => (i + 1) % photos.length); };

  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden bg-black">
      <img
        src={photos[index]}
        alt={`${alt} ${index + 1}`}
        data-no-lightbox
        className="h-full w-full cursor-zoom-in object-cover"
        onClick={() => onPhotoClick?.(index)}
      />

      <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white backdrop-blur transition hover:bg-black/70">
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white backdrop-blur transition hover:bg-black/70">
        <ChevronRight className="h-5 w-5" />
      </button>

      <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
        {photos.map((_, i) => (
          <button
            key={i}
            onClick={(e) => { e.stopPropagation(); setIndex(i); }}
            className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-primary" : "w-1.5 bg-white/50"}`}
          />
        ))}
      </div>

      <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
        {index + 1}/{photos.length}
      </span>
    </div>
  );
}