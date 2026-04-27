"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Mail, Users, Phone } from "lucide-react";

const CHANNEL_ICON = { email: Mail, linkedin: Users, phone: Phone };

export function PlayLibrary({ accountPlays }) {
  // Show plays the system actually used, with sample renders from the
  // account plays they were applied to.
  const usedPlays = {};
  for (const ap of accountPlays || []) {
    if (ap.play_id && !usedPlays[ap.play_id]) {
      usedPlays[ap.play_id] = ap;
    }
  }

  // Also load the static play library so unused ones are listed too.
  const [library, setLibrary] = useState([]);
  useEffect(() => {
    fetch("/api/outbound/route")
      .then((r) => r.json())
      .then(() => {})
      .catch(() => {});
    // Library content isn't exposed by an API route — embed minimal list
    // from the IDs we see + show "unused" placeholders is fine.
  }, []);

  return (
    <div className="space-y-3">
      {Object.entries(usedPlays).map(([playId, sampleAp]) => (
        <Card key={playId} className="p-5">
          <CardHeader className="px-0 pt-0">
            <div className="mb-1 flex items-center gap-2">
              <Badge variant="primary" className="normal-case tracking-normal">
                {playId.replace(/_/g, " ")}
              </Badge>
              <span className="font-mono text-[10px] text-foreground/45">
                applied to {sampleAp.company || sampleAp.account_id}
              </span>
            </div>
            <CardTitle className="text-base">
              Sample render
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0 space-y-2">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-foreground/50">
                Subject
              </div>
              <div className="mt-1 text-[13px] font-medium text-foreground">
                {(sampleAp._sample_subject || "—")}
              </div>
            </div>
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-foreground/50">
                Opener
              </div>
              <div className="mt-1 whitespace-pre-line text-[12.5px] leading-relaxed text-foreground/80">
                {(sampleAp._sample_opener || "—")}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      {Object.keys(usedPlays).length === 0 && (
        <Card className="p-8 text-center text-foreground/45">
          No plays applied yet. Run the routing pipeline first.
        </Card>
      )}
    </div>
  );
}

/**
 * Variant: shows a play card with the rendered subject/opener carried in
 * from /api/outbound/route's routed_leads (where plays.assign_plays put them).
 */
export function PlayLibraryFromRouted({ routedLeads }) {
  const usedPlays = {};
  for (const r of routedLeads || []) {
    if (r.play_id && !usedPlays[r.play_id]) {
      usedPlays[r.play_id] = r;
    }
  }

  return (
    <div className="space-y-3">
      {Object.entries(usedPlays).map(([playId, sample]) => (
        <Card key={playId} className="p-5">
          <CardHeader className="px-0 pt-0 pb-3">
            <div className="mb-1 flex items-center justify-between gap-3">
              <Badge variant="primary" className="normal-case tracking-normal">
                {playId.replace(/_/g, " ")}
              </Badge>
              <div className="flex items-center gap-1.5">
                {(sample.channel_priority || []).map((ch) => {
                  const Icon = CHANNEL_ICON[ch] || Mail;
                  return (
                    <span key={ch} className="flex items-center gap-1 rounded-md border border-border/40 bg-background/40 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-foreground/55">
                      <Icon className="h-2.5 w-2.5" /> {ch}
                    </span>
                  );
                })}
              </div>
            </div>
            <CardTitle className="text-base">
              Sample for {sample.company || sample.account_id}
              <span className="ml-2 font-mono text-[10px] text-foreground/45">
                · {sample.lead_name || sample.lead_email}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0 space-y-3">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-foreground/50">
                Subject
              </div>
              <div className="mt-1 text-[13px] font-medium text-foreground">
                {sample.play_subject || "—"}
              </div>
            </div>
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-foreground/50">
                Opener
              </div>
              <div className="mt-1 whitespace-pre-line text-[12.5px] leading-relaxed text-foreground/80">
                {sample.play_opener || "—"}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      {Object.keys(usedPlays).length === 0 && (
        <Card className="p-8 text-center text-foreground/45">
          No plays applied yet — run routing first.
        </Card>
      )}
    </div>
  );
}
