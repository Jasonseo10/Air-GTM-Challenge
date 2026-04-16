import * as React from "react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  outline: "border border-border bg-card text-foreground/70",
  muted: "border-transparent bg-muted text-foreground/70",
  primary: "border border-primary/20 bg-primary-soft text-primary",
  hot: "border border-hot/25 bg-hot/10 text-hot",
  warm: "border border-warm/30 bg-warm/10 text-warm",
  cool: "border border-cool/25 bg-cool/10 text-cool",
  low: "border border-low/30 bg-low/10 text-low",
};

export function Badge({ className, variant = "outline", ...props }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-medium",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Dot({ className, ...props }) {
  return (
    <span
      className={cn("inline-block h-1.5 w-1.5 rounded-full", className)}
      {...props}
    />
  );
}
