"use client";
import { Badge } from "@/app/components/ui/badge";
import { Zap, Building2, Users, Briefcase, Sparkles, RotateCcw, TrendingUp, Target } from "lucide-react";

const SIGNAL_META = {
  funding_recent:           { label: "Funding",       icon: TrendingUp, variant: "ember" },
  exec_hire_marketing:      { label: "New CMO/VP",    icon: Users,      variant: "primary" },
  exec_hire_creative:       { label: "New CD",        icon: Users,      variant: "primary" },
  creative_hiring_spike:    { label: "Hiring spike",  icon: Users,      variant: "amber" },
  competitor_dam_in_stack:  { label: "Competitor DAM",icon: Target,     variant: "ember" },
  rebrand_or_campaign:      { label: "Rebrand",       icon: Sparkles,   variant: "amber" },
  agency_change:            { label: "Agency change", icon: RotateCcw,  variant: "amber" },
  ad_spend_ramp:            { label: "Ad spend up",   icon: Zap,        variant: "outline" },
  channel_expansion_new:    { label: "New channel",   icon: Briefcase,  variant: "outline" },
};

export function SignalChip({ signal }) {
  const meta = SIGNAL_META[signal.signal_type] ||
    { label: signal.signal_type, icon: Building2, variant: "outline" };
  const Icon = meta.icon;
  const detail = describeSignal(signal);
  return (
    <Badge variant={meta.variant} className="gap-1.5 normal-case tracking-normal">
      <Icon className="h-3 w-3" strokeWidth={2} />
      <span className="font-medium">{meta.label}</span>
      {detail && <span className="text-foreground/55">· {detail}</span>}
    </Badge>
  );
}

export function SignalChips({ signals = [] }) {
  if (!signals.length) {
    return (
      <Badge variant="outline" className="gap-1.5 normal-case tracking-normal text-foreground/50">
        firmographic fit only
      </Badge>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {signals.map((s, i) => <SignalChip key={i} signal={s} />)}
    </div>
  );
}

function describeSignal(s) {
  const p = s.payload || {};
  switch (s.signal_type) {
    case "funding_recent":
      return `${p.round} $${p.amount_m_usd}M`;
    case "exec_hire_marketing":
    case "exec_hire_creative":
      return p.exec_title || "";
    case "creative_hiring_spike":
      return `${p.role_count_30d} roles / 30d`;
    case "competitor_dam_in_stack":
      return p.competitor || "";
    case "rebrand_or_campaign":
      return p.campaign_or_rebrand || "";
    case "agency_change":
      return `${p.from_agency} → ${p.to_agency}`;
    case "ad_spend_ramp":
      return `+${p.pct_increase}% ${p.channel}`;
    case "channel_expansion_new":
      return p.new_channel || "";
    default:
      return "";
  }
}
