"use client";
import { useState, useCallback, useRef } from "react";

/* ════════════════════ DESIGN TOKENS ════════════════════ */
const C = {
  bg: "#FAFAF7", surface: "#FFFFFF", surfaceAlt: "#F5F4F0",
  border: "#E8E6DF", borderLight: "#F0EEE8",
  text: "#1A1A18", textMd: "#5C5B56", textLt: "#9C9A93",
  accent: "#2D5A3D", accentLight: "#E8F0EB", accentMd: "#4A8B62",
  warm: "#C4713B", warmLight: "#FFF3EB",
  hot: "#2D5A3D", hotBg: "#E8F0EB",
  mid: "#B8860B", midBg: "#FFF8E7",
  cool: "#8B7355", coolBg: "#F5F0EA",
  low: "#A0522D", lowBg: "#FBF0EB",
  danger: "#C0392B", dangerBg: "#FDE8E5",
};
const F = {
  body: "var(--font-inter), -apple-system, sans-serif",
  mono: "var(--font-mono), 'Menlo', monospace",
};

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

  // 1. Pricing / Demo Page Visits
  const pv = lead.pricing_page_views || 0;
  const pvW = W.pageVisits.w;
  if (pv >= 20) { b.pageVisits = pvW; }
  else if (pv >= 10) { b.pageVisits = Math.round(pvW * 0.7); }
  else if (pv >= 3) { b.pageVisits = Math.round(pvW * 0.4); }
  else { b.pageVisits = Math.round(pvW * 0.1); }

  // 2. Signup / Payment Intent
  const siW = W.signupIntent.w;
  const src = (lead.source || "").toLowerCase();
  if (lead.has_signup_intent && src.includes("product signup")) { b.signupIntent = siW; }
  else if (lead.has_signup_intent) { b.signupIntent = Math.round(siW * 0.7); }
  else if (src.includes("event") || src.includes("referral")) { b.signupIntent = Math.round(siW * 0.35); }
  else { b.signupIntent = Math.round(siW * 0.1); }

  // 3. Free-Credit Usage
  const cu = lead.credit_usage_pct || 0;
  const cuW = W.creditUsage.w;
  if (cu >= 80) { b.creditUsage = cuW; }
  else if (cu >= 50) { b.creditUsage = Math.round(cuW * 0.7); }
  else if (cu >= 20) { b.creditUsage = Math.round(cuW * 0.4); }
  else { b.creditUsage = Math.round(cuW * 0.1); }

  // 4. Asset Upload Volume
  const au = lead.asset_uploads || 0;
  const auW = W.assetUploads.w;
  if (au >= 200) { b.assetUploads = auW; }
  else if (au >= 50) { b.assetUploads = Math.round(auW * 0.7); }
  else if (au >= 10) { b.assetUploads = Math.round(auW * 0.4); }
  else { b.assetUploads = Math.round(auW * 0.1); }

  // 5. Team Collaboration
  const ti = lead.teammate_invites || 0;
  const tiW = W.teamCollab.w;
  if (ti >= 10) { b.teamCollab = tiW; }
  else if (ti >= 5) { b.teamCollab = Math.round(tiW * 0.7); }
  else if (ti >= 2) { b.teamCollab = Math.round(tiW * 0.4); }
  else { b.teamCollab = Math.round(tiW * 0.15); }

  // 6. Company Size
  const sz = lead.company_size_min || 0;
  const szW = W.companySize.w;
  if (sz >= 1000) { b.companySize = szW; }
  else if (sz >= 201) { b.companySize = Math.round(szW * 0.7); }
  else if (sz >= 51) { b.companySize = Math.round(szW * 0.4); }
  else { b.companySize = Math.round(szW * 0.15); }

  // 7. Industry Match
  const ind = lead.industry || "";
  const indW = W.industryMatch.w;
  if (TARGET_INDUSTRIES.has(ind)) { b.industryMatch = indW; }
  else { b.industryMatch = Math.round(indW * 0.2); }

  // 8. Marketing / Creative Team
  const mcW = W.mktgCreative.w;
  const hasMktg = lead.has_marketing_title || false;
  const sen = (lead.seniority_level || "").toLowerCase();
  const seniorRoles = ["c-level", "vp", "director"];
  if (hasMktg && seniorRoles.includes(sen)) { b.mktgCreative = mcW; }
  else if (hasMktg) { b.mktgCreative = Math.round(mcW * 0.6); }
  else if (seniorRoles.includes(sen)) { b.mktgCreative = Math.round(mcW * 0.4); }
  else { b.mktgCreative = Math.round(mcW * 0.1); }

  // 9. Channel Expansion
  const ch = lead.active_channels || 0;
  const chW = W.channelExpansion.w;
  if (ch >= 6) { b.channelExpansion = chW; }
  else if (ch >= 4) { b.channelExpansion = Math.round(chW * 0.7); }
  else if (ch >= 2) { b.channelExpansion = Math.round(chW * 0.4); }
  else { b.channelExpansion = Math.round(chW * 0.15); }

  // 10. Creative Hiring
  const cj = lead.creative_job_postings || 0;
  const cjW = W.creativeHiring.w;
  if (cj >= 8) { b.creativeHiring = cjW; }
  else if (cj >= 3) { b.creativeHiring = Math.round(cjW * 0.7); }
  else if (cj >= 1) { b.creativeHiring = Math.round(cjW * 0.4); }
  else { b.creativeHiring = Math.round(cjW * 0.1); }

  Object.values(b).forEach((v) => { total += v; });
  return { s: Math.round(total), b };
}

function tierOf(score) {
  if (score >= 85) return "HOT";
  if (score >= 70) return "WARM";
  if (score >= 55) return "COOL";
  return "LOW";
}

function tierColor(score) {
  if (score >= 85) return C.hot;
  if (score >= 70) return C.mid;
  if (score >= 55) return C.cool;
  return C.low;
}

function tierBg(score) {
  if (score >= 85) return C.hotBg;
  if (score >= 70) return C.midBg;
  if (score >= 55) return C.coolBg;
  return C.lowBg;
}

/* ════════════════════ ATOMS ════════════════════ */

function Pill({ children, color = C.textMd, bg = C.surfaceAlt, style: sx }) {
  return (
    <span style={{ fontSize: 11, fontFamily: F.body, fontWeight: 500, color, background: bg, padding: "4px 11px", borderRadius: 100, whiteSpace: "nowrap", border: `1px solid ${C.borderLight}`, ...sx }}>
      {children}
    </span>
  );
}

function Btn({ children, onClick, v = "ghost", disabled, style: sx }) {
  const map = {
    ghost:   { color: C.textMd, background: "transparent", border: `1px solid ${C.border}` },
    primary: { color: "#fff", background: disabled ? C.textLt : C.accent, border: "none", fontWeight: 700 },
    soft:    { color: C.accent, background: C.accentLight, border: "1px solid transparent" },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{ fontSize: 12, fontFamily: F.body, fontWeight: 600, borderRadius: 8, padding: "8px 16px", cursor: disabled ? "not-allowed" : "pointer", transition: "all .2s", letterSpacing: ".01em", ...map[v], ...sx }}>
      {children}
    </button>
  );
}

function Label({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: C.textLt, fontFamily: F.mono, marginBottom: 10 }}>
      {children}
    </div>
  );
}

function ScoreRing({ val, size = 44 }) {
  const r = size / 2 - 4, circ = 2 * Math.PI * r;
  const color = tierColor(val);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.borderLight} strokeWidth={3} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={3}
          strokeDasharray={circ} strokeDashoffset={circ * (1 - val / 100)} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .8s cubic-bezier(.16,1,.3,1)" }} />
      </svg>
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size > 50 ? 16 : 13, fontWeight: 800, fontFamily: F.mono, color }}>
        {val}
      </span>
    </div>
  );
}

function Slider({ label, value, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: C.text, fontFamily: F.body, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, fontFamily: F.mono, color: C.accent, fontWeight: 600 }}>{value}%</span>
      </div>
      <input type="range" min={0} max={50} value={value} onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%" }} />
    </div>
  );
}

function StatCard({ label, value, sub, i }) {
  return (
    <div style={{ padding: "20px 22px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, animation: `slideUp .4s ease ${i * 0.06}s both` }}>
      <div style={{ fontSize: 30, fontWeight: 300, fontFamily: F.body, color: C.text, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: C.textMd, fontFamily: F.body, marginTop: 6, fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: C.textLt, fontFamily: F.mono, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/* ════════════════════ LEAD ROW ════════════════════ */

function LeadRow({ lead, sc, i, onClick }) {
  const tier = tierOf(sc.s);
  const tc = tierColor(sc.s);
  const tbg = tierBg(sc.s);

  return (
    <div onClick={onClick} style={{
      display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center",
      padding: "18px 22px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14,
      cursor: "pointer", transition: "all .2s", animation: `slideUp .35s ease ${i * 0.03}s both`,
    }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.boxShadow = "0 2px 16px rgba(45,90,61,.06)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = "none"; }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 16, fontWeight: 700, fontFamily: F.body, color: C.text }}>{lead.name || "(no name)"}</span>
          <Pill color={tc} bg={tbg} style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".06em" }}>{tier}</Pill>
          {lead.seniority_level && lead.seniority_level !== "Unknown" && (
            <span style={{ fontSize: 11, color: C.textLt }}>{lead.seniority_level}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
          {lead.company && <Pill>{lead.company}</Pill>}
          {lead.title && <Pill>{lead.title}</Pill>}
          {lead.industry && lead.industry !== "Personal / Unknown" && <Pill>{lead.industry}</Pill>}
          {lead.company_size_band && lead.company_size_band !== "Unknown" && <Pill>{lead.company_size_band} emp</Pill>}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontFamily: F.mono, color: C.textLt }}>{lead.email}</span>
          {lead.source && <Pill color={C.accent} bg={C.accentLight} style={{ fontSize: 9 }}>{lead.source}</Pill>}
          {lead.country && <Pill style={{ fontSize: 9 }}>{lead.country}</Pill>}
        </div>
      </div>
      <ScoreRing val={sc.s} />
    </div>
  );
}

/* ════════════════════ DETAIL PANEL ════════════════════ */

function DetailPanel({ lead, sc, W, onBack }) {
  const fields = [
    ["Email", lead.email],
    ["Phone", lead.phone],
    ["Title", lead.title],
    ["Company", lead.company],
    ["Industry", lead.industry],
    ["Company Size", lead.company_size_band],
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
    <div style={{ animation: "slideUp .4s ease both" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
        <div style={{ fontSize: 12, color: C.textLt, fontFamily: F.mono, letterSpacing: ".04em" }}>LEAD DETAIL</div>
        <Btn v="ghost" onClick={onBack}>Back to Results</Btn>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 400, fontFamily: F.body, color: C.text, marginBottom: 4 }}>{lead.name || "(no name)"}</div>
            <div style={{ fontSize: 13, color: C.textLt, fontFamily: F.mono }}>
              {lead.title}{lead.company ? ` · ${lead.company}` : ""}
            </div>
          </div>
          <ScoreRing val={sc.s} size={64} />
        </div>

        {/* Lead info grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 28 }}>
          {fields.map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 10, color: C.textLt, fontFamily: F.mono, letterSpacing: ".06em", marginBottom: 3 }}>{k.toUpperCase()}</div>
              {v ? (
                <div style={{ fontSize: 13, color: C.text, fontFamily: F.body, lineHeight: 1.5 }}>{v}</div>
              ) : (
                <div style={{ fontSize: 12, color: C.textLt, fontFamily: F.mono, fontStyle: "italic" }}>--</div>
              )}
            </div>
          ))}
        </div>

        {/* Product signals */}
        <Label>Product Usage Signals</Label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
          {signals.map(([k, v]) => (
            <div key={k} style={{ padding: "12px 14px", background: C.surfaceAlt, borderRadius: 10, border: `1px solid ${C.borderLight}` }}>
              <div style={{ fontSize: 10, color: C.textLt, fontFamily: F.mono, letterSpacing: ".06em", marginBottom: 4 }}>{k.toUpperCase()}</div>
              <div style={{ fontSize: 18, fontWeight: 600, fontFamily: F.mono, color: C.text }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Score breakdown */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
          <div>
            <Label>ICP Score Breakdown</Label>
            {Object.entries(W).map(([k, cfg]) => {
              const earned = sc.b[k] || 0;
              const max = cfg.w;
              const pct = max > 0 ? (earned / max) * 100 : 0;
              const barCol = pct >= 80 ? C.accent : pct >= 50 ? C.mid : C.low;
              return (
                <div key={k} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: C.textMd, fontFamily: F.body }}>{cfg.label}</span>
                    <span style={{ fontSize: 11, fontFamily: F.mono, color: C.text, fontWeight: 600 }}>{earned}/{max}</span>
                  </div>
                  <div style={{ width: "100%", height: 5, background: C.surfaceAlt, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: barCol, transition: "width .6s ease" }} />
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 14, padding: "12px 16px", background: C.accentLight, borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Total Score</span>
              <span style={{ fontSize: 20, fontWeight: 800, fontFamily: F.mono, color: C.accent }}>{sc.s}</span>
            </div>
          </div>

          <div>
            <Label>Data Quality Issues</Label>
            {(lead.data_quality_issues || []).length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {lead.data_quality_issues.map((issue, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: C.warm, fontFamily: F.mono, fontWeight: 700 }}>{String(i + 1).padStart(2, "0")}</span>
                    <span style={{ fontSize: 12, color: C.text, fontFamily: F.body }}>{issue.replace(/_/g, " ")}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.textLt, fontStyle: "italic" }}>No issues detected</div>
            )}

            {lead.score_breakdown && lead.score_breakdown.length > 0 && (
              <>
                <div style={{ marginTop: 22 }} />
                <Label>Pipeline Scoring Rules Fired</Label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {lead.score_breakdown.map((rule, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", background: C.surfaceAlt, borderRadius: 8 }}>
                      <span style={{ fontSize: 11, color: C.textMd }}>{rule.description || rule.rule_id}</span>
                      <span style={{ fontSize: 11, fontFamily: F.mono, fontWeight: 700, color: rule.points > 0 ? C.accent : C.low }}>
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
    </div>
  );
}

/* ════════════════════ REVIEW PANEL ════════════════════ */

function ReviewPanel({ reviewData, onConfirm, onBack }) {
  // Track decisions: merges and deletions.
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
    <div style={{ animation: "slideUp .4s ease both" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
        <div style={{ fontSize: 12, color: C.textLt, fontFamily: F.mono, letterSpacing: ".04em" }}>REVIEW MERGES &amp; DELETIONS</div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn v="ghost" onClick={onBack}>Back to Upload</Btn>
          <Btn v="primary" onClick={handleConfirm}>
            Confirm &amp; Run Pipeline
          </Btn>
        </div>
      </div>

      {/* Summary bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        <StatCard i={0} label="Total Rows" value={reviewData.total_rows} />
        <StatCard i={1} label="Valid Leads" value={reviewData.valid_leads} />
        <StatCard i={2} label="Duplicate Groups" value={dupGroups.length} sub={`${approvedCount} merge, ${rejectedCount} keep separate`} />
        <StatCard i={3} label="Dropped Rows" value={droppedRows.length} sub={`${restoredCount} restore, ${confirmedDrops} confirm drop`} />
      </div>

      {/* Duplicate groups */}
      {dupGroups.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <Label>Duplicate Groups ({dupGroups.length})</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {dupGroups.map((group) => {
              const decision = mergeDecisions[group.email];
              return (
                <div key={group.email} style={{
                  background: C.surface, border: `1px solid ${decision === "approve" ? C.accent : C.border}`,
                  borderRadius: 14, padding: 20, transition: "border-color .2s",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{group.email}</span>
                      <span style={{ fontSize: 12, color: C.textLt, marginLeft: 10 }}>{group.rows.length} rows</span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn v={decision === "approve" ? "soft" : "ghost"}
                        onClick={() => setMergeDecisions((p) => ({ ...p, [group.email]: "approve" }))}
                        style={{ fontSize: 11 }}>
                        Merge
                      </Btn>
                      <Btn v={decision === "reject" ? "soft" : "ghost"}
                        onClick={() => setMergeDecisions((p) => ({ ...p, [group.email]: "reject" }))}
                        style={{ fontSize: 11, color: decision === "reject" ? C.warm : undefined }}>
                        Keep Separate
                      </Btn>
                    </div>
                  </div>

                  {/* Show the rows side by side */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {group.rows.map((row, ri) => (
                      <div key={ri} style={{
                        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8,
                        padding: "10px 14px", background: C.surfaceAlt, borderRadius: 8, fontSize: 12,
                      }}>
                        <div><span style={{ color: C.textLt, fontFamily: F.mono, fontSize: 10 }}>NAME</span><br />{row.name || "--"}</div>
                        <div><span style={{ color: C.textLt, fontFamily: F.mono, fontSize: 10 }}>COMPANY</span><br />{row.company || "--"}</div>
                        <div><span style={{ color: C.textLt, fontFamily: F.mono, fontSize: 10 }}>TITLE</span><br />{row.title || "--"}</div>
                        <div><span style={{ color: C.textLt, fontFamily: F.mono, fontSize: 10 }}>SOURCE</span><br />{row.source || "--"}</div>
                      </div>
                    ))}
                  </div>

                  {decision === "approve" && (
                    <div style={{ marginTop: 10, padding: "10px 14px", background: C.accentLight, borderRadius: 8, fontSize: 12 }}>
                      <span style={{ fontFamily: F.mono, fontSize: 10, color: C.accent, fontWeight: 700 }}>MERGED RESULT</span>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 6 }}>
                        <div>{group.proposed_merge.name || "--"}</div>
                        <div>{group.proposed_merge.company || "--"}</div>
                        <div>{group.proposed_merge.title || "--"}</div>
                        <div>{group.proposed_merge.source || "--"}</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dropped rows */}
      {droppedRows.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <Label>Dropped Rows &mdash; Invalid/Missing Email ({droppedRows.length})</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {droppedRows.map((drop, i) => {
              const decision = dropDecisions[i];
              return (
                <div key={i} style={{
                  background: C.surface, border: `1px solid ${decision === "restore" ? C.warm : C.border}`,
                  borderRadius: 10, padding: "14px 18px", display: "flex", justifyContent: "space-between",
                  alignItems: "center", transition: "border-color .2s",
                }}>
                  <div style={{ display: "flex", gap: 20, fontSize: 12, flexWrap: "wrap" }}>
                    <div>
                      <span style={{ color: C.textLt, fontFamily: F.mono, fontSize: 10 }}>ROW</span>
                      <div>{drop.row_num}</div>
                    </div>
                    <div>
                      <span style={{ color: C.textLt, fontFamily: F.mono, fontSize: 10 }}>NAME</span>
                      <div>{drop.raw.Name || "--"}</div>
                    </div>
                    <div>
                      <span style={{ color: C.textLt, fontFamily: F.mono, fontSize: 10 }}>EMAIL (RAW)</span>
                      <div style={{ fontFamily: F.mono, color: C.low }}>{drop.raw.Email || "(empty)"}</div>
                    </div>
                    <div>
                      <span style={{ color: C.textLt, fontFamily: F.mono, fontSize: 10 }}>REASON</span>
                      <div>{drop.reason.replace(/_/g, " ")}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn v={decision === "confirm" ? "soft" : "ghost"}
                      onClick={() => setDropDecisions((p) => ({ ...p, [i]: "confirm" }))}
                      style={{ fontSize: 11 }}>
                      Drop
                    </Btn>
                    <Btn v={decision === "restore" ? "soft" : "ghost"}
                      onClick={() => setDropDecisions((p) => ({ ...p, [i]: "restore" }))}
                      style={{ fontSize: 11, color: decision === "restore" ? C.warm : undefined }}>
                      Restore
                    </Btn>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom confirm */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
        <Btn v="ghost" onClick={onBack}>Back</Btn>
        <Btn v="primary" onClick={handleConfirm} style={{ padding: "12px 28px", fontSize: 14 }}>
          Confirm &amp; Run Pipeline
        </Btn>
      </div>
    </div>
  );
}

/* ════════════════════ EXPORT PANEL ════════════════════ */

function ExportPanel({ leads, scored, sfCsv, sfJson, onBack }) {
  const [format, setFormat] = useState("csv");

  function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDownload() {
    if (format === "csv") {
      if (sfCsv) {
        downloadBlob(sfCsv, "salesforce_leads.csv", "text/csv");
      }
    } else {
      const payload = sfJson || scored.map(({ l, sc }) => ({
        ...l,
        icp_score: sc.s,
        icp_tier: tierOf(sc.s),
        icp_breakdown: sc.b,
      }));
      downloadBlob(JSON.stringify(payload, null, 2), "leads_export.json", "application/json");
    }
  }

  const previewData = format === "csv"
    ? (sfCsv || "").split("\n").slice(0, 8).join("\n")
    : JSON.stringify(
        (sfJson?.records || scored.slice(0, 3).map(({ l, sc }) => ({
          ...l, icp_score: sc.s, icp_tier: tierOf(sc.s),
        }))),
        null, 2
      ).slice(0, 800);

  return (
    <div style={{ animation: "slideUp .4s ease both" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
        <div style={{ fontSize: 12, color: C.textLt, fontFamily: F.mono, letterSpacing: ".04em" }}>EXPORT</div>
        <Btn v="ghost" onClick={onBack}>Back to Results</Btn>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 400, fontFamily: F.body, color: C.text, marginBottom: 6 }}>
          Export {leads.length} Leads
        </div>
        <p style={{ fontSize: 13, color: C.textMd, marginBottom: 24, lineHeight: 1.6 }}>
          Download scored leads for Salesforce ingestion or further processing.
        </p>

        {/* Format toggle */}
        <Label>Format</Label>
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          <Btn v={format === "csv" ? "soft" : "ghost"} onClick={() => setFormat("csv")} style={{ borderRadius: 8 }}>
            CSV for Salesforce
          </Btn>
          <Btn v={format === "json" ? "soft" : "ghost"} onClick={() => setFormat("json")} style={{ borderRadius: 8 }}>
            JSON
          </Btn>
        </div>

        <div style={{ marginBottom: 8 }}>
          <Label>{format === "csv" ? "Salesforce Bulk API CSV Preview" : "JSON Preview"}</Label>
        </div>
        <div style={{
          background: C.surfaceAlt, border: `1px solid ${C.borderLight}`, borderRadius: 10,
          padding: 16, maxHeight: 280, overflow: "auto", marginBottom: 24,
        }}>
          <pre style={{ fontSize: 11, fontFamily: F.mono, color: C.textMd, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
            {previewData || "No data available. Run the pipeline first."}
          </pre>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Btn v="primary" onClick={handleDownload} disabled={!previewData}
            style={{ padding: "12px 28px", fontSize: 14, borderRadius: 10 }}>
            Download {format.toUpperCase()}
          </Btn>
          <span style={{ fontSize: 12, color: C.textLt }}>
            {format === "csv" ? "Salesforce Bulk API 2.0 compatible" : "Includes ICP scores and breakdown"}
          </span>
        </div>
      </div>
    </div>
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
  const fileRef = useRef(null);

  // Score all leads with current weights.
  const scored = leads.map((l) => ({ l, sc: scoreLead(l, W) }));

  // Filter + sort.
  const filtered = scored
    .filter((x) => {
      if (filter === "hot" && x.sc.s < 85) return false;
      if (filter === "warm" && (x.sc.s < 70 || x.sc.s >= 85)) return false;
      if (filter === "cool" && (x.sc.s < 55 || x.sc.s >= 70)) return false;
      if (filter === "low" && x.sc.s >= 55) return false;
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

  function updW(k, v) {
    setW((p) => ({ ...p, [k]: { ...p[k], w: v } }));
  }

  const totalWeight = Object.values(W).reduce((a, b) => a + b.w, 0);

  // Drop handler
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) {
      setCsvFile(file);
    }
  }, []);

  async function runPipeline() {
    setBusy(true);
    setProg(0);
    setError(null);

    const progInterval = setInterval(() => {
      setProg((p) => Math.min(p + Math.random() * 12, 92));
    }, 300);

    try {
      if (manualReview) {
        // Step 1: Get review data (duplicates + drops) without running full pipeline.
        let res;
        if (csvFile) {
          const form = new FormData();
          form.append("file", csvFile);
          res = await fetch("/api/pipeline/review", { method: "POST", body: form });
        } else {
          res = await fetch("/api/pipeline/review", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
        }

        clearInterval(progInterval);
        setProg(100);

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Review step failed");
        }

        const data = await res.json();
        setReviewData(data);
        setStage("review");
      } else {
        // Auto mode: run full pipeline directly.
        let res;
        if (csvFile) {
          const form = new FormData();
          form.append("file", csvFile);
          form.append("seed", "42");
          res = await fetch("/api/pipeline", { method: "POST", body: form });
        } else {
          res = await fetch("/api/pipeline", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ seed: 42 }),
          });
        }

        clearInterval(progInterval);
        setProg(100);

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Pipeline failed");
        }

        const data = await res.json();
        setLeads(data.leads || []);
        setSfCsv(data.salesforce_csv || "");
        setSfJson(data.salesforce_json || null);
        setStage("results");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      clearInterval(progInterval);
    }
  }

  async function handleReviewConfirm(decisions) {
    setBusy(true);
    setProg(0);
    setError(null);

    const progInterval = setInterval(() => {
      setProg((p) => Math.min(p + Math.random() * 10, 92));
    }, 300);

    try {
      const res = await fetch("/api/pipeline/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...decisions,
          seed: 42,
        }),
      });

      clearInterval(progInterval);
      setProg(100);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Finalize failed");
      }

      const data = await res.json();
      setLeads(data.leads || []);
      setSfCsv(data.salesforce_csv || "");
      setSfJson(data.salesforce_json || null);
      setReviewData(null);
      setStage("results");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      clearInterval(progInterval);
    }
  }

  function reset() {
    setLeads([]); setSel(null); setCsvFile(null); setStage("upload");
    setProg(0); setShowW(false); setError(null); setSearch("");
    setFilter("all"); setSfCsv(""); setSfJson(null);
    setReviewData(null);
  }

  // Stage mapping for progress indicator
  const steps = manualReview
    ? ["Upload CSV", "Review", "Pipeline Results", "Lead Detail", "Export"]
    : ["Upload CSV", "Pipeline Results", "Lead Detail", "Export"];
  const stageMap = manualReview
    ? { upload: 0, processing: 0, review: 1, results: 2, detail: 3, export: 4 }
    : { upload: 0, processing: 0, results: 1, detail: 2, export: 3 };
  const ci = stageMap[stage] ?? 0;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: F.body }}>
      {/* ── TOPBAR ── */}
      <div style={{ borderBottom: `1px solid ${C.border}`, background: "rgba(250,250,247,.85)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "14px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontFamily: F.body, fontWeight: 700 }}>A</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: F.body, color: C.text, letterSpacing: ".01em" }}>Air GTM Pipeline</div>
              <div style={{ fontSize: 10, color: C.textLt, fontFamily: F.mono, letterSpacing: ".04em" }}>LEAD SCORING ENGINE</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            {steps.map((s, i) => (
              <div key={s} style={{
                padding: "7px 14px", fontSize: 11, fontWeight: 600, fontFamily: F.body,
                color: i === ci ? C.accent : i < ci ? C.accentMd : C.textLt,
                background: i === ci ? C.accentLight : "transparent",
                borderRadius: 6, display: "flex", alignItems: "center", gap: 7, transition: "all .25s",
              }}>
                <span style={{
                  width: 18, height: 18, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 800, fontFamily: F.mono,
                  background: i < ci ? C.accent : i === ci ? C.accent : "transparent",
                  color: i <= ci ? "#fff" : C.textLt,
                  border: i > ci ? `1.5px solid ${C.border}` : "none",
                }}>{i < ci ? "\u2713" : i + 1}</span>
                {s}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "40px 32px 100px" }}>
        {/* ── HEADER ── */}
        <div style={{ marginBottom: 40, animation: "slideUp .5s ease both" }}>
          <h1 style={{ fontSize: 36, fontWeight: 700, fontFamily: F.body, color: C.text, lineHeight: 1.2, letterSpacing: "-.02em", marginBottom: 10 }}>
            Lead Pipeline<br /><span style={{ color: C.accent }}>&amp; ICP Scoring Engine</span>
          </h1>
          <p style={{ fontSize: 15, color: C.textMd, maxWidth: 640, lineHeight: 1.65, fontWeight: 400 }}>
            Upload a CSV, run the enrichment pipeline, adjust ICP scoring weights in real-time, deep-dive any lead, and export Salesforce-ready outputs.
          </p>
        </div>

        {/* ── ERROR ── */}
        {error && (
          <div style={{ padding: "14px 20px", background: C.warmLight, border: `1px solid ${C.warm}`, borderRadius: 10, marginBottom: 20, fontSize: 13, color: C.warm, fontFamily: F.body, animation: "slideUp .3s ease both" }}>
            {error}
            <button onClick={() => setError(null)} style={{ marginLeft: 12, background: "none", border: "none", color: C.warm, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>&times;</button>
          </div>
        )}

        {/* ════════════ UPLOAD STAGE ════════════ */}
        {stage === "upload" && !busy && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 24, animation: "slideUp .4s ease both" }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <label style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Lead Data</label>
                {csvFile && (
                  <Btn v="ghost" onClick={() => setCsvFile(null)} style={{ fontSize: 11 }}>Clear file</Btn>
                )}
              </div>

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? C.accent : C.border}`,
                  borderRadius: 12, padding: "48px 24px", textAlign: "center",
                  cursor: "pointer", transition: "all .2s",
                  background: dragOver ? C.accentLight : C.surfaceAlt,
                  marginBottom: 16,
                }}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  style={{ display: "none" }}
                  onChange={(e) => { if (e.target.files[0]) setCsvFile(e.target.files[0]); }}
                />
                {csvFile ? (
                  <>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.accent, marginBottom: 4 }}>{csvFile.name}</div>
                    <div style={{ fontSize: 12, color: C.textLt }}>{(csvFile.size / 1024).toFixed(1)} KB</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 28, marginBottom: 8, color: C.textLt }}>+</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: C.text, marginBottom: 4 }}>
                      Drop a CSV here or click to browse
                    </div>
                    <div style={{ fontSize: 12, color: C.textLt }}>
                      Or leave empty to use the default <code style={{ fontFamily: F.mono, background: C.surfaceAlt, padding: "1px 5px", borderRadius: 3, border: `1px solid ${C.borderLight}` }}>messy_leads.csv</code>
                    </div>
                  </>
                )}
              </div>

              <Btn v="primary" onClick={runPipeline}
                style={{ width: "100%", padding: "14px", fontSize: 14, borderRadius: 10 }}>
                Run Pipeline{csvFile ? ` on ${csvFile.name}` : " on Default Data"}
              </Btn>

              {/* Manual review toggle */}
              <div style={{
                marginTop: 14, padding: "12px 16px", background: C.surfaceAlt,
                borderRadius: 10, border: `1px solid ${C.borderLight}`,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>Manual Review</div>
                  <div style={{ fontSize: 11, color: C.textLt, marginTop: 2 }}>
                    Review merges &amp; deletions before scoring
                  </div>
                </div>
                <button
                  onClick={() => setManualReview((v) => !v)}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                    background: manualReview ? C.accent : C.border,
                    position: "relative", transition: "background .2s",
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%", background: "#fff",
                    position: "absolute", top: 3,
                    left: manualReview ? 23 : 3,
                    transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.15)",
                  }} />
                </button>
              </div>
            </div>

            {/* ICP Weights sidebar */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
              <Label>ICP Scoring Weights</Label>
              <p style={{ fontSize: 12, color: C.textMd, marginBottom: 16, lineHeight: 1.6 }}>
                Configure how each signal contributes to lead scoring. Scores update in real-time after pipeline runs.
              </p>
              {Object.entries(W).map(([k, cfg]) => (
                <Slider key={k} label={cfg.label} value={cfg.w} onChange={(v) => updW(k, v)} />
              ))}
              <div style={{ marginTop: 8, padding: 12, background: C.surfaceAlt, borderRadius: 10, border: `1px solid ${C.borderLight}` }}>
                <div style={{ fontSize: 11, fontFamily: F.mono, color: C.textLt }}>
                  Total: <strong style={{ color: totalWeight === 100 ? C.accent : C.warm }}>{totalWeight}%</strong>
                  {totalWeight === 100 ? " \u2713" : " \u2014 adjust to 100%"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════════ PROCESSING ════════════ */}
        {busy && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 32, animation: "fadeIn .3s ease both" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 22, height: 22, border: `2.5px solid ${C.border}`, borderTopColor: C.accent, borderRadius: "50%", animation: "spin .7s linear infinite" }} />
              <div>
                <div style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>Running pipeline: normalize, dedupe, enrich, score...</div>
                <div style={{ fontSize: 12, color: C.textLt, fontFamily: F.mono, marginTop: 3 }}>{Math.round(prog)}% complete</div>
              </div>
            </div>
            <div style={{ width: "100%", height: 4, background: C.surfaceAlt, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${prog}%`, height: "100%", background: C.accent, borderRadius: 3, transition: "width .3s ease" }} />
            </div>
          </div>
        )}

        {/* ════════════ REVIEW STAGE ════════════ */}
        {stage === "review" && reviewData && !busy && (
          <ReviewPanel
            reviewData={reviewData}
            onConfirm={handleReviewConfirm}
            onBack={() => { setReviewData(null); setStage("upload"); }}
          />
        )}

        {/* ════════════ RESULTS STAGE ════════════ */}
        {stage === "results" && leads.length > 0 && (
          <div style={{ animation: "slideUp .4s ease both" }}>
            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
              <StatCard i={0} label="Total Leads" value={scored.length} />
              <StatCard i={1} label="Avg ICP Score" value={Math.round(scored.reduce((a, x) => a + x.sc.s, 0) / scored.length)} sub={`${scored.filter((x) => x.sc.s >= 85).length} hot leads`} />
              <StatCard i={2} label="Enriched" value={leads.filter((l) => l.enrichment_status === "ok").length} sub={`of ${leads.length} total`} />
              <StatCard i={3} label="Avg Credit Usage" value={Math.round(leads.reduce((a, l) => a + (l.credit_usage_pct || 0), 0) / leads.length) + "%"} sub="product engagement" />
            </div>

            {/* Controls */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: C.textLt, fontFamily: F.mono, marginRight: 4 }}>FILTER</span>
                {["all", "hot", "warm", "cool", "low"].map((t) => {
                  const cnt = t === "all" ? scored.length : scored.filter((x) => tierOf(x.sc.s) === t.toUpperCase()).length;
                  return <Btn key={t} v={filter === t ? "soft" : "ghost"} onClick={() => setFilter(t)} style={{ textTransform: "capitalize", fontSize: 11 }}>{t} ({cnt})</Btn>;
                })}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="search" placeholder="Search leads..."
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  style={{
                    background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 8,
                    padding: "6px 12px", fontSize: 12, color: C.text, outline: "none", width: 180,
                    fontFamily: F.body,
                  }}
                />
                <span style={{ fontSize: 11, color: C.textLt, fontFamily: F.mono, marginLeft: 4, marginRight: 4 }}>SORT</span>
                {[{ k: "score", l: "Score" }, { k: "name", l: "Name" }, { k: "company", l: "Company" }].map((s) =>
                  <Btn key={s.k} v={sort === s.k ? "soft" : "ghost"} onClick={() => setSort(s.k)} style={{ fontSize: 11 }}>{s.l}</Btn>
                )}
                <div style={{ width: 1, height: 20, background: C.border, margin: "0 4px" }} />
                <Btn v="ghost" onClick={() => setShowW(!showW)} style={{ fontSize: 11 }}>{showW ? "Hide Weights" : "Weights"}</Btn>
                <Btn v="primary" onClick={() => setStage("export")} style={{ fontSize: 11 }}>Export</Btn>
                <Btn v="ghost" onClick={reset} style={{ fontSize: 11 }}>Reset</Btn>
              </div>
            </div>

            {/* Inline weights panel */}
            {showW && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22, marginBottom: 18, animation: "slideUp .3s ease both" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <Label>Adjust ICP Weights &mdash; scores update live</Label>
                  <div style={{ fontSize: 11, fontFamily: F.mono, color: totalWeight === 100 ? C.accent : C.warm }}>
                    Total: {totalWeight}%{totalWeight === 100 ? " \u2713" : ""}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 32px" }}>
                  {Object.entries(W).map(([k, cfg]) => (
                    <Slider key={k} label={cfg.label} value={cfg.w} onChange={(v) => updW(k, v)} />
                  ))}
                </div>
              </div>
            )}

            {/* Lead list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map(({ l, sc }, i) => (
                <LeadRow key={l.email} lead={l} sc={sc} i={i} onClick={() => { setSel(l); setStage("detail"); }} />
              ))}
            </div>
            {filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: 48, color: C.textLt, fontFamily: F.body }}>No leads match this filter.</div>
            )}

            <div style={{ marginTop: 12, fontSize: 12, color: C.textLt, fontFamily: F.mono }}>
              Showing {filtered.length} of {scored.length} leads
            </div>
          </div>
        )}

        {/* ════════════ DETAIL STAGE ════════════ */}
        {stage === "detail" && sel && (
          <DetailPanel lead={sel} sc={scoreLead(sel, W)} W={W} onBack={() => { setSel(null); setStage("results"); }} />
        )}

        {/* ════════════ EXPORT STAGE ════════════ */}
        {stage === "export" && (
          <ExportPanel leads={leads} scored={scored} sfCsv={sfCsv} sfJson={sfJson} onBack={() => setStage("results")} />
        )}

        {/* ── FOOTER ── */}
        <div style={{ marginTop: 72, paddingTop: 22, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 11, color: C.textLt, fontFamily: F.body }}>Air GTM Engineering Challenge</div>
          <div style={{ fontSize: 10, color: C.textLt, fontFamily: F.mono, letterSpacing: ".04em" }}>CSV &rarr; ENRICH &rarr; SCORE &rarr; EXPORT</div>
        </div>
      </div>
    </div>
  );
}
