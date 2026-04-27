"use client";
import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "routing", label: "Lead Routing" },
  { id: "accounts", label: "Account View" },
  { id: "learning", label: "ICP Learning" },
  { id: "affinity", label: "Rep Affinity" },
  { id: "plays", label: "Plays" },
];

export function RoutingShell({ activeTab, onTabChange, children }) {
  return (
    <div className="relative mx-auto min-h-screen max-w-[1400px] px-8 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/40 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/60 backdrop-blur transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={2} />
            Pipeline
          </Link>
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-primary" strokeWidth={2} />
            <span className="font-display text-xl tracking-tight text-foreground">
              Outbound Routing
            </span>
          </div>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/45">
          Closed-loop · signal-triggered · multi-thread
        </div>
      </header>

      <nav className="mb-8 flex flex-wrap gap-2 border-b border-border/60 pb-px">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            className={cn(
              "relative px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] transition-colors",
              activeTab === t.id
                ? "text-foreground"
                : "text-foreground/45 hover:text-foreground/70",
            )}
          >
            {t.label}
            {activeTab === t.id && (
              <span className="absolute inset-x-3 -bottom-px h-px bg-primary" />
            )}
          </button>
        ))}
      </nav>

      {children}
    </div>
  );
}
