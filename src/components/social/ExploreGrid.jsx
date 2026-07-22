import React from "react";
import { Play, X } from "lucide-react";
import LazyImage from "./LazyImage";
import SocialPostCard from "./SocialPostCard";

const CATEGORIES = ["All", "Builds", "Track Days", "Parts", "Meets", "Photography"];

const CATEGORY_TAGS = {
  Builds: ["build", "kswap", "bseries", "dseries", "hseries", "project"],
  "Track Days": ["track", "drag", "trackday", "circuit", "laptimer"],
  Parts: ["parts", "forsale", "oem", "aftermarket", "jdm"],
  Meets: ["meet", "carsandcoffee", "cruise", "meetup"],
  Photography: ["photography", "photo", "shoot", "stance"],
};

function matchesCategory(post, cat) {
  if (!cat || cat === "All") return true;
  const tags = CATEGORY_TAGS[cat] || [];
  const hashtags = (post.hashtags || []).map((h) => h.toLowerCase().replace("#", ""));
  const text = ((post.caption || "") + " " + (post.tags || "")).toLowerCase();
  return tags.some((t) => hashtags.includes(t) || text.includes(t));
}

export default function ExploreGrid({ posts, onDelete }) {
  const [category, setCategory] = React.useState("All");
  const [viewing, setViewing] = React.useState(null);

  const filtered = posts.filter((p) => matchesCategory(p, category));

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto border-b border-border px-3 py-2 scrollbar-hide">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-bold transition ${category === c ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground"}`}
          >
            {c}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="p-12 text-center">
          <p className="text-sm text-muted-foreground">No posts in this category yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-0.5">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => setViewing(p)}
              className="relative aspect-square overflow-hidden bg-secondary"
            >
              {p.video_url ? (
                <>
                  <LazyImage src={p.photos?.[0] || ""} className="h-full w-full" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Play className="h-6 w-6 fill-white text-white" />
                  </div>
                </>
              ) : p.photos?.[0] ? (
                <LazyImage src={p.photos[0]} className="h-full w-full" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 to-secondary p-2">
                  <span className="line-clamp-3 text-xs font-medium">{p.caption}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black" onClick={() => setViewing(null)}>
          <button
            onClick={() => setViewing(null)}
            className="fixed right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="mx-auto max-w-[600px]" onClick={(e) => e.stopPropagation()}>
            <SocialPostCard post={viewing} onDelete={(id) => { onDelete?.(id); setViewing(null); }} />
          </div>
        </div>
      )}
    </div>
  );
}