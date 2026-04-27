"use client";
import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { RoutingShell } from "./components/RoutingShell";
import { TopTiles } from "./components/TopTiles";
import { LeadRoutingTable } from "./components/LeadRoutingTable";
import { AccountBundleCard } from "./components/AccountBundleCard";
import { WeightUpdatePanel } from "./components/WeightUpdatePanel";
import { RepAffinityHeatmap } from "./components/RepAffinityHeatmap";
import { PlayLibraryFromRouted } from "./components/PlayLibrary";
import { Button } from "@/app/components/ui/button";
import { Card } from "@/app/components/ui/card";
import { RefreshCw, AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";

export default function RoutingPage() {
  const [tab, setTab] = useState("routing");
  const [routing, setRouting] = useState({
    routed_leads: [], account_plays: [], scored_leads: [], team: { reps: [] },
  });
  const [feedback, setFeedback] = useState({
    weight_updates: { updates: [] }, rep_affinity: {},
    pointer: { active_version: "", history: [] },
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);
  const [rulesChanged, setRulesChanged] = useState(false);

  const showToast = (kind, text) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, fRes] = await Promise.all([
        fetch("/api/outbound/route"),
        fetch("/api/outbound/feedback"),
      ]);
      const rData = await rRes.json();
      const fData = await fRes.json();
      setRouting(rData);
      setFeedback(fData);
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const onRunRouting = async () => {
    setBusy("routing");
    try {
      const r = await fetch("/api/outbound/route", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Routing failed");
      setRouting(d);
      setRulesChanged(false);
      showToast("ok", `Routed ${d.routed_leads.length} leads across ${d.account_plays.length} accounts.`);
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setBusy(null);
    }
  };

  const onRefit = async () => {
    setBusy("feedback");
    try {
      const r = await fetch("/api/outbound/feedback", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Refit failed");
      setFeedback(d);
      showToast("ok", `Refit complete — ${d.weight_updates.updates.filter(u => u.sufficient_evidence).length} rules with sufficient evidence.`);
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setBusy(null);
    }
  };

  const onRollback = async (versionPath) => {
    if (!confirm(`Roll back active scoring rules to ${versionPath.split("/").pop()}?`)) return;
    setBusy("promote");
    try {
      const r = await fetch("/api/outbound/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_path: versionPath, note: "rolled back from dashboard" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Rollback failed");
      setRulesChanged(true);
      // Auto re-run feedback so the Learning tab reflects the new active baseline.
      const fRes = await fetch("/api/outbound/feedback", { method: "POST" });
      const fData = await fRes.json();
      if (fRes.ok) setFeedback(fData);
      showToast("ok", `Rolled back to ${d.rolled_back_to.split("/").pop()}. Re-run routing to refresh lead scores.`);
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setBusy(null);
    }
  };

  const onPromote = async () => {
    if (!confirm("Promote the proposed weights to a new version? This updates the active scoring rules for the next pipeline run.")) return;
    setBusy("promote");
    try {
      const r = await fetch("/api/outbound/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "promoted from dashboard refit" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Promote failed");
      setRulesChanged(true);
      // Refresh feedback to show new pointer history.
      const fRes = await fetch("/api/outbound/feedback");
      setFeedback(await fRes.json());
      showToast("ok", `Promoted ${d.promoted_version}. Re-run routing to refresh lead scores.`);
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <RoutingShell activeTab={tab} onTabChange={setTab}>
      <TopTiles
        routed={routing.routed_leads}
        accountPlays={routing.account_plays}
        team={routing.team}
      />

      <div className="mb-4 flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/50">
          {loading ? "Loading…" :
            tab === "routing"  ? `${routing.routed_leads.length} leads · ${routing.team.reps?.length || 0} reps` :
            tab === "accounts" ? `${routing.account_plays.length} bundled accounts` :
            tab === "learning" ? `${(feedback.weight_updates.updates || []).length} rules evaluated` :
            tab === "affinity" ? `${Object.keys(feedback.rep_affinity || {}).length} reps with disposition history` :
            tab === "plays"    ? `${countPlays(routing.routed_leads)} distinct plays applied` : ""}
        </div>
        {tab === "routing" && (
          <Button variant="outline" onClick={onRunRouting} disabled={busy === "routing"}>
            <RefreshCw className={`h-3 w-3 ${busy === "routing" ? "animate-spin" : ""}`} strokeWidth={2} />
            {busy === "routing" ? "Re-running…" : "Re-run routing"}
          </Button>
        )}
      </div>

      {rulesChanged && tab !== "learning" && (
        <Card className="mb-4 flex items-center justify-between gap-3 border-amber-400/40 bg-amber-400/10 px-4 py-3">
          <div className="flex items-center gap-2 text-[12.5px] text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span>
              Active scoring rules changed. Lead scores below are still using the previous version —
              re-run routing to refresh.
            </span>
          </div>
          <Button
            variant="outline"
            onClick={onRunRouting}
            disabled={busy === "routing"}
            className="shrink-0"
          >
            <RefreshCw className={`h-3 w-3 ${busy === "routing" ? "animate-spin" : ""}`} strokeWidth={2} />
            {busy === "routing" ? "Re-running…" : "Re-run pipeline now"}
          </Button>
        </Card>
      )}

      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {tab === "routing" && (
          <LeadRoutingTable routed={routing.routed_leads} team={routing.team} />
        )}
        {tab === "accounts" && (
          <div className="space-y-4">
            {routing.account_plays.length === 0 && (
              <Card className="p-8 text-center text-foreground/45">
                No bundled accounts yet — run the routing pipeline.
              </Card>
            )}
            {routing.account_plays.map((p) => (
              <AccountBundleCard key={p.account_id} play={p} />
            ))}
          </div>
        )}
        {tab === "learning" && (
          <WeightUpdatePanel
            data={feedback.weight_updates}
            pointer={feedback.pointer}
            onRefit={onRefit}
            onPromote={onPromote}
            onRollback={onRollback}
            busy={busy === "feedback" || busy === "promote"}
          />
        )}
        {tab === "affinity" && (
          <RepAffinityHeatmap
            affinity={feedback.rep_affinity}
            team={routing.team}
          />
        )}
        {tab === "plays" && (
          <PlayLibraryFromRouted routedLeads={routing.routed_leads} />
        )}
      </motion.div>

      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border px-4 py-3 text-[12.5px] backdrop-blur ${
            toast.kind === "error"
              ? "border-ember/40 bg-ember/10 text-ember"
              : "border-mint/40 bg-mint/10 text-mint"
          }`}
        >
          {toast.kind === "error"
            ? <AlertCircle className="h-3.5 w-3.5" />
            : <CheckCircle2 className="h-3.5 w-3.5" />}
          {toast.text}
        </motion.div>
      )}
    </RoutingShell>
  );
}

function countPlays(routed) {
  return new Set((routed || []).map((r) => r.play_id).filter(Boolean)).size;
}
