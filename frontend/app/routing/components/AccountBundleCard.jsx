"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Building2, Users, Sparkles } from "lucide-react";
import { SignalChips } from "./SignalChips";

function ContactRow({ contact, isPrimary }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border/40 bg-background/30 px-4 py-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">
            {contact.name || contact.email}
          </span>
          {isPrimary && (
            <Badge variant="primary" className="text-[8px]">Primary</Badge>
          )}
          <Badge variant="solid" className="normal-case tracking-normal text-[9px]">
            {contact.role.replace(/_/g, " ")}
          </Badge>
        </div>
        {contact.title && (
          <div className="mt-0.5 text-[11px] text-foreground/55">{contact.title}</div>
        )}
        <div className="mt-1 font-mono text-[10px] text-foreground/40">
          {contact.email}
        </div>
        <div className="mt-1 text-[11px] italic text-foreground/55">
          {contact.why}
        </div>
      </div>
      <div className="text-right">
        <span className="font-mono text-[14px] font-semibold text-primary">
          {contact.fit_score}
        </span>
        <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-foreground/40">
          fit
        </div>
      </div>
    </div>
  );
}

export function AccountBundleCard({ play }) {
  const contactCount = play.supporting_leads.length + 1;
  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.24em] text-foreground/50">
            <Building2 className="h-3 w-3" /> {play.account_id}
          </div>
          <CardTitle className="text-xl">
            {play.company || play.account_id}
          </CardTitle>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {play.outbound_vertical && (
              <Badge variant="solid" className="normal-case tracking-normal">{play.outbound_vertical}</Badge>
            )}
            {play.industry && (
              <Badge variant="outline" className="normal-case tracking-normal">{play.industry}</Badge>
            )}
            {play.company_size_band && (
              <Badge variant="outline" className="normal-case tracking-normal">{play.company_size_band} emp</Badge>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-foreground/50">
            Assigned to
          </div>
          <div className="font-display text-lg text-foreground">{play.rep_name}</div>
          <div className="mt-0.5 flex items-center justify-end gap-1 font-mono text-[10px] text-foreground/45">
            <Users className="h-2.5 w-2.5" />
            {contactCount} {contactCount === 1 ? "contact" : "contacts"}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.24em] text-foreground/50">
          Account signals
        </div>
        <SignalChips signals={play.signals || []} />
      </div>

      <div className="mb-4 space-y-2">
        <ContactRow contact={play.primary_lead} isPrimary />
        {play.supporting_leads.slice(0, 3).map((c, i) => (
          <ContactRow key={i} contact={c} isPrimary={false} />
        ))}
        {play.supporting_leads.length > 3 && (
          <div className="px-1 font-mono text-[10px] text-foreground/45">
            +{play.supporting_leads.length - 3} more contacts at this account
          </div>
        )}
      </div>

      <CardContent className="rounded-xl border border-primary/20 bg-primary/[0.05] p-4">
        <div className="mb-2 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.24em] text-primary">
          <Sparkles className="h-3 w-3" /> Recommended sequence
        </div>
        <ol className="space-y-1.5 text-[12.5px] text-foreground/85">
          {play.sequence.map((step, i) => (
            <li key={i} className="leading-relaxed">{step}</li>
          ))}
        </ol>
        {play.play_id && (
          <div className="mt-3 font-mono text-[10px] text-foreground/55">
            opening play · <span className="text-primary">{play.play_id.replace(/_/g, " ")}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
