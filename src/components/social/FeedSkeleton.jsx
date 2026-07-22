import React from "react";

export default function FeedSkeleton() {
  return (
    <div className="divide-y divide-border">
      {[0, 1, 2].map((i) => (
        <div key={i} className="w-full">
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-secondary" />
            <div className="flex-1 space-y-1">
              <div className="h-3 w-24 animate-pulse rounded bg-secondary" />
              <div className="h-2 w-16 animate-pulse rounded bg-secondary/60" />
            </div>
            <div className="h-6 w-6 animate-pulse rounded bg-secondary" />
          </div>
          <div className="aspect-square w-full animate-pulse bg-secondary" />
          <div className="flex items-center gap-4 px-3 py-2">
            <div className="h-6 w-6 animate-pulse rounded bg-secondary" />
            <div className="h-6 w-6 animate-pulse rounded bg-secondary" />
            <div className="h-6 w-6 animate-pulse rounded bg-secondary" />
            <div className="ml-auto h-6 w-6 animate-pulse rounded bg-secondary" />
          </div>
          <div className="space-y-2 px-3 pb-3">
            <div className="h-3 w-20 animate-pulse rounded bg-secondary" />
            <div className="h-3 w-full animate-pulse rounded bg-secondary" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-secondary" />
          </div>
        </div>
      ))}
    </div>
  );
}