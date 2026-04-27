"use client";
import { Card } from "@/app/components/ui/card";

function Tile({ label, value, sub }) {
  return (
    <Card className="px-5 py-4">
      <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.24em] text-foreground/50">
        {label}
      </div>
      <div className="font-display text-3xl text-foreground">{value}</div>
      {sub && (
        <div className="mt-0.5 text-[11px] text-foreground/55">{sub}</div>
      )}
    </Card>
  );
}

export function TopTiles({ routed, accountPlays, team }) {
  const totalReps = team.reps?.length || 0;
  const repLoad = {};
  for (const r of routed) {
    repLoad[r.rep_id] = (repLoad[r.rep_id] || 0) + 1;
  }
  const utilizations = (team.reps || []).map((r) => {
    const incoming = repLoad[r.rep_id] || 0;
    const total = r.capacity_current + incoming;
    return r.capacity_max ? (total / r.capacity_max) * 100 : 0;
  });
  const avgUtil = utilizations.length
    ? utilizations.reduce((a, b) => a + b, 0) / utilizations.length
    : 0;
  const fitScores = routed.map((r) => r.fit_score || 0);
  const avgFit = fitScores.length
    ? fitScores.reduce((a, b) => a + b, 0) / fitScores.length
    : 0;

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile label="Leads to route" value={routed.length} sub={`${totalReps} reps available`} />
      <Tile label="Accounts bundled" value={accountPlays.length}
            sub={`${accountPlays.reduce((a, p) => a + p.supporting_leads.length + 1, 0)} contacts`} />
      <Tile label="Avg fit score" value={avgFit.toFixed(0)} sub="hard + persona + qual" />
      <Tile label="Avg rep utilization" value={`${avgUtil.toFixed(0)}%`}
            sub="post-routing projection" />
    </div>
  );
}
