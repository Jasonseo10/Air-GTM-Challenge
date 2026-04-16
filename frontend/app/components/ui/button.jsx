import * as React from "react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  primary:
    "bg-primary text-primary-foreground shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.6)] hover:bg-primary/90 border border-primary/20",
  ghost:
    "bg-transparent text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground border border-transparent",
  outline:
    "bg-background/40 backdrop-blur-xl border border-border/60 text-foreground/80 hover:bg-foreground/[0.04] hover:text-foreground hover:border-border",
  soft:
    "bg-primary/15 text-primary border border-primary/25 hover:bg-primary/20",
  ember:
    "bg-ember/15 text-ember border border-ember/30 hover:bg-ember/25",
  destructive:
    "bg-ember/90 text-primary-foreground hover:bg-ember border border-ember/30",
};

const SIZES = {
  sm: "h-8 px-3 text-[11px] rounded-lg",
  md: "h-10 px-4 text-xs rounded-xl",
  lg: "h-12 px-6 text-sm rounded-xl",
  icon: "h-9 w-9 rounded-lg",
};

export const Button = React.forwardRef(function Button(
  { className, variant = "ghost", size = "md", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 font-medium uppercase tracking-[0.14em]",
        "transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
});
