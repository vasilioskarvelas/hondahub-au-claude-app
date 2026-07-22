import React from "react";
import { ImageOff } from "lucide-react";

export default function LazyImage({ src, alt = "", className = "", onClick }) {
  const ref = React.useRef(null);
  const [inView, setInView] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  if (error) {
    return (
      <div ref={ref} className={`flex items-center justify-center bg-secondary ${className}`}>
        <div className="flex flex-col items-center gap-1 text-muted-foreground">
          <ImageOff className="h-6 w-6" />
          <span className="text-xs">Failed to load</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className={`relative overflow-hidden bg-secondary ${className}`} onClick={onClick}>
      {!loaded && <div className="absolute inset-0 animate-pulse bg-secondary" />}
      {inView && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={`h-full w-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </div>
  );
}