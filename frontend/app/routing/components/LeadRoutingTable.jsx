"use client";
import { useState, useMemo } from "react";
import { Card } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Search, Mail, Building2 } from "lucide-react";
import { TierBadge } from "./TierBadge";
import { SignalChips } from "./SignalChips";
import { WhyThisRep } from "./WhyThisRep";

export function LeadRoutingTable({ routed, team }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const reps = team.reps || [];

  const filtered = useMemo(() => {
    return routed.filter((r) => {
      if (filter !== "all" && r.outbound_tier !== filter) return false;
      if (filter.startsWith("rep:") && r.rep_id !== filter.slice(4)) return false;
      if (query) {
        const q = query.toLowerCase();
        const hay = `${r.lead_name || ""} ${r.lead_email} ${r.company || ""} ${r.title || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [routed, filter, query]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search leads, companies, titles…"
            className="w-full rounded-xl border border-border/60 bg-background/40 px-9 py-2 text-[13px] text-foreground placeholder:text-foreground/40 focus:border-primary/60 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["all", "Hot", "Warm", "Cool"].map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`rounded-lg border px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] transition-colors ${
                filter === t
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border/60 bg-background/40 text-foreground/60 hover:text-foreground"
              }`}
            >
              {t === "all" ? "All" : t}
            </button>
          ))}
          <span className="mx-1 h-6 w-px self-center bg-border/60" />
          {reps.map((r) => (
            <button
              key={r.rep_id}
              onClick={() => setFilter(`rep:${r.rep_id}`)}
              className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-medium normal-case tracking-normal transition-colors ${
                filter === `rep:${r.rep_id}`
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border/60 bg-background/40 text-foreground/60 hover:text-foreground"
              }`}
            >
              {r.name.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="border-b border-border/60 bg-foreground/[0.025] font-mono text-[9px] uppercase tracking-[0.24em] text-foreground/50">
            <tr>
              <th className="px-4 py-3 text-left">Lead</th>
              <th className="px-4 py-3 text-left">Account</th>
              <th className="px-4 py-3 text-left">Signals</th>
              <th className="px-4 py-3 text-left">Tier</th>
              <th className="px-4 py-3 text-left">Rep</th>
              <th className="px-4 py-3 text-right">Fit</th>
              <th className="px-4 py-3 text-left">Play</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr
                key={r.lead_email + i}
                className="border-t border-border/40 hover:bg-foreground/[0.02]"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">
                    {r.lead_name || "(no name)"}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-foreground/45">
                    <Mail className="h-2.5 w-2.5" /> {r.lead_email}
                  </div>
                  {r.title && (
                    <div className="mt-0.5 text-[11px] text-foreground/55">{r.title}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 text-foreground/80">
                    <Building2 className="h-3 w-3 text-foreground/40" />
                    {r.company || r.account_id}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-foreground/45">
                    {r.account_id}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <SignalChips signals={r.signals || []} />
                </td>
                <td className="px-4 py-3">
                  <TierBadge tier={r.outbound_tier} />
                  <div className="mt-1 font-mono text-[10px] text-foreground/45">
                    score {r.outbound_score}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground/85">{r.rep_name}</div>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-mono text-[14px] font-semibold text-primary">
                    {r.fit_score}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {r.play_id ? (
                    <Badge variant="solid" className="normal-case tracking-normal">
                      {r.play_id.replace(/_/g, " ")}
                    </Badge>
                  ) : (
                    <span className="text-foreground/35">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Button variant="outline" size="sm" onClick={() => setSelected(r)}>
                    Why
                  </Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-foreground/45">
                  No leads match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <WhyThisRep open={!!selected} onClose={() => setSelected(null)} lead={selected} />
    </>
  );
}
