import * as React from "react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary/90 border border-transparent",
  secondary:
    "bg-foreground text-background hover:bg-foreground/90 border border-transparent",
  outline:
    "bg-card text-foreground hover:bg-muted border border-border",
  ghost:
    "bg-transparent text-foreground/70 hover:bg-muted hover:text-foreground border border-transparent",
  soft:
    "bg-primary-soft text-primary hover:bg-primary/15 border border-transparent",
  destructive:
    "bg-hot text-white hover:bg-hot/90 border border-transparent",
};

const SIZES = {
  sm: "h-7 px-2.5 text-xs rounded-md",
  md: "h-9 px-3.5 text-xs rounded-lg",
  lg: "h-11 px-5 text-sm rounded-lg",
  icon: "h-8 w-8 rounded-md",
};

export const Button = React.forwardRef(function Button(
  { className, variant = "ghost", size = "md", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex select-none items-center justify-center gap-1.5 font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
});
