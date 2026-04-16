import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = React.forwardRef(function Card({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/60 bg-card/55 backdrop-blur-2xl",
        "shadow-[0_1px_0_0_hsl(var(--foreground)/0.04)_inset,0_30px_60px_-20px_hsl(0_0%_0%/0.5)]",
        className,
      )}
      {...props}
    />
  );
});

export function CardHeader({ className, ...props }) {
  return <div className={cn("p-6", className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return (
    <h3
      className={cn(
        "font-display text-2xl font-normal tracking-tight text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }) {
  return (
    <p
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}
