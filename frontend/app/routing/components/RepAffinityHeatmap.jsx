"use client";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";

export function RepAffinityHeatmap({ affinity, team }) {
  const reps = team?.reps || [];

  // Collect all (vertical, persona) cells that have data, sorted by total volume.
  const { verticals, personas, lookup } = useMemo(() => {
    const v = new Set();
    const p = new Set();
    const lookup = {};
    for (const [repId, byVert] of Object.entries(affinity || {})) {
      lookup[repId] = {};
      for (const [vert, bySen] of Object.entries(byVert)) {
        v.add(vert);
        for (const [sen, cell] of Object.entries(bySen)) {
          p.add(sen);
          lookup[repId][`${vert}::${sen}`] = cell;
        }
      }
    }
    return {
      verticals: [...v].sort(),
      personas: [...p].sort((a, b) => {
        // sort by seniority order
        const order = ["C-Level", "VP", "Director", "Manager", "Other"];
        return order.indexOf(a) - order.indexOf(b);
      }),
      lookup,
    };
  }, [affinity]);

  if (!reps.length) {
    return (
      <Card className="p-8 text-center text-foreground/45">
        Team data not loaded.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-6">
      <CardHeader className="px-0 pt-0">
        <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.24em] text-foreground/50">
          Win rate by rep · vertical · persona
        </div>
        <CardTitle className="text-xl">Rep affinity matrix</CardTitle>
        <div className="mt-1 text-[12px] text-foreground/60">
          Computed from disposition history. Drives the past_wins lift in the matcher.
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-[11px]">
            <thead>
              <tr>
                <th className="sticky left-0 bg-card px-3 py-2 text-left font-mono text-[9px] uppercase tracking-[0.24em] text-foreground/50">
                  Rep · Vertical
                </th>
                {personas.map((sen) => (
                  <th key={sen} className="px-3 py-2 text-center font-mono text-[9px] uppercase tracking-[0.24em] text-foreground/50">
                    {sen}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reps.map((rep) => {
                const repLookup = lookup[rep.rep_id] || {};
                const repVerticals = verticals.filter((v) =>
                  personas.some((sen) => repLookup[`${v}::${sen}`])
                );
                if (repVerticals.length === 0) {
                  return (
                    <tr key={rep.rep_id} className="border-t border-border/40">
                      <td className="sticky left-0 bg-card px-3 py-2 font-medium text-foreground/55">
                        {rep.name} <span className="font-mono text-[10px] text-foreground/35">no wins yet</span>
                      </td>
                      {personas.map((sen) => (
                        <td key={sen} className="px-3 py-2 text-center text-foreground/25">—</td>
                      ))}
                    </tr>
                  );
                }
                return repVerticals.map((vert, vi) => (
                  <tr key={`${rep.rep_id}-${vert}`} className="border-t border-border/40">
                    <td className="sticky left-0 bg-card px-3 py-2">
                      {vi === 0 && <span className="font-medium text-foreground">{rep.name}</span>}
                      <div className={vi === 0 ? "mt-0.5 text-[11px] text-foreground/55" : "text-[11px] text-foreground/55"}>
                        {vert}
                      </div>
                    </td>
                    {personas.map((sen) => {
                      const cell = repLookup[`${vert}::${sen}`];
                      if (!cell) {
                        return <td key={sen} className="px-3 py-2 text-center text-foreground/25">—</td>;
                      }
                      const winRate = cell.win_rate || 0;
                      const intensity = Math.min(1, winRate / 0.6);
                      const bg = winRate >= 0.5
                        ? `hsl(155 70% 45% / ${0.10 + intensity * 0.45})`
                        : winRate >= 0.25
                          ? `hsl(32 90% 56% / ${0.10 + intensity * 0.4})`
                          : `hsl(10 70% 60% / ${0.10 + intensity * 0.4})`;
                      return (
                        <td key={sen} className="px-1 py-1 text-center">
                          <div
                            className="mx-auto rounded-md px-2 py-1.5"
                            style={{ background: bg }}
                            title={`${cell.won_n}/${cell.n} won · avg $${(cell.avg_acv/1000).toFixed(0)}k`}
                          >
                            <div className="font-mono text-[12px] font-semibold text-foreground">
                              {(winRate * 100).toFixed(0)}%
                            </div>
                            <div className="font-mono text-[9px] text-foreground/55">
                              {cell.won_n}/{cell.n}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
