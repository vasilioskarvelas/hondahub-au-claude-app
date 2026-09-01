import React from "react";
import { pretty } from "@/lib/garage";

const SALE_META = {
  not_for_sale: "text-muted-foreground",
  considering_offers: "text-amber-400",
  for_sale: "text-emerald-400",
  sold: "text-destructive",
};

export function SaleStatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-semibold ${SALE_META[status] || "text-muted-foreground"}`}>
      {pretty(status)}
    </span>
  );
}

export function BuildStatusBadge({ status }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-semibold text-foreground">
      {pretty(status)}
    </span>
  );
}

export function OwnershipBadge({ status }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
      {pretty(status)}
    </span>
  );
}

export function ModCategoryBadge({ category }) {
  return (
    <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
      {pretty(category)}
    </span>
  );
}

export function InstallationTypeBadge({ type }) {
  return (
    <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {pretty(type)}
    </span>
  );
}