"use client";
import { motion } from "framer-motion";
import { ArrowUpRight, Flame, Sparkles, Users, Zap } from "lucide-react";
import { Badge } from "@/app/components/ui/badge";
import { Card } from "@/app/components/ui/card";

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } },
};

const ICONS = { Flame, Sparkles, Users, Zap };

export function GlassMetricsBlock({ eyebrow = "realtime insights", metrics = [] }) {
  return (
    <section className="relative overflow-hidden">
      {/* ambient light blooms */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-20 top-0 h-[380px] w-[380px] rounded-full bg-primary/[0.07] blur-[120px]" />
        <div className="absolute right-0 top-1/2 h-[420px] w-[420px] -translate-y-1/2 rounded-full bg-ember/[0.06] blur-[140px]" />
      </div>

      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        transition={{ staggerChildren: 0.08 }}
        className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
      >
        {metrics.map((m, i) => {
          const Icon = ICONS[m.icon] || Sparkles;
          const deltaPositive = (m.delta || "").startsWith("+");
          return (
            <motion.div key={m.label + i} variants={fadeUp}>
              <Card className="group relative overflow-hidden p-7 transition-transform duration-300 hover:-translate-y-1">
                <div className="absolute inset-0 bg-gradient-to-br from-foreground/[0.05] via-transparent to-transparent" />
                <div className="relative z-10 space-y-5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-foreground/55">
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                      {m.label}
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-foreground/30 transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-foreground/70" />
                  </div>
                  <div className="flex items-end gap-3">
                    <span className="font-display text-[44px] font-light leading-none tracking-tight text-foreground">
                      {m.value}
                    </span>
                    {m.delta && (
                      <Badge
                        variant={deltaPositive ? "mint" : "dust"}
                        className="mb-2 text-[9px]"
                      >
                        {m.delta}
                      </Badge>
                    )}
                  </div>
                  {m.description && (
                    <p className="text-xs leading-relaxed text-foreground/55">
                      {m.description}
                    </p>
                  )}
                </div>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>

      {eyebrow && (
        <div className="mt-6 flex items-center gap-3">
          <Zap className="h-3 w-3 text-foreground/40" strokeWidth={1.5} />
          <span className="text-[10px] uppercase tracking-[0.28em] text-foreground/45">
            {eyebrow}
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-border/70 to-transparent" />
        </div>
      )}
    </section>
  );
}
