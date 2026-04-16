import * as React from "react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  outline:
    "border-border/60 bg-background/55 text-foreground/70 backdrop-blur",
  solid:
    "border-transparent bg-foreground/[0.06] text-foreground/80",
  primary:
    "border-primary/30 bg-primary/15 text-primary",
  ember:
    "border-ember/30 bg-ember/15 text-ember",
  amber:
    "border-amber/30 bg-amber/15 text-amber",
  mint:
    "border-mint/30 bg-mint/15 text-mint",
  dust:
    "border-dust/30 bg-dust/10 text-dust",
};

export function Badge({ className, variant = "outline", ...props }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em]",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
