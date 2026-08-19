import React from "react";
import Giveaway from "@/pages/Giveaway";
import PartnerDiscounts from "@/pages/PartnerDiscounts";

/**
 * Combined Shop + Giveaways category. The active giveaway renders as the hero
 * at the top; partner discounts follow below it as the shop section.
 */
export default function Shop() {
  return (
    <div className="space-y-8">
      <Giveaway />
      <PartnerDiscounts />
    </div>
  );
}