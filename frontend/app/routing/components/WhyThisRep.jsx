"use client";
import { Card, CardHeader, CardTitle, CardContent } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { X } from "lucide-react";

export function WhyThisRep({ open, onClose, lead }) {
  if (!open || !lead) return null;
  const breakdown = lead.fit_breakdown || [];
  const positive = breakdown.filter((p) => p.points >= 0);
  const negative = breakdown.filter((p) => p.points < 0);
  const total = breakdown.reduce((a, p) => a + (p.points || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm"
         onClick={onClose}>
      <Card
        className="w-full max-w-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="flex items-start justify-between">
          <div>
            <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.24em] text-foreground/50">
              Why this rep
            </div>
            <CardTitle className="text-xl">
              {lead.lead_name || lead.lead_email}
              <span className="text-foreground/35"> → </span>
              {lead.rep_name}
            </CardTitle>
            <div className="mt-1 text-[12px] text-foreground/60">
              Fit score <span className="font-mono text-primary">{total}</span>
              {lead.title && <> · {lead.title}</>}
              {lead.company && <> · {lead.company}</>}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.24em] text-mint">
              Contributing factors
            </div>
            <ul className="space-y-1.5">
              {positive.map((p, i) => (
                <li key={i} className="flex items-start justify-between gap-3 text-[12.5px]">
                  <div>
                    <span className="font-medium text-foreground/85">
                      {p.factor.replace(/_/g, " ")}
                    </span>
                    {p.detail && (
                      <span className="text-foreground/55"> — {p.detail}</span>
                    )}
                  </div>
                  <span className="font-mono text-mint">+{p.points}</span>
                </li>
              ))}
            </ul>
          </div>
          {negative.length > 0 && (
            <div>
              <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.24em] text-ember">
                Penalties
              </div>
              <ul className="space-y-1.5">
                {negative.map((p, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 text-[12.5px]">
                    <div>
                      <span className="font-medium text-foreground/85">
                        {p.factor.replace(/_/g, " ")}
                      </span>
                      {p.detail && (
                        <span className="text-foreground/55"> — {p.detail}</span>
                      )}
                    </div>
                    <span className="font-mono text-ember">{p.points}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
