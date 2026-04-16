"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, Sparkles, Search, SlidersHorizontal, ArrowLeft, Download,
  CheckCircle2, X, Flame, Target, Zap, Users, Database, FileJson,
  FileSpreadsheet, ArrowRight, AlertCircle, GitMerge, RotateCcw,
  ChevronRight, FileText, Gauge, Mail, Building2, Globe2,
  TrendingUp, Thermometer, Sparkle, ArrowUpRight,
} from "lucide-react";
import PipelineOrbital from "./components/PipelineOrbital";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { GlassMetricsBlock } from "@/app/components/ui/glass-metrics-block";
import { cn } from "@/lib/utils";

/* ════════════════════ PIPELINE STAGES (for orbital viz) ════════════════════ */
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

/* ════════════════════ ICP SCORING (client-side) ════════════════════ */

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
  if (score >= 75) return "ember";
  if (score >= 55) return "amber";
  if (score >= 35) return "mint";
  return "dust";
}

function tierStroke(score) {
  if (score >= 75) return "hsl(var(--ember))";
  if (score >= 55) return "hsl(var(--amber))";
  if (score >= 35) return "hsl(var(--mint))";
  return "hsl(var(--dust))";
}

/* ════════════════════ ATOMS ════════════════════ */

function Eyebrow({ children, className }) {
  return (
    <div className={cn("flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.28em] text-foreground/45 font-mono", className)}>
      <span className="h-px w-6 bg-foreground/20" />
      {children}
    </div>
  );
}

function ScoreRing({ val, size = 48 }) {
  const r = size / 2 - 4;
  const circ = 2 * Math.PI * r;
  const stroke = tierStroke(val);
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth={2.5} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={stroke} strokeWidth={2.5}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - val / 100)}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .9s cubic-bezier(.16,1,.3,1)", filter: `drop-shadow(0 0 6px ${stroke}99)` }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-mono font-semibold"
        style={{ fontSize: size > 56 ? 16 : 13, color: stroke }}
      >
        {val}
      </span>
    </div>
  );
}

function Slider({ label, value, onChange }) {
  return (
    <div className="group">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs text-foreground/80">{label}</span>
        <span className="font-mono text-xs font-medium tabular-nums text-primary">{value}%</span>
      </div>
      <input
        type="range" min={0} max={50} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

function FieldRow({ icon: Icon, label, children }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.24em] text-foreground/45">
        {Icon && <Icon className="h-2.5 w-2.5" strokeWidth={2} />}
        {label}
      </div>
      <div className="text-[13px] text-foreground/90">{children || <span className="text-foreground/30 italic">—</span>}</div>
    </div>
  );
}

/* ════════════════════ LEAD ROW ════════════════════ */

function LeadRow({ lead, sc, i, onClick, isDuplicate }) {
  const tier = tierOf(sc.s);
  const variant = tierVariant(sc.s);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.025, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      onClick={onClick}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-2xl border bg-card/40 px-6 py-5 backdrop-blur-xl",
        "transition-all duration-300 hover:-translate-y-0.5 hover:bg-card/60 hover:shadow-[0_20px_40px_-20px_hsl(var(--primary)/0.35)]",
        isDuplicate ? "border-ember/40" : "border-border/50 hover:border-primary/40",
      )}
    >
      <div className="grid grid-cols-[1fr_auto] items-center gap-6">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="truncate font-display text-lg font-normal text-foreground">
              {lead.name || "(no name)"}
            </span>
            <Badge variant={variant} className="text-[9px]">
              {tier}
            </Badge>
            {isDuplicate && (
              <Badge variant="ember" className="text-[9px]">
                Duplicate
              </Badge>
            )}
            {lead.seniority_level && lead.seniority_level !== "Unknown" && (
              <span className="text-[11px] text-foreground/40">· {lead.seniority_level}</span>
            )}
          </div>
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {lead.company && <Badge variant="solid" className="normal-case tracking-normal text-[10px] text-foreground/70">{lead.company}</Badge>}
            {lead.title && <Badge variant="solid" className="normal-case tracking-normal text-[10px] text-foreground/70">{lead.title}</Badge>}
            {lead.industry && lead.industry !== "Personal / Unknown" && (
              <Badge variant="solid" className="normal-case tracking-normal text-[10px] text-foreground/70">{lead.industry}</Badge>
            )}
            {lead.company_size_band && lead.company_size_band !== "Unknown" && (
              <Badge variant="solid" className="normal-case tracking-normal text-[10px] text-foreground/70">{lead.company_size_band} emp</Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-foreground/45">{lead.email}</span>
            {lead.source && <Badge variant="primary" className="text-[9px]">{lead.source}</Badge>}
            {lead.country && <Badge variant="outline" className="text-[9px]">{lead.country}</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ScoreRing val={sc.s} />
          <ChevronRight className="h-4 w-4 text-foreground/30 transition-transform group-hover:translate-x-1 group-hover:text-foreground/70" />
        </div>
      </div>
    </motion.div>
  );
}

/* ════════════════════ DETAIL PANEL ════════════════════ */

function DetailPanel({ lead, sc, W, onBack, onExportLead }) {
  const fields = [
    [Mail, "Email", lead.email],
    [Users, "Phone", lead.phone],
    [Target, "Title", lead.title],
    [Building2, "Company", lead.company],
    [Sparkles, "Industry", lead.industry],
    [Users, "Size", lead.company_size_band],
    [TrendingUp, "Revenue", lead.estimated_revenue],
    [Globe2, "Country", lead.country],
    [Zap, "Source", lead.source],
    [FileText, "Created", lead.created_at],
    [Gauge, "Seniority", lead.seniority_level],
    [CheckCircle2, "Enrichment", lead.enrichment_status],
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
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
    >
      <div className="mb-6 flex items-center justify-between">
        <Eyebrow>Lead Detail</Eyebrow>
        <div className="flex gap-2">
          <Button variant="soft" onClick={onExportLead}>
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
            Export Lead
          </Button>
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
            Back
          </Button>
        </div>
      </div>

      <Card className="p-8 md:p-10">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        <div className="mb-8 flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h2 className="font-display text-4xl font-light tracking-tight text-foreground">
              {lead.name || "(no name)"}
            </h2>
            <p className="mt-2 font-mono text-xs uppercase tracking-[0.2em] text-foreground/50">
              {lead.title}
              {lead.company ? <span className="mx-2 text-foreground/30">·</span> : ""}
              {lead.company}
            </p>
          </div>
          <ScoreRing val={sc.s} size={72} />
        </div>

        <div className="mb-8 grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3">
          {fields.map(([Icon, k, v]) => (
            <FieldRow key={k} icon={Icon} label={k}>{v}</FieldRow>
          ))}
        </div>

        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-3 w-3 text-foreground/40" strokeWidth={1.5} />
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/50">
            Product Usage Signals
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-border/70 to-transparent" />
        </div>
        <div className="mb-10 grid grid-cols-2 gap-2 md:grid-cols-4">
          {signals.map(([k, v]) => (
            <div
              key={k}
              className="rounded-xl border border-border/40 bg-background/40 p-4 backdrop-blur-xl"
            >
              <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.22em] text-foreground/45">
                {k}
              </div>
              <div className="font-mono text-xl font-medium tabular-nums text-foreground">
                {v}
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <div className="mb-4 flex items-center gap-2">
              <Thermometer className="h-3 w-3 text-foreground/40" strokeWidth={1.5} />
              <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/50">
                ICP Score Breakdown
              </span>
              <div className="h-px flex-1 bg-gradient-to-r from-border/70 to-transparent" />
            </div>
            <div className="space-y-3">
              {Object.entries(W).map(([k, cfg]) => {
                const earned = sc.b[k] || 0;
                const max = cfg.w;
                const pct = max > 0 ? (earned / max) * 100 : 0;
                const barColor = pct >= 80 ? "hsl(var(--mint))" : pct >= 50 ? "hsl(var(--amber))" : "hsl(var(--ember))";
                return (
                  <div key={k}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[11px] text-foreground/70">{cfg.label}</span>
                      <span className="font-mono text-[11px] font-medium tabular-nums text-foreground">
                        {earned}<span className="text-foreground/40">/{max}</span>
                      </span>
                    </div>
                    <div className="h-[3px] w-full overflow-hidden rounded-full bg-muted/50">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: barColor,
                          transition: "width .7s cubic-bezier(.16,1,.3,1)",
                          boxShadow: `0 0 8px ${barColor}`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 flex items-center justify-between rounded-2xl border border-primary/25 bg-primary/10 px-5 py-4 backdrop-blur">
              <span className="text-sm font-medium text-foreground">Total Score</span>
              <span className="font-display text-3xl font-light tabular-nums text-primary">{sc.s}</span>
            </div>
          </div>

          <div>
            <div className="mb-4 flex items-center gap-2">
              <AlertCircle className="h-3 w-3 text-foreground/40" strokeWidth={1.5} />
              <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/50">
                Data Quality Issues
              </span>
              <div className="h-px flex-1 bg-gradient-to-r from-border/70 to-transparent" />
            </div>
            {(lead.data_quality_issues || []).length > 0 ? (
              <div className="space-y-2">
                {lead.data_quality_issues.map((issue, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl border border-ember/20 bg-ember/5 px-3.5 py-2.5">
                    <span className="font-mono text-[10px] font-semibold text-ember">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-xs text-foreground/80 capitalize">
                      {issue.replace(/_/g, " ")}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-mint/20 bg-mint/5 px-4 py-3 text-xs text-mint">
                <CheckCircle2 className="mr-2 inline-block h-3.5 w-3.5" strokeWidth={2} />
                No issues detected
              </div>
            )}

            {lead.score_breakdown && lead.score_breakdown.length > 0 && (
              <>
                <div className="mb-3 mt-7 flex items-center gap-2">
                  <Sparkle className="h-3 w-3 text-foreground/40" strokeWidth={1.5} />
                  <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/50">
                    Scoring Rules Fired
                  </span>
                  <div className="h-px flex-1 bg-gradient-to-r from-border/70 to-transparent" />
                </div>
                <div className="space-y-1.5">
                  {lead.score_breakdown.map((rule, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border border-border/40 bg-background/30 px-3 py-2"
                    >
                      <span className="text-[11px] text-foreground/75">
                        {rule.description || rule.rule_id}
                      </span>
                      <span
                        className={cn(
                          "font-mono text-[11px] font-semibold tabular-nums",
                          rule.points > 0 ? "text-mint" : "text-ember",
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
      </Card>
    </motion.div>
  );
}

/* ════════════════════ REVIEW PANEL ════════════════════ */

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

  const summary = [
    { label: "Total Rows", value: reviewData.total_rows, icon: "Sparkles" },
    { label: "Valid Leads", value: reviewData.valid_leads, icon: "Users", description: "passed validation" },
    { label: "Duplicate Groups", value: dupGroups.length, icon: "Zap", description: `${approvedCount} merge · ${rejectedCount} keep separate` },
    { label: "Dropped Rows", value: droppedRows.length, icon: "Flame", description: `${restoredCount} restore · ${confirmedDrops} confirm drop` },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="mb-6 flex items-center justify-between">
        <Eyebrow>Review Merges & Deletions</Eyebrow>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
            Back to Upload
          </Button>
          <Button variant="primary" onClick={handleConfirm}>
            Confirm & Run Pipeline
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
          </Button>
        </div>
      </div>

      <div className="mb-10">
        <GlassMetricsBlock eyebrow="pre-scoring audit" metrics={summary} />
      </div>

      {dupGroups.length > 0 && (
        <div className="mb-10">
          <div className="mb-4 flex items-center gap-2">
            <GitMerge className="h-3 w-3 text-foreground/40" strokeWidth={1.5} />
            <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/50">
              Duplicate Groups ({dupGroups.length})
            </span>
            <div className="h-px flex-1 bg-gradient-to-r from-border/70 to-transparent" />
          </div>
          <div className="space-y-3">
            {dupGroups.map((group) => {
              const decision = mergeDecisions[group.email];
              return (
                <Card key={group.email} className={cn("p-5 transition-all", decision === "approve" ? "border-primary/40" : "border-border/40")}>
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <span className="font-medium text-foreground">{group.email}</span>
                      <span className="ml-3 font-mono text-[11px] text-foreground/45">{group.rows.length} rows</span>
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant={decision === "approve" ? "soft" : "ghost"}
                        onClick={() => setMergeDecisions((p) => ({ ...p, [group.email]: "approve" }))}
                      >
                        <GitMerge className="h-3 w-3" strokeWidth={2} />
                        Merge
                      </Button>
                      <Button
                        size="sm"
                        variant={decision === "reject" ? "ember" : "ghost"}
                        onClick={() => setMergeDecisions((p) => ({ ...p, [group.email]: "reject" }))}
                      >
                        Keep Separate
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {group.rows.map((row, ri) => (
                      <div
                        key={ri}
                        className="grid grid-cols-2 gap-3 rounded-xl border border-border/30 bg-background/40 px-4 py-3 md:grid-cols-4"
                      >
                        {[["Name", row.name], ["Company", row.company], ["Title", row.title], ["Source", row.source]].map(([lbl, val]) => (
                          <div key={lbl}>
                            <div className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/40">{lbl}</div>
                            <div className="truncate text-xs text-foreground/85">{val || "—"}</div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>

                  {decision === "approve" && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      className="mt-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3"
                    >
                      <div className="mb-1.5 flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-primary" strokeWidth={2} />
                        <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-primary">Merged Result</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs text-foreground/85 md:grid-cols-4">
                        <div>{group.proposed_merge.name || "—"}</div>
                        <div>{group.proposed_merge.company || "—"}</div>
                        <div>{group.proposed_merge.title || "—"}</div>
                        <div>{group.proposed_merge.source || "—"}</div>
                      </div>
                    </motion.div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {droppedRows.length > 0 && (
        <div className="mb-10">
          <div className="mb-4 flex items-center gap-2">
            <AlertCircle className="h-3 w-3 text-foreground/40" strokeWidth={1.5} />
            <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/50">
              Dropped — Invalid/Missing Email ({droppedRows.length})
            </span>
            <div className="h-px flex-1 bg-gradient-to-r from-border/70 to-transparent" />
          </div>
          <div className="space-y-2">
            {droppedRows.map((drop, i) => {
              const decision = dropDecisions[i];
              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-center justify-between rounded-2xl border bg-card/40 px-5 py-4 backdrop-blur-xl transition-colors",
                    decision === "restore" ? "border-amber/40" : "border-border/40",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-6 text-xs">
                    <div>
                      <div className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/40">Row</div>
                      <div className="font-mono text-foreground/85">{drop.row_num}</div>
                    </div>
                    <div>
                      <div className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/40">Name</div>
                      <div className="text-foreground/85">{drop.raw.Name || "—"}</div>
                    </div>
                    <div>
                      <div className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/40">Email (raw)</div>
                      <div className="font-mono text-ember">{drop.raw.Email || "(empty)"}</div>
                    </div>
                    <div>
                      <div className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/40">Reason</div>
                      <div className="capitalize text-foreground/85">{drop.reason.replace(/_/g, " ")}</div>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant={decision === "confirm" ? "soft" : "ghost"}
                      onClick={() => setDropDecisions((p) => ({ ...p, [i]: "confirm" }))}
                    >
                      Drop
                    </Button>
                    <Button
                      size="sm"
                      variant={decision === "restore" ? "ember" : "ghost"}
                      onClick={() => setDropDecisions((p) => ({ ...p, [i]: "restore" }))}
                    >
                      <RotateCcw className="h-3 w-3" strokeWidth={2} />
                      Restore
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-border/40 pt-6">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
          Back
        </Button>
        <Button variant="primary" size="lg" onClick={handleConfirm}>
          Confirm & Run Pipeline
          <ArrowRight className="h-4 w-4" strokeWidth={2} />
        </Button>
      </div>
    </motion.div>
  );
}

/* ════════════════════ EXPORT UTILITIES ════════════════════ */

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

function buildSummaryMd(scored, leads) {
  const total = scored.length;
  const enriched = leads.filter((l) => l.enrichment_status === "ok").length;
  const enrichedPct = total > 0 ? ((enriched / total) * 100).toFixed(1) : "0.0";
  const avgScore = total > 0 ? Math.round(scored.reduce((a, x) => a + x.sc.s, 0) / total) : 0;

  const tiers = { HOT: 0, WARM: 0, COOL: 0, LOW: 0 };
  scored.forEach(({ sc }) => { tiers[tierOf(sc.s)]++; });

  const top10 = [...scored].sort((a, b) => b.sc.s - a.sc.s).slice(0, 10);

  const issueMap = {};
  leads.forEach((l) => {
    (l.data_quality_issues || []).forEach((issue) => {
      const key = issue.replace(/_/g, " ");
      issueMap[key] = (issueMap[key] || 0) + 1;
    });
  });
  const leadsWithIssues = leads.filter((l) => (l.data_quality_issues || []).length > 0).length;

  let md = `# Air GTM — Pipeline Summary Report\n\n`;
  md += `**Generated:** ${new Date().toLocaleString()}\n\n`;
  md += `---\n\n`;
  md += `## Overview\n\n`;
  md += `| Metric | Value |\n`;
  md += `|---|---|\n`;
  md += `| Total leads processed | ${total} |\n`;
  md += `| Enriched successfully | ${enriched} (${enrichedPct}%) |\n`;
  md += `| Average ICP score | ${avgScore} / 100 |\n`;
  md += `| Leads with data quality issues | ${leadsWithIssues} |\n\n`;

  md += `## Score Distribution by Tier\n\n`;
  md += `| Tier | Count | % of Total |\n`;
  md += `|---|---|---|\n`;
  [["HOT", "\u226575"], ["WARM", "55\u201374"], ["COOL", "35\u201354"], ["LOW", "<35"]].forEach(([tier, range]) => {
    const count = tiers[tier];
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
    md += `| ${tier} (${range}) | ${count} | ${pct}% |\n`;
  });
  md += `\n`;

  md += `## Top 10 Leads\n\n`;
  md += `| Rank | Name | Company | Score | Tier |\n`;
  md += `|---|---|---|---|---|\n`;
  top10.forEach(({ l, sc }, i) => {
    md += `| ${i + 1} | ${l.name || "(no name)"} | ${l.company || "\u2014"} | ${sc.s} | ${tierOf(sc.s)} |\n`;
  });
  md += `\n`;

  md += `## Data Quality Issues\n\n`;
  if (Object.keys(issueMap).length > 0) {
    md += `| Issue | Occurrences |\n`;
    md += `|---|---|\n`;
    Object.entries(issueMap)
      .sort((a, b) => b[1] - a[1])
      .forEach(([issue, count]) => {
        md += `| ${issue} | ${count} |\n`;
      });
  } else {
    md += `No data quality issues detected.\n`;
  }
  md += `\n---\n\n`;
  md += `*Report generated by Air GTM Lead Pipeline*\n`;

  return md;
}

/* ════════════════════ EXPORT PANEL ════════════════════ */

function ExportPanel({ scored, sfCsv, sfJson, exportItems, exportLabel, onBack }) {
  const [format, setFormat] = useState("csv");
  const items = exportItems || scored;
  const label = exportLabel || `Export All ${items.length} Leads`;

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
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="mb-6 flex items-center justify-between">
        <Eyebrow>Export</Eyebrow>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
          Back to Results
        </Button>
      </div>

      <Card className="p-8 md:p-10">
        <div className="pointer-events-none absolute right-[-100px] top-[-100px] h-[260px] w-[260px] rounded-full bg-primary/10 blur-[100px]" />
        <div className="pointer-events-none absolute bottom-[-100px] left-[-80px] h-[220px] w-[220px] rounded-full bg-ember/10 blur-[100px]" />

        <h2 className="relative font-display text-4xl font-light tracking-tight text-foreground">
          {label}
        </h2>
        <p className="relative mt-3 max-w-lg text-sm leading-relaxed text-foreground/60">
          Download scored leads for Salesforce ingestion or further processing. CSV ships in Bulk API 2.0 schema; JSON bundles scores + breakdown.
        </p>

        <div className="relative mt-8 mb-3 flex items-center gap-2">
          <FileText className="h-3 w-3 text-foreground/40" strokeWidth={1.5} />
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/50">Format</span>
          <div className="h-px flex-1 bg-gradient-to-r from-border/70 to-transparent" />
        </div>
        <div className="relative mb-6 grid grid-cols-2 gap-2">
          <button
            onClick={() => setFormat("csv")}
            className={cn(
              "group flex items-center gap-3 rounded-2xl border p-5 text-left transition-all",
              format === "csv"
                ? "border-primary/50 bg-primary/10"
                : "border-border/50 bg-background/30 hover:border-primary/30 hover:bg-background/50",
            )}
          >
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl",
              format === "csv" ? "bg-primary/20 text-primary" : "bg-foreground/5 text-foreground/60",
            )}>
              <FileSpreadsheet className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">CSV · Salesforce Bulk</div>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                ready for SFDC 2.0
              </div>
            </div>
          </button>
          <button
            onClick={() => setFormat("json")}
            className={cn(
              "group flex items-center gap-3 rounded-2xl border p-5 text-left transition-all",
              format === "json"
                ? "border-primary/50 bg-primary/10"
                : "border-border/50 bg-background/30 hover:border-primary/30 hover:bg-background/50",
            )}
          >
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl",
              format === "json" ? "bg-primary/20 text-primary" : "bg-foreground/5 text-foreground/60",
            )}>
              <FileJson className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">JSON · Full</div>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                scores + breakdown
              </div>
            </div>
          </button>
        </div>

        <div className="relative mb-3 flex items-center gap-2">
          <Database className="h-3 w-3 text-foreground/40" strokeWidth={1.5} />
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/50">
            {format === "csv" ? "Salesforce Bulk API CSV Preview" : "JSON Preview"}
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-border/70 to-transparent" />
        </div>
        <div className="relative mb-6 max-h-80 overflow-auto rounded-2xl border border-border/40 bg-background/60 p-5 backdrop-blur-xl">
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/70">
            {previewData || "No data available. Run the pipeline first."}
          </pre>
        </div>

        <div className="relative flex flex-wrap items-center gap-4">
          <Button variant="primary" size="lg" onClick={handleDownload} disabled={!previewData}>
            <Download className="h-4 w-4" strokeWidth={2} />
            Download {format.toUpperCase()}
          </Button>
          <span className="text-[11px] text-foreground/50">
            {format === "csv" ? "Salesforce Bulk API 2.0 compatible" : "Includes ICP scores and breakdown"}
          </span>
        </div>
      </Card>
    </motion.div>
  );
}

/* ════════════════════ APP ════════════════════ */

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
  const [showSummaryConfirm, setShowSummaryConfirm] = useState(false);
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
        if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Review step failed"); }
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
        if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Pipeline failed"); }
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
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Finalize failed"); }
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

  const resultsMetrics = leads.length > 0 ? [
    {
      label: "Total Leads", value: scored.length, icon: "Users",
      description: `${leads.length - scored.length + scored.length} records processed`,
    },
    {
      label: "Avg ICP Score",
      value: Math.round(scored.reduce((a, x) => a + x.sc.s, 0) / scored.length),
      delta: `${scored.filter((x) => x.sc.s >= 75).length} HOT`,
      icon: "Flame",
      description: "across the full cohort",
    },
    {
      label: "Enriched",
      value: leads.filter((l) => l.enrichment_status === "ok").length,
      description: `of ${leads.length} via mock Clearbit`,
      icon: "Sparkles",
    },
    {
      label: "Credit Usage",
      value: Math.round(leads.reduce((a, l) => a + (l.credit_usage_pct || 0), 0) / leads.length) + "%",
      description: "average product engagement",
      icon: "Zap",
    },
  ] : [];

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* Ambient atmospheric light blooms */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -left-40 top-[-10%] h-[600px] w-[600px] rounded-full bg-primary/[0.08] blur-[160px]" />
        <div className="absolute right-[-10%] top-[40%] h-[500px] w-[500px] rounded-full bg-ember/[0.06] blur-[140px]" />
        <div className="absolute bottom-[-20%] left-[30%] h-[500px] w-[500px] rounded-full bg-amber/[0.04] blur-[160px]" />
      </div>

      {/* ═══════════ TOPBAR ═══════════ */}
      <header className="sticky top-0 z-20 border-b border-border/40 bg-background/50 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4 md:px-10">
          <div className="flex items-center gap-3">
            <svg
              viewBox="0 0 1391.33 572.14"
              aria-label="Air"
              className="h-6 w-auto text-foreground"
            >
              <path
                stroke="currentColor" fill="none" strokeWidth="67" strokeLinecap="round"
                d="M1357.83,457.51s-49.35,81.13-149.45,81.13c-26.54,0-55.27-22.45-55.27-56.42,0-57.09,51.05-179.74,54.59-186.9.1-.19-.02-.42-.24-.45-58.86-7.71-267.52,31.33-267.52-90.35,0-47.15,29.21-65.66,51.56-65.66,13.97,0,56.57,7.19,56.57,68.18,0,119.14-90.03,331.61-217.73,331.61-149.67,0-30.26-226.79-22.15-242.82.21-.42-.08-.92-.55-.93-10.86-.41-108.58-3.89-231.16-1.78-228.36,3.92-543,33.47-543,183.09,0,44.69,35.21,62.45,58.8,62.45,100.58,0,167.49-112.93,237.36-231.89,77.76-132.39,183.97-273.25,234-273.25,123.64,0,5.31,371.93-55.07,503.14"
              />
              <circle cx="812.36" cy="154.14" r="48.28" fill="currentColor" />
            </svg>
            <div className="hidden h-5 w-px bg-border/70 sm:block" />
            <div className="hidden sm:block">
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/55">
                GTM · Lead Pipeline
              </div>
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
                    "group flex items-center gap-2 rounded-lg px-3 py-2 text-[10px] uppercase tracking-[0.18em] transition-all",
                    isActive && "bg-primary/15 text-primary",
                    isDone && !isActive && "text-mint",
                    !isActive && !isDone && "text-foreground/45 hover:bg-foreground/[0.04] hover:text-foreground/80",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full font-mono text-[9px] font-semibold",
                      isActive && "bg-primary text-primary-foreground",
                      isDone && !isActive && "bg-mint/20 text-mint",
                      !isActive && !isDone && "border border-border/60 bg-background/50",
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

      {/* ═══════════ MAIN ═══════════ */}
      <main className="mx-auto max-w-[1200px] px-6 py-14 md:px-10 md:py-20">
        {/* HERO HEADER */}
        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mb-16 max-w-4xl"
        >
          <Eyebrow className="mb-6">Air GTM · engineering challenge</Eyebrow>
          <h1 className="font-display text-5xl font-light leading-[1.05] tracking-tight text-foreground md:text-7xl">
            Lead pipeline &amp;{" "}
            <span className="relative inline-block">
              <span className="relative z-10 bg-gradient-to-r from-primary via-mint to-primary bg-clip-text italic text-transparent">
                ICP scoring
              </span>
              <span className="absolute -bottom-1 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
            </span>{" "}
            — live.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-foreground/60 md:text-lg">
            Upload a messy CSV. Enrich, dedupe and score in one sweep.
            Tune ICP weights in real time, deep-dive any lead, export a Salesforce-ready payload.
          </p>
        </motion.div>

        {/* ERROR */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="mb-8 flex items-center gap-3 rounded-2xl border border-ember/40 bg-ember/10 px-5 py-4 backdrop-blur-xl"
            >
              <AlertCircle className="h-4 w-4 flex-shrink-0 text-ember" strokeWidth={2} />
              <span className="flex-1 text-sm text-foreground/90">{error}</span>
              <button
                onClick={() => setError(null)}
                className="text-ember transition-opacity hover:opacity-70"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══════ UPLOAD STAGE ═══════ */}
        {stage === "upload" && !busy && (
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}
            className="grid gap-6 lg:grid-cols-[1fr_380px]"
          >
            <Card className="p-8 md:p-10">
              <div className="pointer-events-none absolute right-[-80px] top-[-80px] h-[220px] w-[220px] rounded-full bg-primary/10 blur-[80px]" />

              <div className="relative mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Upload className="h-4 w-4 text-primary" strokeWidth={1.5} />
                  <h3 className="font-display text-2xl font-normal tracking-tight text-foreground">
                    Ingest lead data
                  </h3>
                </div>
                {csvFile && (
                  <Button size="sm" variant="ghost" onClick={() => setCsvFile(null)}>
                    <X className="h-3 w-3" strokeWidth={2} />
                    Clear
                  </Button>
                )}
              </div>

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={cn(
                  "relative cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed p-12 text-center transition-all",
                  dragOver
                    ? "border-primary bg-primary/[0.08]"
                    : "border-border/60 bg-background/30 hover:border-primary/50 hover:bg-background/40",
                )}
              >
                <input
                  ref={fileRef} type="file" accept=".csv"
                  className="hidden"
                  onChange={(e) => { if (e.target.files[0]) setCsvFile(e.target.files[0]); }}
                />
                {csvFile ? (
                  <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                      <FileText className="h-6 w-6" strokeWidth={1.5} />
                    </div>
                    <div className="mb-1 font-display text-xl text-primary">{csvFile.name}</div>
                    <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/45">
                      {(csvFile.size / 1024).toFixed(1)} kb · ready to process
                    </div>
                  </motion.div>
                ) : (
                  <>
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-background/50 text-foreground/50">
                      <Upload className="h-5 w-5" strokeWidth={1.5} />
                    </div>
                    <div className="mb-2 font-display text-lg text-foreground/85">
                      Drop a CSV here or click to browse
                    </div>
                    <div className="text-xs text-foreground/50">
                      Or leave empty to use{" "}
                      <code className="rounded-md border border-border/50 bg-background/60 px-1.5 py-0.5 font-mono text-[11px] text-foreground/70">
                        messy_leads.csv
                      </code>
                    </div>
                  </>
                )}
              </div>

              <Button
                variant="primary" size="lg"
                className="relative mt-5 w-full"
                onClick={runPipeline}
              >
                <Sparkles className="h-4 w-4" strokeWidth={2} />
                Run Pipeline{csvFile ? ` on ${csvFile.name}` : " on Default Data"}
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </Button>

              {/* Manual review toggle */}
              <div className="relative mt-4 flex items-center justify-between rounded-2xl border border-border/40 bg-background/30 px-5 py-4 backdrop-blur-xl">
                <div>
                  <div className="mb-0.5 flex items-center gap-2">
                    <GitMerge className="h-3.5 w-3.5 text-foreground/60" strokeWidth={1.5} />
                    <span className="text-sm font-medium text-foreground">Manual Review</span>
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/45">
                    Audit merges &amp; deletions before scoring
                  </div>
                </div>
                <button
                  onClick={() => setManualReview((v) => !v)}
                  className={cn(
                    "relative h-6 w-11 rounded-full border transition-colors",
                    manualReview
                      ? "border-primary/50 bg-primary/60"
                      : "border-border/60 bg-background/70",
                  )}
                >
                  <div
                    className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-foreground shadow-md transition-all",
                      manualReview ? "left-[22px] bg-primary-foreground" : "left-0.5",
                    )}
                  />
                </button>
              </div>
            </Card>

            {/* ICP weights */}
            <Card className="p-6 md:p-7">
              <div className="mb-4 flex items-center gap-2">
                <SlidersHorizontal className="h-3.5 w-3.5 text-foreground/60" strokeWidth={1.5} />
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground/55">
                  ICP Scoring Weights
                </span>
              </div>
              <p className="mb-5 text-xs leading-relaxed text-foreground/55">
                Tune each signal's contribution. Scores recompute live once the pipeline finishes.
              </p>
              <div className="space-y-3">
                {Object.entries(W).map(([k, cfg]) => (
                  <Slider key={k} label={cfg.label} value={cfg.w} onChange={(v) => updW(k, v)} />
                ))}
              </div>
              <div
                className={cn(
                  "mt-5 flex items-center justify-between rounded-xl border px-4 py-3 backdrop-blur",
                  totalWeight === 100
                    ? "border-mint/30 bg-mint/10 text-mint"
                    : "border-amber/30 bg-amber/10 text-amber",
                )}
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.22em]">Total</span>
                <span className="font-mono text-sm font-semibold tabular-nums">
                  {totalWeight}% {totalWeight === 100 ? "✓" : "→ 100%"}
                </span>
              </div>
            </Card>
          </motion.div>
        )}

        {/* ═══════ PROCESSING ═══════ */}
        {busy && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="mx-auto max-w-xl"
          >
            <Card className="p-10">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
              <div className="relative">
                <div className="mb-6 flex items-center gap-4">
                  <div className="relative h-12 w-12">
                    <div className="absolute inset-0 rounded-full border-2 border-border" />
                    <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" style={{ animationDuration: "0.8s" }} />
                    <div className="absolute inset-2 rounded-full bg-primary/20 blur-sm" />
                  </div>
                  <div>
                    <div className="font-display text-xl font-normal tracking-tight text-foreground">
                      Running pipeline
                    </div>
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/50">
                      normalize · dedupe · enrich · score
                    </div>
                  </div>
                </div>

                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground/50">
                    Progress
                  </span>
                  <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                    {Math.round(prog)}%
                  </span>
                </div>
                <div className="relative h-1 overflow-hidden rounded-full bg-muted/50">
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-mint"
                    style={{ boxShadow: "0 0 12px hsl(var(--primary))" }}
                    animate={{ width: `${prog}%` }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  />
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* ═══════ REVIEW STAGE ═══════ */}
        {stage === "review" && reviewData && !busy && (
          <ReviewPanel
            reviewData={reviewData}
            onConfirm={handleReviewConfirm}
            onBack={() => { setReviewData(null); setStage("upload"); }}
          />
        )}

        {/* ═══════ RESULTS STAGE ═══════ */}
        {stage === "results" && leads.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}
          >
            <div className="mb-12">
              <GlassMetricsBlock eyebrow="pipeline output" metrics={resultsMetrics} />
            </div>

            {/* Controls */}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.22em] text-foreground/50">
                  Filter
                </span>
                {["all", "hot", "warm", "cool", "low"].map((t) => {
                  const cnt = t === "all" ? scored.length : scored.filter((x) => tierOf(x.sc.s) === t.toUpperCase()).length;
                  const active = filter === t;
                  return (
                    <Button
                      key={t} size="sm"
                      variant={active ? (t === "hot" ? "ember" : t === "warm" ? "soft" : "soft") : "ghost"}
                      onClick={() => setFilter(t)}
                      className="normal-case"
                    >
                      <span className="capitalize">{t}</span>
                      <span className="font-mono text-[9px] opacity-60">{cnt}</span>
                    </Button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40" strokeWidth={2} />
                  <input
                    type="search" placeholder="Search leads…"
                    value={search} onChange={(e) => setSearch(e.target.value)}
                    className="h-8 w-52 rounded-lg border border-border/50 bg-background/40 pl-9 pr-3 font-mono text-[11px] text-foreground placeholder:text-foreground/40 outline-none backdrop-blur-xl transition-colors focus:border-primary/60"
                  />
                </div>
                <span className="ml-1 font-mono text-[10px] uppercase tracking-[0.22em] text-foreground/50">
                  Sort
                </span>
                {[{ k: "score", l: "Score" }, { k: "name", l: "Name" }, { k: "company", l: "Company" }].map((s) => (
                  <Button
                    key={s.k} size="sm"
                    variant={sort === s.k ? "soft" : "ghost"}
                    onClick={() => setSort(s.k)}
                  >
                    {s.l}
                  </Button>
                ))}
                <div className="mx-1 h-5 w-px bg-border/60" />
                <Button size="sm" variant="ghost" onClick={() => setShowW(!showW)}>
                  <SlidersHorizontal className="h-3 w-3" strokeWidth={2} />
                  {showW ? "Hide" : "Weights"}
                </Button>
                <Button
                  size="sm" variant="primary"
                  onClick={() => { setExportItems(null); setExportLabel(""); setStage("export"); }}
                >
                  <Download className="h-3 w-3" strokeWidth={2} />
                  Export All
                </Button>
                <Button
                  size="sm" variant="ghost"
                  onClick={() => setShowSummaryConfirm(true)}
                >
                  <FileText className="h-3 w-3" strokeWidth={2} />
                  Summary
                </Button>
                {filtered.length !== scored.length && (
                  <Button
                    size="sm" variant="soft"
                    onClick={() => { setExportItems(filtered); setExportLabel(`Export ${filtered.length} Filtered Leads`); setStage("export"); }}
                  >
                    Export Filtered ({filtered.length})
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={reset}>
                  <RotateCcw className="h-3 w-3" strokeWidth={2} />
                  Reset
                </Button>
              </div>
            </div>

            {/* Inline weights */}
            <AnimatePresence>
              {showW && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="mb-5 overflow-hidden"
                >
                  <Card className="p-6 md:p-7">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <SlidersHorizontal className="h-3.5 w-3.5 text-foreground/60" strokeWidth={1.5} />
                        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground/55">
                          Live ICP Weights
                        </span>
                      </div>
                      <span
                        className={cn(
                          "font-mono text-[10px] font-semibold uppercase tracking-[0.22em]",
                          totalWeight === 100 ? "text-mint" : "text-amber",
                        )}
                      >
                        Total {totalWeight}% {totalWeight === 100 ? "✓" : ""}
                      </span>
                    </div>
                    <div className="grid gap-x-8 gap-y-2.5 md:grid-cols-2">
                      {Object.entries(W).map(([k, cfg]) => (
                        <Slider key={k} label={cfg.label} value={cfg.w} onChange={(v) => updW(k, v)} />
                      ))}
                    </div>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Lead list */}
            <div className="flex flex-col gap-2.5">
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
              <div className="rounded-2xl border border-border/40 bg-card/30 py-14 text-center text-sm text-foreground/50 backdrop-blur-xl">
                No leads match this filter.
              </div>
            )}

            <div className="mt-5 font-mono text-[10px] uppercase tracking-[0.22em] text-foreground/40">
              Showing {filtered.length} of {scored.length} leads
            </div>
          </motion.div>
        )}

        {/* ═══════ DETAIL STAGE ═══════ */}
        {stage === "detail" && sel && (
          <DetailPanel
            lead={sel} sc={scoreLead(sel, W)} W={W}
            onBack={() => { setSel(null); setStage("results"); }}
            onExportLead={() => {
              const sc2 = scoreLead(sel, W);
              setExportItems([{ l: sel, sc: sc2 }]);
              setExportLabel(`Export Lead: ${sel.name || sel.email}`);
              setStage("export");
            }}
          />
        )}

        {/* ═══════ EXPORT STAGE ═══════ */}
        {stage === "export" && (
          <ExportPanel
            scored={scored} sfCsv={sfCsv} sfJson={sfJson}
            exportItems={exportItems} exportLabel={exportLabel}
            onBack={() => { setExportItems(null); setExportLabel(""); setStage("results"); }}
          />
        )}

        {/* ═══════ FOOTER ═══════ */}
        <footer className="mt-24 flex items-center justify-between border-t border-border/40 pt-6">
          <div className="text-[11px] text-foreground/45">
            Air GTM · Engineering Challenge
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-foreground/35">
            csv → enrich → score → export
          </div>
        </footer>
      </main>

      {/* ═══════ SUMMARY CONFIRM MODAL ═══════ */}
      <AnimatePresence>
        {showSummaryConfirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowSummaryConfirm(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-md"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border/60 bg-card/90 p-8 shadow-[0_40px_120px_-20px_hsl(0_0%_0%/0.8)] backdrop-blur-2xl"
            >
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" strokeWidth={1.75} />
                </div>
                <div>
                  <h3 className="font-display text-lg font-normal tracking-tight text-foreground">Download Summary Report</h3>
                  <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/45">Markdown · summary_report.md</p>
                </div>
              </div>

              <div className="mb-6 space-y-2 rounded-2xl border border-border/60 bg-background/40 px-4 py-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-foreground/45">Includes</div>
                {[
                  `Overview — ${scored.length} leads, avg ${scored.length > 0 ? Math.round(scored.reduce((a, x) => a + x.sc.s, 0) / scored.length) : 0}`,
                  `Tier distribution — HOT / WARM / COOL / LOW counts`,
                  `Top 10 leads ranked by ICP score`,
                  `Data quality issue breakdown`,
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-foreground/80">
                    <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-primary" strokeWidth={1.75} />
                    {item}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowSummaryConfirm(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    const md = buildSummaryMd(scored, leads);
                    downloadBlob(md, "summary_report.md", "text/markdown");
                    setShowSummaryConfirm(false);
                  }}
                >
                  <Download className="h-3.5 w-3.5" strokeWidth={2} />
                  Download
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════ ORBITAL MODAL ═══════ */}
      <AnimatePresence>
        {orbitOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setOrbitOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-6 backdrop-blur-md"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-[760px] overflow-hidden rounded-3xl border border-border/60 bg-card/90 shadow-[0_40px_120px_-20px_hsl(0_0%_0%/0.8)] backdrop-blur-2xl"
            >
              <button
                onClick={() => setOrbitOpen(false)}
                aria-label="Close"
                className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-background/70 text-foreground/70 backdrop-blur transition-all hover:border-primary/40 hover:text-primary"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
              <PipelineOrbital
                key={orbitInitialId}
                stages={PIPELINE_STAGES}
                height={520}
                initialExpandedId={orbitInitialId}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
