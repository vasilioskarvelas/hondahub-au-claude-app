import React from "react";
import { ChevronRight } from "lucide-react";

export function SettingsSection({ title, children, action }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {action}
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">{children}</div>
    </div>
  );
}

export function SettingsRow({ icon: Icon, label, sublabel, right, onClick, last }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left ${onClick ? "active:bg-secondary/50" : ""} ${last ? "" : "border-b border-border"}`}
    >
      {Icon && <Icon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{label}</div>
        {sublabel && <div className="truncate text-xs text-muted-foreground">{sublabel}</div>}
      </div>
      {right === "chevron" ? (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      ) : (
        right
      )}
    </Comp>
  );
}