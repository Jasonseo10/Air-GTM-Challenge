"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { ArrowUpRight, ArrowDownRight, Minus, Sparkles, History, Undo2 } from "lucide-react";

function DeltaArrow({ oldW, newW }) {
  if (newW > oldW) return <ArrowUpRight className="h-3.5 w-3.5 text-mint" />;
  if (newW < oldW) return <ArrowDownRight className="h-3.5 w-3.5 text-ember" />;
  return <Minus className="h-3.5 w-3.5 text-foreground/30" />;
}

export function WeightUpdatePanel({ data, pointer, onRefit, onPromote, onRollback, busy }) {
  const [showInsufficient, setShowInsufficient] = useState(false);
  const updates = data?.updates || [];
  const sufficient = updates.filter((u) => u.sufficient_evidence);
  const insufficient = updates.filter((u) => !u.sufficient_evidence);
  const proposedNewVersion = data?.proposed_rules?.version;
  const baseline = data?.baseline_win_rate || 0;
  const terminalN = data?.n_dispositions_terminal || 0;
  const willChange = sufficient.filter((u) => u.new_weight !== u.old_weight).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="px-5 py-4">
          <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-foreground/50">
            Active version
          </div>
          <div className="mt-1 font-mono text-[13px] text-foreground/85">
            {(pointer?.active_version || "").split("/").pop()}
          </div>
        </Card>
        <Card className="px-5 py-4">
          <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-foreground/50">
            Baseline win rate
          </div>
          <div className="mt-1 font-display text-2xl text-foreground">
            {(baseline * 100).toFixed(1)}%
          </div>
          <div className="mt-0.5 text-[10px] text-foreground/45">
            across {terminalN} terminal dispositions
          </div>
        </Card>
        <Card className="px-5 py-4">
          <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-foreground/50">
            Eligible deltas
          </div>
          <div className="mt-1 font-display text-2xl text-foreground">{willChange}</div>
          <div className="mt-0.5 text-[10px] text-foreground/45">
            rules with sufficient evidence + non-zero change
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onRefit} disabled={busy}>
            {busy ? "Running…" : "Re-run feedback"}
          </Button>
          <Button
            variant={willChange > 0 ? "primary" : "ghost"}
            onClick={onPromote}
            disabled={busy || willChange === 0}
          >
            <Sparkles className="h-3 w-3" strokeWidth={2} />
            Promote to v{proposedNewVersion || "?"}
          </Button>
        </div>
        <button
          onClick={() => setShowInsufficient((s) => !s)}
          className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45 hover:text-foreground/70"
        >
          {showInsufficient ? "Hide" : "Show"} insufficient-evidence rules
        </button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead className="border-b border-border/60 bg-foreground/[0.025] font-mono text-[9px] uppercase tracking-[0.24em] text-foreground/50">
            <tr>
              <th className="px-4 py-3 text-left">Rule</th>
              <th className="px-4 py-3 text-right">Matched</th>
              <th className="px-4 py-3 text-right">Won</th>
              <th className="px-4 py-3 text-right">Win rate</th>
              <th className="px-4 py-3 text-right">Lift</th>
              <th className="px-4 py-3 text-right">Old</th>
              <th className="px-4 py-3 text-center"></th>
              <th className="px-4 py-3 text-right">New</th>
            </tr>
          </thead>
          <tbody>
            {sufficient.map((u) => (
              <tr key={u.rule_id} className="border-t border-border/40">
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{u.rule_id}</div>
                  <div className="mt-0.5 text-[11px] text-foreground/55">{u.description}</div>
                </td>
                <td className="px-4 py-3 text-right font-mono">{u.matched_n}</td>
                <td className="px-4 py-3 text-right font-mono text-mint">{u.won_n}</td>
                <td className="px-4 py-3 text-right font-mono">{(u.win_rate * 100).toFixed(0)}%</td>
                <td className="px-4 py-3 text-right font-mono">
                  <span className={u.lift > 1.1 ? "text-mint" : u.lift < 0.9 ? "text-ember" : "text-foreground/55"}>
                    {u.lift.toFixed(2)}×
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-foreground/55">{u.old_weight}</td>
                <td className="px-4 py-3 text-center"><DeltaArrow oldW={u.old_weight} newW={u.new_weight} /></td>
                <td className="px-4 py-3 text-right font-mono text-foreground">
                  <span className={u.new_weight > u.old_weight ? "text-mint" : u.new_weight < u.old_weight ? "text-ember" : ""}>
                    {u.new_weight}
                  </span>
                </td>
              </tr>
            ))}
            {showInsufficient &&
              insufficient.map((u) => (
                <tr key={u.rule_id} className="border-t border-border/40 opacity-60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground/80">{u.rule_id}</span>
                      <Badge variant="outline" className="text-[9px]">insufficient</Badge>
                    </div>
                    <div className="mt-0.5 text-[11px] text-foreground/45">{u.description}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{u.matched_n}</td>
                  <td className="px-4 py-3 text-right font-mono">{u.won_n}</td>
                  <td className="px-4 py-3 text-right font-mono">—</td>
                  <td className="px-4 py-3 text-right font-mono">—</td>
                  <td className="px-4 py-3 text-right font-mono">{u.old_weight}</td>
                  <td className="px-4 py-3 text-center"><Minus className="mx-auto h-3.5 w-3.5 text-foreground/30" /></td>
                  <td className="px-4 py-3 text-right font-mono">{u.new_weight}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-5">
        <CardHeader className="px-0 pt-0">
          <div className="mb-1 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.24em] text-foreground/50">
            <History className="h-3 w-3" /> Promotion history
          </div>
          <CardTitle className="text-base">Audit trail</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <ol className="space-y-2 text-[12px]">
            {(pointer?.history || []).slice().reverse().map((h, i) => {
              const isActive = h.version_path === pointer?.active_version;
              return (
                <li key={i} className="rounded-lg border border-border/40 bg-background/30 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-foreground/85">{h.version_path.split("/").pop()}</span>
                      {isActive && (
                        <Badge variant="outline" className="text-[9px] text-mint border-mint/40">active</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-foreground/45">{h.promoted_at?.slice(0, 16).replace("T", " ")}</span>
                      {!isActive && onRollback && (
                        <Button
                          variant="ghost"
                          onClick={() => onRollback(h.version_path)}
                          disabled={busy}
                          className="h-7 px-2 text-[10px] uppercase tracking-[0.18em]"
                        >
                          <Undo2 className="h-3 w-3" strokeWidth={2} />
                          Roll back
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 text-[11px] text-foreground/55">
                    by {h.promoted_by} — {h.note}
                  </div>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
