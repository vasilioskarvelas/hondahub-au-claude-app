import React from "react";
import { Check } from "lucide-react";
import { STEP_LABELS } from "./constants";

export default function ProgressBar({ steps, currentIndex, onJump }) {
  const total = steps.length;
  const pct = total > 1 ? Math.round((currentIndex / (total - 1)) * 100) : 0;
  return (
    <div className="space-y-2">
      {/* Mobile: "Step X of Y" + thin bar */}
      <div className="md:hidden">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="text-primary">Step {currentIndex + 1} of {total}</span>
          <span className="text-muted-foreground">{STEP_LABELS[steps[currentIndex]]}</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {/* Desktop: numbered dots + labels, clickable to go back */}
      <div className="hidden items-center md:flex">
        {steps.map((key, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          const reachable = i <= currentIndex;
          return (
            <React.Fragment key={key}>
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onJump?.(i)}
                className={`flex items-center gap-1.5 text-xs font-bold ${active ? "text-primary" : "text-muted-foreground"} ${reachable ? "cursor-pointer" : "cursor-default"}`}
              >
                <span className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] ${active ? "border-primary bg-primary text-primary-foreground" : done ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground/50"}`}>
                  {done ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className="hidden lg:inline">{STEP_LABELS[key]}</span>
              </button>
              {i < steps.length - 1 && <span className={`mx-1 h-px flex-1 min-w-2 ${i < currentIndex ? "bg-primary/40" : "bg-border"}`} />}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}