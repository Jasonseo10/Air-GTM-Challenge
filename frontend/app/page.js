"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import {
  Upload, Search, SlidersHorizontal, ArrowLeft, Download, CheckCircle2, X,
  ArrowRight, AlertCircle, GitMerge, RotateCcw, ChevronRight, FileText,
  Plus, Minus,
} from "lucide-react";
import PipelineOrbital from "./components/PipelineOrbital";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Badge, Dot } from "@/app/components/ui/badge";
import { cn } from "@/lib/utils";

async function readErr(res, fallback) {
  const text = await res.text();
  try { return JSON.parse(text).error || fallback; }
  catch { return text.slice(0, 200) || `${fallback} (HTTP ${res.status})`; }
}

/* ════════════ PIPELINE STAGES (for orbital viz) ════════════ */
const PIPELINE_STAGES = [
  {
    id: 1, title: "Upload", icon: "upload", duration: "< 1s",
    description: "Drop a messy CSV. Normalization (lowercasing, trimming, country-code standardization) and hash-based dedupe run automatically on ingest.",
    relatedIds: [2],
  },
  {
    id: 2, title: "Enrich", icon: "enrich", duration: "~1-3s",
    description: "Mock Clearbit/ZoomInfo-style API adds company size, industry, and estimated revenue. Retries with exponential backoff on transient failures.",
    relatedIds: [1, 3],
  },
  {
    id: 3, title: "Score", icon: "score", duration: "~20ms",
    description: "10 ICP criteria weighted to 100%. Each lead gets a 0-100 score and a tier (HOT / WARM / COOL / LOW). Adjust weights live on the results screen.",
    relatedIds: [2, 4],
  },
  {
    id: 4, title: "Export", icon: "export", duration: "instant",
    description: "Salesforce Bulk API CSV + REST composite JSON. Export all, only the current filter, or a single lead from its detail view.",
    relatedIds: [3],
  },
];

/* ════════════ ICP SCORING ════════════ */

const TARGET_INDUSTRIES = new Set([
  "SaaS", "Marketing Technology", "Creative Operations",
  "Developer Tools", "E-commerce",
]);

const DEF_W = {
  pageVisits:      { label: "Pricing / Demo Page Visits",        w: 10 },
  signupIntent:    { label: "Signup / Payment Intent",           w: 15 },
  creditUsage:     { label: "Free-Credit Usage",                 w: 10 },
  assetUploads:    { label: "Asset Upload Volume",               w: 10 },
  teamCollab:      { label: "Team Collaboration Depth",          w: 10 },
  companySize:     { label: "Company Size Fit",                  w: 10 },
  industryMatch:   { label: "Industry Match",                    w: 10 },
  mktgCreative:    { label: "Marketing / Creative Team",         w: 10 },
  channelExpansion:{ label: "Channel Expansion",                 w: 10 },
  creativeHiring:  { label: "Creative Hiring Signals",           w: 5  },
};

function scoreLead(lead, W) {
  let total = 0;
  const b = {};
  const pv = lead.pricing_page_views || 0; const pvW = W.pageVisits.w;
  if (pv >= 20) b.pageVisits = pvW;
  else if (pv >= 10) b.pageVisits = Math.round(pvW * 0.7);
  else if (pv >= 3) b.pageVisits = Math.round(pvW * 0.4);
  else b.pageVisits = Math.round(pvW * 0.15);

  const siW = W.signupIntent.w;
  const src = (lead.source || "").toLowerCase();
  if (lead.has_signup_intent && src.includes("product signup")) b.signupIntent = siW;
  else if (lead.has_signup_intent) b.signupIntent = Math.round(siW * 0.7);
  else if (src.includes("event") || src.includes("referral")) b.signupIntent = Math.round(siW * 0.4);
  else b.signupIntent = Math.round(siW * 0.15);

  const cu = lead.credit_usage_pct || 0; const cuW = W.creditUsage.w;
  if (cu >= 80) b.creditUsage = cuW;
  else if (cu >= 50) b.creditUsage = Math.round(cuW * 0.7);
  else if (cu >= 20) b.creditUsage = Math.round(cuW * 0.4);
  else b.creditUsage = Math.round(cuW * 0.15);

  const au = lead.asset_uploads || 0; const auW = W.assetUploads.w;
  if (au >= 200) b.assetUploads = auW;
  else if (au >= 50) b.assetUploads = Math.round(auW * 0.7);
  else if (au >= 10) b.assetUploads = Math.round(auW * 0.4);
  else b.assetUploads = Math.round(auW * 0.1);

  const ti = lead.teammate_invites || 0; const tiW = W.teamCollab.w;
  if (ti >= 10) b.teamCollab = tiW;
  else if (ti >= 5) b.teamCollab = Math.round(tiW * 0.7);
  else if (ti >= 2) b.teamCollab = Math.round(tiW * 0.4);
  else b.teamCollab = Math.round(tiW * 0.15);

  const sz = lead.company_size_min || 0; const szW = W.companySize.w;
  if (sz >= 1000) b.companySize = szW;
  else if (sz >= 201) b.companySize = Math.round(szW * 0.7);
  else if (sz >= 51) b.companySize = Math.round(szW * 0.4);
  else b.companySize = Math.round(szW * 0.15);

  const ind = lead.industry || ""; const indW = W.industryMatch.w;
  if (TARGET_INDUSTRIES.has(ind)) b.industryMatch = indW;
  else b.industryMatch = Math.round(indW * 0.2);

  const mcW = W.mktgCreative.w;
  const hasMktg = lead.has_marketing_title || false;
  const sen = (lead.seniority_level || "").toLowerCase();
  const seniorRoles = ["c-level", "vp", "director"];
  if (hasMktg && seniorRoles.includes(sen)) b.mktgCreative = mcW;
  else if (hasMktg) b.mktgCreative = Math.round(mcW * 0.6);
  else if (seniorRoles.includes(sen)) b.mktgCreative = Math.round(mcW * 0.4);
  else b.mktgCreative = Math.round(mcW * 0.1);

  const ch = lead.active_channels || 0; const chW = W.channelExpansion.w;
  if (ch >= 6) b.channelExpansion = chW;
  else if (ch >= 4) b.channelExpansion = Math.round(chW * 0.7);
  else if (ch >= 2) b.channelExpansion = Math.round(chW * 0.4);
  else b.channelExpansion = Math.round(chW * 0.15);

  const cj = lead.creative_job_postings || 0; const cjW = W.creativeHiring.w;
  if (cj >= 8) b.creativeHiring = cjW;
  else if (cj >= 3) b.creativeHiring = Math.round(cjW * 0.7);
  else if (cj >= 1) b.creativeHiring = Math.round(cjW * 0.4);
  else b.creativeHiring = Math.round(cjW * 0.1);

  Object.values(b).forEach((v) => { total += v; });
  return { s: Math.round(total), b };
}

function tierOf(score) {
  if (score >= 75) return "HOT";
  if (score >= 55) return "WARM";
  if (score >= 35) return "COOL";
  return "LOW";
}
function tierVariant(score) {
  if (score >= 75) return "hot";
  if (score >= 55) return "warm";
  if (score >= 35) return "cool";
  return "low";
}
function tierStroke(score) {
  if (score >= 75) return "hsl(var(--hot))";
  if (score >= 55) return "hsl(var(--warm))";
  if (score >= 35) return "hsl(var(--cool))";
  return "hsl(var(--low))";
}
function tierDotClass(score) {
  if (score >= 75) return "bg-hot";
  if (score >= 55) return "bg-warm";
  if (score >= 35) return "bg-cool";
  return "bg-low";
}

/* ════════════ ATOMS ════════════ */

function SectionLabel({ children, className }) {
  return (
    <div className={cn("font-mono text-2xs uppercase tracking-[0.14em] text-muted-foreground", className)}>
      {children}
    </div>
  );
}

function ScoreRing({ val, size = 40 }) {
  const r = size / 2 - 3;
  const circ = 2 * Math.PI * r;
  const stroke = tierStroke(val);
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth={2} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={stroke} strokeWidth={2}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - val / 100)}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .8s cubic-bezier(.16,1,.3,1)" }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-medium tabular-nums text-foreground"
        style={{ fontSize: size > 50 ? 15 : 12 }}
      >
        {val}
      </span>
    </div>
  );
}

function Slider({ label, value, onChange }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs text-foreground/75">{label}</span>
        <span className="font-mono text-2xs tabular-nums text-foreground">{value}%</span>
      </div>
      <input
        type="range" min={0} max={50} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

function Field({ label, children, className }) {
  return (
    <div className={className}>
      <div className="mb-0.5 font-mono text-2xs uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <div className="text-sm text-foreground">
        {children || <span className="text-muted-foreground/60">—</span>}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, i = 0 }) {
  return (
    <div
      className="animate-in border-l border-border pl-5"
      style={{ animationDelay: `${i * 40}ms` }}
    >
      <div className="mb-1.5 font-mono text-2xs uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="text-3xl font-medium tabular-nums tracking-tight text-foreground">
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      )}
    </div>
  );
}

/* ════════════ LEAD ROW ════════════ */

function LeadRow({ lead, sc, i, onClick, isDuplicate }) {
  const tier = tierOf(sc.s);
  const variant = tierVariant(sc.s);

  return (
    <button
      onClick={onClick}
      className="animate-in group grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-5 border-b border-border py-4 text-left transition-colors hover:bg-muted/60"
      style={{ animationDelay: `${i * 18}ms` }}
    >
      <Dot className={cn("h-1.5 w-1.5 flex-shrink-0", tierDotClass(sc.s))} />

      <div className="min-w-0">
        <div className="mb-0.5 flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-foreground">
            {lead.name || "(no name)"}
          </span>
          {isDuplicate && (
            <Badge variant="warm" className="text-2xs">Duplicate</Badge>
          )}
          {lead.seniority_level && lead.seniority_level !== "Unknown" && (
            <span className="text-xs text-muted-foreground">{lead.seniority_level}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {lead.company && <span className="text-foreground/70">{lead.company}</span>}
          {lead.title && <span>· {lead.title}</span>}
          {lead.industry && lead.industry !== "Personal / Unknown" && <span>· {lead.industry}</span>}
          {lead.country && <span>· {lead.country}</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="font-mono text-muted-foreground">{lead.email}</span>
          {lead.source && <span className="text-muted-foreground">via {lead.source}</span>}
        </div>
      </div>

      <Badge variant={variant} className="uppercase tracking-[0.1em]">{tier}</Badge>

      <div className="flex items-center gap-3">
        <ScoreRing val={sc.s} />
        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" strokeWidth={1.75} />
      </div>
    </button>
  );
}

/* ════════════ DETAIL PANEL ════════════ */

function DetailPanel({ lead, sc, W, onBack, onExportLead }) {
  const fields = [
    ["Email", lead.email],
    ["Phone", lead.phone],
    ["Title", lead.title],
    ["Company", lead.company],
    ["Industry", lead.industry],
    ["Size", lead.company_size_band],
    ["Revenue", lead.estimated_revenue],
    ["Country", lead.country],
    ["Source", lead.source],
    ["Created", lead.created_at],
    ["Seniority", lead.seniority_level],
    ["Enrichment", lead.enrichment_status],
  ];

  const signals = [
    ["Page Views", lead.pricing_page_views],
    ["Signup Intent", lead.has_signup_intent ? "Yes" : "No"],
    ["Credit Usage", lead.credit_usage_pct ? `${lead.credit_usage_pct}%` : "0%"],
    ["Asset Uploads", lead.asset_uploads],
    ["Team Invites", lead.teammate_invites],
    ["Active Channels", lead.active_channels],
    ["Creative Postings", lead.creative_job_postings],
  ];

  return (
    <div className="animate-in">
      <div className="mb-8 flex items-center justify-between">
        <SectionLabel>Lead detail</SectionLabel>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onExportLead}>
            <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
            Export
          </Button>
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
            Back
          </Button>
        </div>
      </div>

      <div className="mb-12 flex items-start justify-between gap-8 border-b border-border pb-10">
        <div className="min-w-0">
          <h2 className="text-4xl font-medium tracking-tight text-foreground md:text-5xl">
            {lead.name || "(no name)"}
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            {lead.title}
            {lead.company ? <span className="mx-2 text-border">·</span> : ""}
            {lead.company}
          </p>
        </div>
        <ScoreRing val={sc.s} size={72} />
      </div>

      <div className="mb-12 grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-4">
        {fields.map(([k, v]) => (
          <Field key={k} label={k}>{v}</Field>
        ))}
      </div>

      <SectionLabel className="mb-4">Product usage signals</SectionLabel>
      <div className="mb-12 grid grid-cols-2 gap-x-8 gap-y-5 border-t border-border pt-6 md:grid-cols-4 lg:grid-cols-7">
        {signals.map(([k, v]) => (
          <div key={k}>
            <div className="mb-1 font-mono text-2xs uppercase tracking-[0.12em] text-muted-foreground">
              {k}
            </div>
            <div className="text-xl font-medium tabular-nums text-foreground">
              {v}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-12 lg:grid-cols-2">
        <div>
          <SectionLabel className="mb-4">ICP score breakdown</SectionLabel>
          <div className="space-y-3">
            {Object.entries(W).map(([k, cfg]) => {
              const earned = sc.b[k] || 0;
              const max = cfg.w;
              const pct = max > 0 ? (earned / max) * 100 : 0;
              const barColor = pct >= 80 ? "hsl(var(--primary))" : pct >= 50 ? "hsl(var(--warm))" : "hsl(var(--low))";
              return (
                <div key={k}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-foreground/75">{cfg.label}</span>
                    <span className="font-mono text-2xs tabular-nums text-foreground">
                      {earned}<span className="text-muted-foreground">/{max}</span>
                    </span>
                  </div>
                  <div className="h-[2px] w-full overflow-hidden bg-muted">
                    <div
                      className="h-full"
                      style={{
                        width: `${pct}%`,
                        background: barColor,
                        transition: "width .7s cubic-bezier(.16,1,.3,1)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-6 flex items-baseline justify-between border-t border-border pt-4">
            <span className="text-sm text-foreground">Total score</span>
            <span className="text-4xl font-medium tabular-nums text-primary">{sc.s}</span>
          </div>
        </div>

        <div>
          <SectionLabel className="mb-4">Data quality</SectionLabel>
          {(lead.data_quality_issues || []).length > 0 ? (
            <div className="space-y-2">
              {lead.data_quality_issues.map((issue, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5">
                  <span className="font-mono text-2xs text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm capitalize text-foreground">
                    {issue.replace(/_/g, " ")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
              No issues detected
            </div>
          )}

          {lead.score_breakdown && lead.score_breakdown.length > 0 && (
            <>
              <SectionLabel className="mb-4 mt-10">Scoring rules fired</SectionLabel>
              <div className="space-y-1.5">
                {lead.score_breakdown.map((rule, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-border/60 py-2 text-xs">
                    <span className="text-foreground/80">{rule.description || rule.rule_id}</span>
                    <span
                      className={cn(
                        "font-mono tabular-nums",
                        rule.points > 0 ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {rule.points > 0 ? "+" : ""}{rule.points}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════ REVIEW PANEL ════════════ */

function ReviewPanel({ reviewData, onConfirm, onBack }) {
  const [mergeDecisions, setMergeDecisions] = useState(() => {
    const d = {};
    (reviewData.duplicate_groups || []).forEach((g) => { d[g.email] = "approve"; });
    return d;
  });
  const [dropDecisions, setDropDecisions] = useState(() => {
    const d = {};
    (reviewData.dropped_rows || []).forEach((r, i) => { d[i] = "confirm"; });
    return d;
  });

  const dupGroups = reviewData.duplicate_groups || [];
  const droppedRows = reviewData.dropped_rows || [];

  function handleConfirm() {
    const approved = [];
    const rejected = [];
    Object.entries(mergeDecisions).forEach(([email, decision]) => {
      if (decision === "approve") approved.push(email);
      else rejected.push(email);
    });
    const restored = [];
    Object.entries(dropDecisions).forEach(([idx, decision]) => {
      if (decision === "restore") restored.push(droppedRows[Number(idx)]);
    });
    onConfirm({ approved_merges: approved, rejected_merges: rejected, restored_drops: restored });
  }

  const approvedCount = Object.values(mergeDecisions).filter((v) => v === "approve").length;
  const rejectedCount = Object.values(mergeDecisions).filter((v) => v === "reject").length;
  const restoredCount = Object.values(dropDecisions).filter((v) => v === "restore").length;
  const confirmedDrops = Object.values(dropDecisions).filter((v) => v === "confirm").length;

  return (
    <div className="animate-in">
      <div className="mb-8 flex items-center justify-between">
        <SectionLabel>Review merges &amp; deletions</SectionLabel>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
            Back
          </Button>
          <Button variant="primary" onClick={handleConfirm}>
            Confirm &amp; run
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
          </Button>
        </div>
      </div>

      <div className="mb-12 grid grid-cols-2 gap-6 border-y border-border py-8 md:grid-cols-4">
        <Stat i={0} label="Total rows" value={reviewData.total_rows} />
        <Stat i={1} label="Valid leads" value={reviewData.valid_leads} sub="passed validation" />
        <Stat i={2} label="Duplicate groups" value={dupGroups.length} sub={`${approvedCount} merge · ${rejectedCount} keep`} />
        <Stat i={3} label="Dropped rows" value={droppedRows.length} sub={`${restoredCount} restore · ${confirmedDrops} drop`} />
      </div>

      {dupGroups.length > 0 && (
        <section className="mb-16">
          <SectionLabel className="mb-5">Duplicate groups · {dupGroups.length}</SectionLabel>
          <div className="space-y-4">
            {dupGroups.map((group) => {
              const decision = mergeDecisions[group.email];
              return (
                <Card
                  key={group.email}
                  className={cn(
                    "overflow-hidden transition-colors",
                    decision === "approve" ? "border-primary/40" : "",
                  )}
                >
                  <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <div>
                      <span className="font-medium text-foreground">{group.email}</span>
                      <span className="ml-3 font-mono text-xs text-muted-foreground">{group.rows.length} rows</span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant={decision === "approve" ? "soft" : "ghost"}
                        onClick={() => setMergeDecisions((p) => ({ ...p, [group.email]: "approve" }))}
                      >
                        <GitMerge className="h-3 w-3" strokeWidth={1.75} />
                        Merge
                      </Button>
                      <Button
                        size="sm"
                        variant={decision === "reject" ? "outline" : "ghost"}
                        onClick={() => setMergeDecisions((p) => ({ ...p, [group.email]: "reject" }))}
                      >
                        Keep separate
                      </Button>
                    </div>
                  </div>
                  <div className="divide-y divide-border">
                    {group.rows.map((row, ri) => (
                      <div key={ri} className="grid grid-cols-2 gap-6 px-5 py-3 md:grid-cols-4">
                        {[["Name", row.name], ["Company", row.company], ["Title", row.title], ["Source", row.source]].map(([lbl, val]) => (
                          <div key={lbl}>
                            <div className="mb-0.5 font-mono text-2xs uppercase tracking-[0.12em] text-muted-foreground">{lbl}</div>
                            <div className="truncate text-xs text-foreground">{val || "—"}</div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  {decision === "approve" && (
                    <div className="animate-fade grid grid-cols-2 gap-6 border-t border-primary/20 bg-primary-soft px-5 py-3 md:grid-cols-4">
                      <div className="col-span-2 mb-0 font-mono text-2xs uppercase tracking-[0.12em] text-primary md:col-span-4">
                        Merged result
                      </div>
                      {[group.proposed_merge.name, group.proposed_merge.company, group.proposed_merge.title, group.proposed_merge.source].map((v, i) => (
                        <div key={i} className="truncate text-xs text-foreground">{v || "—"}</div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {droppedRows.length > 0 && (
        <section className="mb-16">
          <SectionLabel className="mb-5">Dropped rows · {droppedRows.length}</SectionLabel>
          <div className="divide-y divide-border border-y border-border">
            {droppedRows.map((drop, i) => {
              const decision = dropDecisions[i];
              return (
                <div
                  key={i}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-4 py-4 transition-colors",
                    decision === "restore" && "bg-warm/[0.04]",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-6 text-xs">
                    <div>
                      <div className="mb-0.5 font-mono text-2xs uppercase tracking-[0.12em] text-muted-foreground">Row</div>
                      <div className="font-mono text-foreground">{drop.row_num}</div>
                    </div>
                    <div>
                      <div className="mb-0.5 font-mono text-2xs uppercase tracking-[0.12em] text-muted-foreground">Name</div>
                      <div className="text-foreground">{drop.raw.Name || "—"}</div>
                    </div>
                    <div>
                      <div className="mb-0.5 font-mono text-2xs uppercase tracking-[0.12em] text-muted-foreground">Email (raw)</div>
                      <div className="font-mono text-hot">{drop.raw.Email || "(empty)"}</div>
                    </div>
                    <div>
                      <div className="mb-0.5 font-mono text-2xs uppercase tracking-[0.12em] text-muted-foreground">Reason</div>
                      <div className="capitalize text-foreground">{drop.reason.replace(/_/g, " ")}</div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant={decision === "confirm" ? "soft" : "ghost"}
                      onClick={() => setDropDecisions((p) => ({ ...p, [i]: "confirm" }))}
                    >
                      Drop
                    </Button>
                    <Button
                      size="sm"
                      variant={decision === "restore" ? "outline" : "ghost"}
                      onClick={() => setDropDecisions((p) => ({ ...p, [i]: "restore" }))}
                    >
                      <RotateCcw className="h-3 w-3" strokeWidth={1.75} />
                      Restore
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
          Back
        </Button>
        <Button variant="primary" size="lg" onClick={handleConfirm}>
          Confirm &amp; run pipeline
          <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
        </Button>
      </div>
    </div>
  );
}

/* ════════════ EXPORT ════════════ */

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function buildCsv(scoredItems) {
  const SF_FIELDS = [
    "FirstName", "LastName", "Email", "Phone", "Title", "Company",
    "Industry", "NumberOfEmployees", "LeadSource", "Country",
    "ICP_Score__c", "ICP_Tier__c",
  ];
  const rows = scoredItems.map(({ l, sc }) => {
    const nameParts = (l.name || "").split(" ");
    return [
      nameParts[0] || "", nameParts.slice(1).join(" ") || "",
      l.email || "", l.phone || "", l.title || "", l.company || "",
      l.industry || "", l.company_size_min || "", l.source || "", l.country || "",
      sc.s, tierOf(sc.s),
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
  });
  return [SF_FIELDS.join(","), ...rows].join("\n");
}

function ExportPanel({ scored, sfCsv, sfJson, exportItems, exportLabel, onBack }) {
  const [format, setFormat] = useState("csv");
  const items = exportItems || scored;
  const label = exportLabel || `Export all ${items.length} leads`;

  function handleDownload() {
    if (format === "csv") {
      if (!exportItems && sfCsv) downloadBlob(sfCsv, "salesforce_leads.csv", "text/csv");
      else downloadBlob(buildCsv(items), exportItems ? "filtered_leads.csv" : "salesforce_leads.csv", "text/csv");
    } else {
      if (!exportItems && sfJson) downloadBlob(JSON.stringify(sfJson, null, 2), "leads_export.json", "application/json");
      else {
        const payload = items.map(({ l, sc }) => ({ ...l, icp_score: sc.s, icp_tier: tierOf(sc.s), icp_breakdown: sc.b }));
        downloadBlob(JSON.stringify(payload, null, 2), exportItems ? "filtered_leads.json" : "leads_export.json", "application/json");
      }
    }
  }

  const previewData = format === "csv"
    ? ((!exportItems && sfCsv) ? sfCsv : buildCsv(items)).split("\n").slice(0, 8).join("\n")
    : JSON.stringify(
        items.slice(0, 3).map(({ l, sc }) => ({ ...l, icp_score: sc.s, icp_tier: tierOf(sc.s) })),
        null, 2,
      ).slice(0, 800);

  return (
    <div className="animate-in">
      <div className="mb-8 flex items-center justify-between">
        <SectionLabel>Export</SectionLabel>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
          Back
        </Button>
      </div>

      <h2 className="mb-3 text-4xl font-medium tracking-tight text-foreground md:text-5xl">
        {label}
      </h2>
      <p className="mb-10 max-w-lg text-sm leading-relaxed text-muted-foreground">
        Download scored leads for Salesforce ingestion or further processing. CSV ships in Bulk API 2.0 schema. JSON bundles scores and breakdown.
      </p>

      <SectionLabel className="mb-3">Format</SectionLabel>
      <div className="mb-8 grid grid-cols-2 gap-3">
        <button
          onClick={() => setFormat("csv")}
          className={cn(
            "flex items-center justify-between rounded-lg border px-5 py-4 text-left transition-colors",
            format === "csv" ? "border-primary bg-primary-soft" : "border-border hover:border-foreground/30",
          )}
        >
          <div>
            <div className="text-sm font-medium text-foreground">CSV</div>
            <div className="text-xs text-muted-foreground">Salesforce Bulk API 2.0</div>
          </div>
          {format === "csv" && <CheckCircle2 className="h-4 w-4 text-primary" strokeWidth={1.75} />}
        </button>
        <button
          onClick={() => setFormat("json")}
          className={cn(
            "flex items-center justify-between rounded-lg border px-5 py-4 text-left transition-colors",
            format === "json" ? "border-primary bg-primary-soft" : "border-border hover:border-foreground/30",
          )}
        >
          <div>
            <div className="text-sm font-medium text-foreground">JSON</div>
            <div className="text-xs text-muted-foreground">Scores + full breakdown</div>
          </div>
          {format === "json" && <CheckCircle2 className="h-4 w-4 text-primary" strokeWidth={1.75} />}
        </button>
      </div>

      <SectionLabel className="mb-3">Preview</SectionLabel>
      <div className="mb-8 max-h-80 overflow-auto rounded-lg border border-border bg-surface p-5">
        <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/80">
          {previewData || "No data available. Run the pipeline first."}
        </pre>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button variant="primary" size="lg" onClick={handleDownload} disabled={!previewData}>
          <Download className="h-4 w-4" strokeWidth={1.75} />
          Download {format.toUpperCase()}
        </Button>
        <span className="text-xs text-muted-foreground">
          {format === "csv" ? "Salesforce Bulk API 2.0 compatible" : "Includes ICP scores and breakdown"}
        </span>
      </div>
    </div>
  );
}

/* ════════════ APP ════════════ */

export default function App() {
  const [leads, setLeads] = useState([]);
  const [W, setW] = useState(DEF_W);
  const [stage, setStage] = useState("upload");
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(0);
  const [error, setError] = useState(null);
  const [csvFile, setCsvFile] = useState(null);
  const [sfCsv, setSfCsv] = useState("");
  const [sfJson, setSfJson] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [showW, setShowW] = useState(false);
  const [sort, setSort] = useState("score");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [manualReview, setManualReview] = useState(false);
  const [reviewData, setReviewData] = useState(null);
  const [exportItems, setExportItems] = useState(null);
  const [exportLabel, setExportLabel] = useState("");
  const [orbitOpen, setOrbitOpen] = useState(false);
  const [orbitInitialId, setOrbitInitialId] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!orbitOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setOrbitOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [orbitOpen]);

  const scored = leads.map((l) => ({ l, sc: scoreLead(l, W) }));

  const filtered = scored
    .filter((x) => {
      if (filter === "hot" && x.sc.s < 75) return false;
      if (filter === "warm" && (x.sc.s < 55 || x.sc.s >= 75)) return false;
      if (filter === "cool" && (x.sc.s < 35 || x.sc.s >= 55)) return false;
      if (filter === "low" && x.sc.s >= 35) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = [x.l.name, x.l.email, x.l.company, x.l.title].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === "score") return b.sc.s - a.sc.s;
      if (sort === "name") return (a.l.name || "").localeCompare(b.l.name || "");
      if (sort === "company") return (a.l.company || "").localeCompare(b.l.company || "");
      return b.sc.s - a.sc.s;
    });

  function updW(k, v) { setW((p) => ({ ...p, [k]: { ...p[k], w: v } })); }
  const totalWeight = Object.values(W).reduce((a, b) => a + b.w, 0);

  const duplicateEmails = new Set();
  const emailCounts = {};
  leads.forEach((l) => { emailCounts[l.email] = (emailCounts[l.email] || 0) + 1; });
  Object.entries(emailCounts).forEach(([email, count]) => { if (count > 1) duplicateEmails.add(email); });

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) setCsvFile(file);
  }, []);

  async function runPipeline() {
    setBusy(true); setProg(0); setError(null);
    const progInterval = setInterval(() => {
      setProg((p) => Math.min(p + Math.random() * 12, 92));
    }, 300);
    try {
      if (manualReview) {
        let res;
        if (csvFile) {
          const form = new FormData(); form.append("file", csvFile);
          res = await fetch("/api/pipeline/review", { method: "POST", body: form });
        } else {
          res = await fetch("/api/pipeline/review", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
          });
        }
        clearInterval(progInterval); setProg(100);
        if (!res.ok) throw new Error(await readErr(res, "Review step failed"));
        const data = await res.json();
        setReviewData(data); setStage("review");
      } else {
        let res;
        if (csvFile) {
          const form = new FormData(); form.append("file", csvFile); form.append("seed", "42");
          res = await fetch("/api/pipeline", { method: "POST", body: form });
        } else {
          res = await fetch("/api/pipeline", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seed: 42 }),
          });
        }
        clearInterval(progInterval); setProg(100);
        if (!res.ok) throw new Error(await readErr(res, "Pipeline failed"));
        const data = await res.json();
        setLeads(data.leads || []); setSfCsv(data.salesforce_csv || "");
        setSfJson(data.salesforce_json || null); setStage("results");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false); clearInterval(progInterval);
    }
  }

  async function handleReviewConfirm(decisions) {
    setBusy(true); setProg(0); setError(null);
    const progInterval = setInterval(() => {
      setProg((p) => Math.min(p + Math.random() * 10, 92));
    }, 300);
    try {
      const res = await fetch("/api/pipeline/finalize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...decisions, seed: 42 }),
      });
      clearInterval(progInterval); setProg(100);
      if (!res.ok) throw new Error(await readErr(res, "Finalize failed"));
      const data = await res.json();
      setLeads(data.leads || []); setSfCsv(data.salesforce_csv || "");
      setSfJson(data.salesforce_json || null); setReviewData(null); setStage("results");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false); clearInterval(progInterval);
    }
  }

  function reset() {
    setLeads([]); setSel(null); setCsvFile(null); setStage("upload");
    setProg(0); setShowW(false); setError(null); setSearch("");
    setFilter("all"); setSfCsv(""); setSfJson(null); setReviewData(null);
  }

  const steps = manualReview
    ? ["Upload", "Review", "Results", "Detail", "Export"]
    : ["Upload", "Results", "Detail", "Export"];
  const stageMap = manualReview
    ? { upload: 0, processing: 0, review: 1, results: 2, detail: 3, export: 4 }
    : { upload: 0, processing: 0, results: 1, detail: 2, export: 3 };
  const ci = stageMap[stage] ?? 0;

  return (
    <div className="min-h-screen bg-background">
      {/* ═══════ TOPBAR ═══════ */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4 md:px-10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <span className="text-sm font-semibold">A</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold tracking-tight text-foreground">Air GTM</span>
              <span className="hidden text-xs text-muted-foreground md:inline">Lead pipeline</span>
            </div>
          </div>
          <div className="hidden items-center gap-0.5 md:flex">
            {steps.map((s, i) => {
              const stageIdMap = manualReview ? [1, 1, 2, 3, 4] : [1, 2, 3, 4];
              const orbitStageId = stageIdMap[i] ?? 1;
              const isActive = i === ci;
              const isDone = i < ci;
              return (
                <button
                  key={s}
                  onClick={() => { setOrbitInitialId(orbitStageId); setOrbitOpen(true); }}
                  title={`View ${s} in pipeline overview`}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                    isActive && "text-foreground",
                    isDone && !isActive && "text-primary",
                    !isActive && !isDone && "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-full font-mono text-2xs",
                      isActive && "bg-foreground text-background",
                      isDone && !isActive && "bg-primary text-primary-foreground",
                      !isActive && !isDone && "border border-border text-muted-foreground",
                    )}
                  >
                    {isDone ? "✓" : i + 1}
                  </span>
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* ═══════ MAIN ═══════ */}
      <main className="mx-auto max-w-[1200px] px-6 py-16 md:px-10 md:py-24">
        {/* HERO */}
        <div className="mb-20 max-w-3xl animate-in">
          <SectionLabel className="mb-6">Air GTM · Engineering challenge</SectionLabel>
          <h1 className="text-5xl font-medium leading-[1.05] tracking-tight text-foreground md:text-7xl">
            Lead pipeline <span className="text-primary">&amp;</span> ICP scoring.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Upload a messy CSV. Enrich, dedupe, and score it in one sweep. Tune ICP weights live, deep-dive any lead, export a Salesforce-ready payload.
          </p>
        </div>

        {/* ERROR */}
        {error && (
          <div className="animate-fade mb-10 flex items-start gap-3 rounded-lg border border-hot/25 bg-hot/5 px-5 py-3.5">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-hot" strokeWidth={1.75} />
            <span className="flex-1 text-sm text-foreground">{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ═══ UPLOAD ═══ */}
        {stage === "upload" && !busy && (
          <div className="grid gap-10 animate-in lg:grid-cols-[1fr_340px]">
            <div>
              <SectionLabel className="mb-4">Ingest</SectionLabel>

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={cn(
                  "group relative cursor-pointer rounded-xl border border-dashed p-14 text-center transition-colors",
                  dragOver
                    ? "border-primary bg-primary-soft"
                    : "border-border bg-surface hover:border-foreground/30 hover:bg-muted",
                )}
              >
                <input
                  ref={fileRef} type="file" accept=".csv"
                  className="hidden"
                  onChange={(e) => { if (e.target.files[0]) setCsvFile(e.target.files[0]); }}
                />
                {csvFile ? (
                  <div className="animate-fade">
                    <FileText className="mx-auto mb-3 h-6 w-6 text-primary" strokeWidth={1.5} />
                    <div className="mb-1 text-base font-medium text-foreground">{csvFile.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {(csvFile.size / 1024).toFixed(1)} KB · ready
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setCsvFile(null); }}
                      className="mt-4 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      Clear and choose another
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="mx-auto mb-3 h-6 w-6 text-muted-foreground transition-transform group-hover:-translate-y-0.5" strokeWidth={1.5} />
                    <div className="mb-1.5 text-base font-medium text-foreground">
                      Drop a CSV or click to browse
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Or leave empty to use{" "}
                      <code className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-2xs text-foreground">
                        messy_leads.csv
                      </code>
                    </div>
                  </>
                )}
              </div>

              <Button
                variant="primary" size="lg"
                className="mt-5 w-full"
                onClick={runPipeline}
              >
                Run pipeline{csvFile ? ` on ${csvFile.name}` : " on default data"}
                <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
              </Button>

              <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <GitMerge className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
                    <span className="text-sm font-medium text-foreground">Manual review</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Audit merges and deletions before scoring
                  </div>
                </div>
                <button
                  onClick={() => setManualReview((v) => !v)}
                  className={cn(
                    "relative h-5 w-9 rounded-full transition-colors",
                    manualReview ? "bg-primary" : "bg-muted",
                  )}
                  aria-pressed={manualReview}
                >
                  <div
                    className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
                      manualReview ? "left-[18px]" : "left-0.5",
                    )}
                  />
                </button>
              </div>
            </div>

            {/* ICP Weights */}
            <div>
              <div className="mb-4 flex items-center justify-between">
                <SectionLabel>ICP weights</SectionLabel>
                <span
                  className={cn(
                    "font-mono text-2xs tabular-nums",
                    totalWeight === 100 ? "text-primary" : "text-warm",
                  )}
                >
                  {totalWeight}%{totalWeight === 100 ? " ✓" : ""}
                </span>
              </div>
              <p className="mb-6 text-xs leading-relaxed text-muted-foreground">
                Tune each signal's contribution. Scores recompute live once the pipeline finishes.
              </p>
              <div className="space-y-4">
                {Object.entries(W).map(([k, cfg]) => (
                  <Slider key={k} label={cfg.label} value={cfg.w} onChange={(v) => updW(k, v)} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ PROCESSING ═══ */}
        {busy && (
          <div className="animate-fade mx-auto max-w-md py-20">
            <div className="mb-8 flex items-center gap-4">
              <div className="relative h-8 w-8">
                <div className="absolute inset-0 rounded-full border-2 border-border" />
                <div
                  className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary"
                  style={{ animationDuration: "0.8s" }}
                />
              </div>
              <div>
                <div className="text-base font-medium text-foreground">Running pipeline</div>
                <div className="mt-0.5 font-mono text-2xs uppercase tracking-[0.14em] text-muted-foreground">
                  normalize · dedupe · enrich · score
                </div>
              </div>
            </div>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-2xs uppercase tracking-[0.14em] text-muted-foreground">
                Progress
              </span>
              <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                {Math.round(prog)}%
              </span>
            </div>
            <div className="h-[2px] w-full overflow-hidden bg-muted">
              <div
                className="h-full bg-primary"
                style={{ width: `${prog}%`, transition: "width .3s ease" }}
              />
            </div>
          </div>
        )}

        {/* ═══ REVIEW ═══ */}
        {stage === "review" && reviewData && !busy && (
          <ReviewPanel
            reviewData={reviewData}
            onConfirm={handleReviewConfirm}
            onBack={() => { setReviewData(null); setStage("upload"); }}
          />
        )}

        {/* ═══ RESULTS ═══ */}
        {stage === "results" && leads.length > 0 && (
          <div className="animate-in">
            {/* Stats row */}
            <div className="mb-12 grid grid-cols-2 gap-6 border-y border-border py-8 md:grid-cols-4">
              <Stat i={0} label="Total leads" value={scored.length} />
              <Stat
                i={1}
                label="Avg ICP score"
                value={Math.round(scored.reduce((a, x) => a + x.sc.s, 0) / scored.length)}
                sub={`${scored.filter((x) => x.sc.s >= 75).length} HOT`}
              />
              <Stat
                i={2}
                label="Enriched"
                value={leads.filter((l) => l.enrichment_status === "ok").length}
                sub={`of ${leads.length}`}
              />
              <Stat
                i={3}
                label="Avg credit use"
                value={Math.round(leads.reduce((a, l) => a + (l.credit_usage_pct || 0), 0) / leads.length) + "%"}
                sub="product engagement"
              />
            </div>

            {/* Controls */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-1">
                <SectionLabel className="mr-2">Filter</SectionLabel>
                {["all", "hot", "warm", "cool", "low"].map((t) => {
                  const cnt = t === "all" ? scored.length : scored.filter((x) => tierOf(x.sc.s) === t.toUpperCase()).length;
                  const active = filter === t;
                  return (
                    <Button
                      key={t} size="sm"
                      variant={active ? "soft" : "ghost"}
                      onClick={() => setFilter(t)}
                    >
                      <span className="capitalize">{t}</span>
                      <span className="font-mono text-2xs opacity-60">{cnt}</span>
                    </Button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-1">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
                  <input
                    type="search" placeholder="Search leads"
                    value={search} onChange={(e) => setSearch(e.target.value)}
                    className="h-8 w-48 rounded-md border border-border bg-card pl-8 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/40"
                  />
                </div>
                <SectionLabel className="ml-2 mr-1">Sort</SectionLabel>
                {[{ k: "score", l: "Score" }, { k: "name", l: "Name" }, { k: "company", l: "Company" }].map((s) => (
                  <Button
                    key={s.k} size="sm"
                    variant={sort === s.k ? "soft" : "ghost"}
                    onClick={() => setSort(s.k)}
                  >
                    {s.l}
                  </Button>
                ))}
                <div className="mx-1 h-5 w-px bg-border" />
                <Button size="sm" variant="ghost" onClick={() => setShowW(!showW)}>
                  <SlidersHorizontal className="h-3 w-3" strokeWidth={1.75} />
                  {showW ? "Hide" : "Weights"}
                </Button>
                <Button
                  size="sm" variant="primary"
                  onClick={() => { setExportItems(null); setExportLabel(""); setStage("export"); }}
                >
                  <Download className="h-3 w-3" strokeWidth={1.75} />
                  Export
                </Button>
                {filtered.length !== scored.length && (
                  <Button
                    size="sm" variant="soft"
                    onClick={() => { setExportItems(filtered); setExportLabel(`Export ${filtered.length} filtered leads`); setStage("export"); }}
                  >
                    Export filtered ({filtered.length})
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={reset}>
                  <RotateCcw className="h-3 w-3" strokeWidth={1.75} />
                  Reset
                </Button>
              </div>
            </div>

            {/* Inline weights */}
            {showW && (
              <div className="animate-fade mb-8 rounded-xl border border-border bg-card p-6">
                <div className="mb-4 flex items-center justify-between">
                  <SectionLabel>Live ICP weights</SectionLabel>
                  <span
                    className={cn(
                      "font-mono text-2xs tabular-nums",
                      totalWeight === 100 ? "text-primary" : "text-warm",
                    )}
                  >
                    Total {totalWeight}%{totalWeight === 100 ? " ✓" : ""}
                  </span>
                </div>
                <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
                  {Object.entries(W).map(([k, cfg]) => (
                    <Slider key={k} label={cfg.label} value={cfg.w} onChange={(v) => updW(k, v)} />
                  ))}
                </div>
              </div>
            )}

            {/* Lead list */}
            <div className="border-t border-border">
              {filtered.map(({ l, sc }, i) => (
                <LeadRow
                  key={`${l.email}-${l.source_row_numbers?.[0] || i}`}
                  lead={l} sc={sc} i={i}
                  isDuplicate={duplicateEmails.has(l.email)}
                  onClick={() => { setSel(l); setStage("detail"); }}
                />
              ))}
            </div>
            {filtered.length === 0 && (
              <div className="py-16 text-center text-sm text-muted-foreground">
                No leads match this filter.
              </div>
            )}

            <div className="mt-6 font-mono text-2xs uppercase tracking-[0.14em] text-muted-foreground">
              Showing {filtered.length} of {scored.length}
            </div>
          </div>
        )}

        {/* ═══ DETAIL ═══ */}
        {stage === "detail" && sel && (
          <DetailPanel
            lead={sel} sc={scoreLead(sel, W)} W={W}
            onBack={() => { setSel(null); setStage("results"); }}
            onExportLead={() => {
              const sc2 = scoreLead(sel, W);
              setExportItems([{ l: sel, sc: sc2 }]);
              setExportLabel(`Export ${sel.name || sel.email}`);
              setStage("export");
            }}
          />
        )}

        {/* ═══ EXPORT ═══ */}
        {stage === "export" && (
          <ExportPanel
            scored={scored} sfCsv={sfCsv} sfJson={sfJson}
            exportItems={exportItems} exportLabel={exportLabel}
            onBack={() => { setExportItems(null); setExportLabel(""); setStage("results"); }}
          />
        )}

        {/* ═══ FOOTER ═══ */}
        <footer className="mt-32 flex items-center justify-between border-t border-border pt-6">
          <div className="text-xs text-muted-foreground">
            Air GTM · Engineering Challenge
          </div>
          <div className="font-mono text-2xs uppercase tracking-[0.18em] text-muted-foreground">
            csv → enrich → score → export
          </div>
        </footer>
      </main>

      {/* ═══ ORBITAL MODAL ═══ */}
      {orbitOpen && (
        <div
          onClick={() => setOrbitOpen(false)}
          className="animate-fade fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-6 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[760px] overflow-hidden rounded-xl border border-border bg-card shadow-[0_20px_60px_-20px_rgba(0,0,0,0.25)]"
          >
            <button
              onClick={() => setOrbitOpen(false)}
              aria-label="Close"
              className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <PipelineOrbital
              key={orbitInitialId}
              stages={PIPELINE_STAGES}
              height={520}
              initialExpandedId={orbitInitialId}
            />
          </div>
        </div>
      )}
    </div>
  );
}
