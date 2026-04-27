"""
Play selection + template rendering.

A "play" is a (subject, opener, channel-priority) bundle keyed on
(primary_signal × persona × tier). Selection prefers tighter matches —
exec-hire play before generic firmographic play, even if both are
eligible. Templates are rendered with handlebars-style placeholders
filled from the lead, the signal payload, and a reference-brand pool.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from .schema import Rep, RoutedLead


# Reference customers from public Air case studies, used in openers.
_REFERENCE_BRANDS = {
    "DTC": "Sweetgreen",
    "Food & Beverage": "Sweetgreen",
    "CPG": "Sweetgreen",
    "Beauty": "Glossier",
    "Fashion": "Reformation",
    "Media": "The Infatuation",
    "Entertainment": "The Infatuation",
    "Sports": "Peloton",
    "Broadcast": "Vox",
    "Agency": "Mother",
    "E-commerce": "Allbirds",
    "Retail": "Allbirds",
    "SaaS": "Notion",
    "Marketing Technology": "Hubspot",
    "Developer Tools": "Vercel",
    "Fintech": "Mercury",
    "Creative Operations": "Air",
}


def load_plays(path: str | Path) -> list[dict]:
    return json.loads(Path(path).read_text(encoding="utf-8"))["plays"]


def _persona_label(lead: dict) -> str:
    """Pick the most specific persona label that matches the lead's title."""
    title = lead.get("title") or ""
    if not title:
        return ""
    title_l = title.lower()
    # Order matters — most specific first.
    for label in ["CMO", "CEO", "Founder", "Owner",
                  "VP Marketing", "VP Creative",
                  "Director Marketing", "Head of Brand", "Head of Creative",
                  "Head of Marketing", "Creative Director", "Design Ops",
                  "Marketing Ops", "RevOps",
                  "Manager", "Senior IC"]:
        if label.lower() in title_l:
            return label
    return ""


def select_play(plays: list[dict], lead: dict, primary_signal: str,
                tier: str) -> dict | None:
    """
    Pick the best matching play for a lead. Falls back to a fit-only play
    when no signal-based play matches.
    """
    persona = _persona_label(lead)

    # Candidates: plays whose primary_signal matches AND tier is in the
    # play's tier list AND persona overlaps.
    def matches(p: dict) -> bool:
        if p["primary_signal"] != primary_signal:
            return False
        if tier not in p.get("tiers", []):
            return False
        if persona and persona not in p.get("personas", []):
            return False
        return True

    candidates = [p for p in plays if matches(p)]
    if candidates:
        return candidates[0]

    # Fallback: ignore persona constraint if signal+tier matched.
    candidates = [p for p in plays
                  if p["primary_signal"] == primary_signal
                  and tier in p.get("tiers", [])]
    if candidates:
        return candidates[0]

    # Final fallback: firmographic_fit play.
    fit_plays = [p for p in plays if p["primary_signal"] == "firmographic_fit"
                 and tier in p.get("tiers", [])]
    if not fit_plays:
        return None
    if persona:
        for p in fit_plays:
            if persona in p.get("personas", []):
                return p
    return fit_plays[0]


_PLACEHOLDER_RE = re.compile(r"\{\{\s*([\w_]+)\s*\}\}")


def render_play(play: dict, lead: dict, rep: Rep | None = None) -> dict:
    """Render a play's subject + opener with placeholders filled."""
    sigs = lead.get("signals") or []
    primary = next((s for s in sigs if s["signal_type"] == play["primary_signal"]),
                   sigs[0] if sigs else None)
    payload = (primary or {}).get("payload", {}) if primary else {}

    vertical = lead.get("outbound_vertical") or "your space"
    ctx = {
        "company": lead.get("company") or "your team",
        "vertical": vertical,
        "company_size_band": lead.get("company_size_band") or "your size",
        "reference_brand": _REFERENCE_BRANDS.get(vertical, "Sweetgreen"),
        "round": payload.get("round", "round"),
        "amount_m": str(payload.get("amount_m_usd", "")),
        "exec_title": payload.get("exec_title", "new exec"),
        "exec_name": payload.get("exec_name", "the new hire"),
        "competitor": payload.get("competitor")
                      or lead.get("signal_competitor_dam") or "your current DAM",
        "rep_competitor_wins": (
            str(rep.competitor_replace_experience.get(
                payload.get("competitor")
                or lead.get("signal_competitor_dam") or "", 0))
            if rep else "many"
        ),
        "role_count": str(payload.get("role_count_30d", "several")),
        "from_agency": payload.get("from_agency", "your previous agency"),
        "to_agency": payload.get("to_agency", "your new partner"),
        "campaign_or_rebrand": payload.get("campaign_or_rebrand", "recent launch"),
    }

    def fill(s: str) -> str:
        return _PLACEHOLDER_RE.sub(lambda m: ctx.get(m.group(1), m.group(0)), s)

    return {
        "play_id": play["play_id"],
        "subject": fill(play["subject"]),
        "opener": fill(play["opener"]),
        "channel_priority": play.get("channel_priority", []),
        "primary_signal": play["primary_signal"],
    }


def assign_plays(routed: list[RoutedLead], plays: list[dict],
                 reps: list[Rep]) -> list[dict]:
    """
    Attach a rendered play to every routed lead. Returns a list of dicts
    (RoutedLead.to_dict) with play fields merged in.
    """
    rep_by_id = {r.rep_id: r for r in reps}
    out = []
    for r in routed:
        d = r.to_dict()
        # Pretend lead context for play selection.
        lead_ctx = {
            "title": r.title,
            "company": r.company,
            "outbound_vertical": next(
                (s.get("payload", {}).get("vertical") for s in r.signals), None
            ) or _vertical_from_signals_fallback(r),
            "company_size_band": None,
            "signal_competitor_dam": next(
                (s.get("payload", {}).get("competitor")
                 for s in r.signals if s.get("signal_type") == "competitor_dam_in_stack"),
                None,
            ),
            "signals": r.signals,
        }
        play = select_play(plays, lead_ctx, r.primary_signal or "firmographic_fit",
                           r.outbound_tier)
        if play is None:
            d["play_id"] = None
            d["play_subject"] = None
            d["play_opener"] = None
            d["channel_priority"] = []
        else:
            rendered = render_play(play, lead_ctx, rep_by_id.get(r.rep_id))
            d["play_id"] = rendered["play_id"]
            d["play_subject"] = rendered["subject"]
            d["play_opener"] = rendered["opener"]
            d["channel_priority"] = rendered["channel_priority"]
        out.append(d)
    return out


def _vertical_from_signals_fallback(r: RoutedLead) -> str | None:
    # Plays.assign_plays runs after match.route_all, so the routed object
    # itself doesn't carry outbound_vertical. Plays selection mostly keys
    # off persona+tier+signal, so a missing vertical only affects the
    # firmographic_fit fallback's vertical placeholder.
    return None
