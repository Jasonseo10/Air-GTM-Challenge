"use client";
import { Badge } from "@/app/components/ui/badge";

const VARIANT_BY_TIER = { Hot: "ember", Warm: "amber", Cool: "primary", Low: "dust" };

export function TierBadge({ tier, className }) {
  return (
    <Badge variant={VARIANT_BY_TIER[tier] || "outline"} className={className}>
      {String(tier || "").toUpperCase()}
    </Badge>
  );
}
