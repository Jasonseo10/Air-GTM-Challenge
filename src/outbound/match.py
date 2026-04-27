"""
Lead-to-rep matching.

Scoring function combines hard fit, persona fit, and qualitative fit
(prior companies, domain expertise, competitor replacement experience,
selling style, buyer archetype, past wins). Capacity and fairness act
as penalties / floors rather than hard filters so the matcher degrades
gracefully when the team is full.

Each routing decision emits a fit_breakdown with the top contributing
factors so the dashboard can show "why this rep" — auditability is the
table-stakes feature for a Head of Sales reviewing assignments.
"""

from __future__ import annotations

import json
from pathlib import Path

from .schema import Rep, RoutedLead


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------

def load_team(path: str | Path) -> tuple[list[Rep], dict]:
    """Returns (reps, fairness_config)."""
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    reps = [Rep.from_dict(r) for r in raw["reps"]]
    fairness = raw.get("fairness", {})
    return reps, fairness


# ---------------------------------------------------------------------------
# Fit factor computations
# ---------------------------------------------------------------------------

def _hard_fit(rep: Rep, lead: dict) -> tuple[int, list[dict]]:
    """0–50: vertical match, deal-band fit, capacity headroom, language."""
    pts = 0
    parts: list[dict] = []

    # Vertical match (heaviest hard-fit factor).
    vert = lead.get("outbound_vertical") or ""
    if vert in rep.verticals:
        pts += 20
        parts.append({"factor": "vertical_match",
                      "detail": f"{rep.name} sells {vert}",
                      "points": 20})
    elif _verticals_overlap(rep.verticals, vert):
        pts += 8
        parts.append({"factor": "vertical_adjacent",
                      "detail": f"{vert} adjacent to {rep.verticals[0]}",
                      "points": 8})

    # Deal-band fit — inferred from company_size_min.
    expected_acv = _expected_acv_band(lead)
    lo, hi = rep.deal_size_band_usd
    if lo <= expected_acv <= hi:
        pts += 15
        parts.append({"factor": "deal_band_fit",
                      "detail": f"~${expected_acv//1000}k expected ∈ rep band ${lo//1000}k–${hi//1000}k",
                      "points": 15})
    elif _band_close(expected_acv, lo, hi):
        pts += 6
        parts.append({"factor": "deal_band_close",
                      "detail": f"~${expected_acv//1000}k near rep band",
                      "points": 6})

    # Capacity headroom — modest bonus so it tilts ties but doesn't dominate.
    util = rep.utilization_pct
    if util < 50:
        pts += 5
        parts.append({"factor": "capacity_open",
                      "detail": f"{rep.capacity_current}/{rep.capacity_max} ({util:.0f}%)",
                      "points": 5})
    elif util < 75:
        pts += 2
        parts.append({"factor": "capacity_moderate",
                      "detail": f"{rep.capacity_current}/{rep.capacity_max} ({util:.0f}%)",
                      "points": 2})

    # Language.
    lang_pref = (lead.get("language") or "en").lower()
    if lang_pref in rep.languages:
        pts += 5
        parts.append({"factor": "language_match",
                      "detail": lang_pref,
                      "points": 5})

    return pts, parts


def _persona_fit(rep: Rep, lead: dict) -> tuple[int, list[dict]]:
    """0–25: rep persona_strength alignment with lead's title/seniority."""
    pts = 0
    parts: list[dict] = []
    title = (lead.get("title") or "")
    if not title:
        return pts, parts

    title_lower = title.lower()
    # Strong match: rep explicitly lists this persona.
    matched = next((p for p in rep.persona_strength
                    if p.lower() in title_lower or title_lower in p.lower()), None)
    if matched:
        pts += 18
        parts.append({"factor": "persona_strength_direct",
                      "detail": f"{rep.name} sells to {matched}",
                      "points": 18})
    else:
        # Coarser overlap by seniority + role family.
        sen = lead.get("seniority_level") or ""
        if sen in ("VP", "Director", "C-Level"):
            if any(s.startswith(sen) or sen in s for s in rep.persona_strength):
                pts += 10
                parts.append({"factor": "persona_seniority_match",
                              "detail": f"both target {sen}-level",
                              "points": 10})

    # Buyer archetype affinity.
    arche = lead.get("persona_archetype")
    if arche and arche in rep.buyer_archetype_affinity:
        pts += 7
        parts.append({"factor": "buyer_archetype_affinity",
                      "detail": f"rep thrives with {arche}",
                      "points": 7})

    return pts, parts


def _qualitative_fit(rep: Rep, lead: dict) -> tuple[int, list[dict]]:
    """0–25: qualitative differentiators."""
    pts = 0
    parts: list[dict] = []

    # Competitor replacement experience — strongest qual factor when applicable.
    comp = lead.get("signal_competitor_dam")
    if comp:
        wins = rep.competitor_replace_experience.get(comp, 0)
        if wins >= 5:
            pts += 10
            parts.append({"factor": "competitor_replace_specialist",
                          "detail": f"{rep.name} has displaced {comp} {wins}× before",
                          "points": 10})
        elif wins >= 2:
            pts += 5
            parts.append({"factor": "competitor_replace_some",
                          "detail": f"{wins} prior {comp} wins",
                          "points": 5})

    # Domain expertise tags ∩ lead's vertical/account hints.
    tags_set = set(rep.domain_expertise_tags)
    lead_tags = _lead_domain_tags(lead)
    overlap = tags_set & lead_tags
    if overlap:
        bump = min(6, 2 * len(overlap))
        pts += bump
        parts.append({"factor": "domain_expertise",
                      "detail": ", ".join(sorted(overlap)),
                      "points": bump})

    # Selling style match to expected cycle.
    expected_style = _expected_selling_style(lead)
    if rep.selling_style == expected_style:
        pts += 4
        parts.append({"factor": "selling_style_match",
                      "detail": f"{expected_style} fits this account",
                      "points": 4})

    # Past wins lift in (vertical, persona).
    vert = lead.get("outbound_vertical") or ""
    sen = lead.get("seniority_level") or ""
    title_l = (lead.get("title") or "").lower()
    matching_wins = [
        w for w in rep.past_wins
        if w.get("vertical") == vert
        and (w.get("persona", "").lower() in title_l
             or title_l in w.get("persona", "").lower())
    ]
    if matching_wins:
        avg_acv = sum(w.get("acv_usd", 0) for w in matching_wins) / len(matching_wins)
        bump = min(5, 2 + len(matching_wins))
        pts += bump
        parts.append({"factor": "past_wins_lift",
                      "detail": f"{len(matching_wins)} past wins in {vert} × similar persona "
                                f"(avg ${avg_acv/1000:.0f}k)",
                      "points": bump})

    return pts, parts


def _capacity_penalty(rep: Rep, fairness: dict) -> tuple[int, list[dict]]:
    """
    Penalties for over-loaded reps and (small) baseline penalty for ramping
    reps so they don't dominate purely by virtue of having open capacity.
    Layup boosts (handled in match_lead) override this for reserved accounts.
    """
    cap = fairness.get("max_capacity_utilization_pct", 95)
    util = rep.utilization_pct
    parts: list[dict] = []
    pts = 0
    if util >= cap:
        pts -= 40
        parts.append({"factor": "over_capacity",
                      "detail": f"rep at {util:.0f}% utilization (cap {cap}%)",
                      "points": -40})
    elif util >= 90:
        pts -= 20
        parts.append({"factor": "near_capacity",
                      "detail": f"rep at {util:.0f}% utilization",
                      "points": -20})
    if rep.ramp_status == "ramping":
        pts -= 12
        parts.append({"factor": "ramping_dampener",
                      "detail": "ramping rep: only routes to layup-reserved accounts",
                      "points": -12})
    return pts, parts


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_VERTICAL_NEIGHBORS = {
    "DTC": {"E-commerce", "Retail", "Beauty", "Fashion"},
    "E-commerce": {"DTC", "Retail", "Fashion", "Beauty"},
    "CPG": {"Food & Beverage", "Beauty", "Retail"},
    "Food & Beverage": {"CPG", "DTC", "Retail"},
    "Beauty": {"CPG", "DTC", "Fashion"},
    "Fashion": {"DTC", "Retail", "Beauty"},
    "Media": {"Entertainment", "Broadcast"},
    "Entertainment": {"Media", "Broadcast"},
    "Sports": {"Media", "Entertainment", "Broadcast"},
    "Broadcast": {"Media", "Entertainment"},
    "SaaS": {"Marketing Technology", "Developer Tools", "Fintech"},
    "Marketing Technology": {"SaaS", "Creative Operations"},
    "Creative Operations": {"Marketing Technology", "Agency"},
    "Agency": {"Creative Operations", "Marketing Technology"},
    "Developer Tools": {"SaaS"},
    "Fintech": {"SaaS"},
}


def _verticals_overlap(rep_verticals: list[str], lead_vertical: str) -> bool:
    if not lead_vertical:
        return False
    neighbors = _VERTICAL_NEIGHBORS.get(lead_vertical, set())
    return any(v in neighbors for v in rep_verticals)


def _expected_acv_band(lead: dict) -> int:
    """Heuristic: expected ACV from company_size_min."""
    size = lead.get("company_size_min") or 0
    if size >= 5000:
        return 250_000
    if size >= 1000:
        return 120_000
    if size >= 500:
        return 70_000
    if size >= 200:
        return 45_000
    if size >= 50:
        return 22_000
    return 10_000


def _band_close(acv: int, lo: int, hi: int) -> bool:
    return lo * 0.5 <= acv <= hi * 1.5


def _expected_selling_style(lead: dict) -> str:
    size = lead.get("company_size_min") or 0
    if size >= 1000:
        return "exec-sponsorship-driven"
    if size >= 200:
        return "consultative-multithread"
    return "velocity-transactional"


def _lead_domain_tags(lead: dict) -> set[str]:
    """Synthesize coarse domain tags for the lead from existing fields."""
    tags: set[str] = set()
    vert = (lead.get("outbound_vertical") or "").lower()
    if vert in ("saas", "developer tools", "marketing technology", "fintech"):
        tags.add("B2B-SaaS")
    if vert in ("dtc", "e-commerce", "retail"):
        tags.add("shopify-ecosystem")
    if vert in ("food & beverage", "dtc"):
        tags.add("DTC-food")
    if vert in ("agency",):
        tags.add("agency-workflows")
    if vert in ("media", "entertainment", "broadcast"):
        tags.add("broadcast-media")
    if vert in ("sports",):
        tags.add("pro-sports")
    if vert in ("cpg", "fashion", "beauty"):
        tags.add("retail-omnichannel")
    if (lead.get("seniority_level") in ("C-Level",) or
            "founder" in (lead.get("title") or "").lower()):
        tags.add("founder-led-sales")
    return tags


# ---------------------------------------------------------------------------
# Top-level matching
# ---------------------------------------------------------------------------

def score_rep_for_lead(rep: Rep, lead: dict, fairness: dict) -> dict:
    """Compute total fit score + breakdown for one (rep, lead) pair."""
    parts: list[dict] = []
    total = 0

    h_pts, h_parts = _hard_fit(rep, lead);            total += h_pts; parts.extend(h_parts)
    p_pts, p_parts = _persona_fit(rep, lead);         total += p_pts; parts.extend(p_parts)
    q_pts, q_parts = _qualitative_fit(rep, lead);     total += q_pts; parts.extend(q_parts)
    c_pts, c_parts = _capacity_penalty(rep, fairness);total += c_pts; parts.extend(c_parts)

    return {
        "rep_id": rep.rep_id,
        "rep_name": rep.name,
        "fit_score": total,
        "fit_breakdown": parts,
    }


def match_lead(reps: list[Rep], lead: dict, fairness: dict,
               ramping_rep_layups: set[str] | None = None) -> dict:
    """
    Pick the best rep for one lead.

    `ramping_rep_layups` is a set of lead-account IDs reserved for ramping
    reps (a small share of easy leads to help new hires onboard).
    """
    candidates = [score_rep_for_lead(r, lead, fairness) for r in reps]

    # Apply ramping-rep layup boost for the rare lead reserved for them.
    acc = lead.get("account_id")
    if ramping_rep_layups and acc in ramping_rep_layups:
        for c in candidates:
            rep = next((r for r in reps if r.rep_id == c["rep_id"]), None)
            if rep and rep.ramp_status == "ramping":
                c["fit_score"] += 30
                c["fit_breakdown"].append({
                    "factor": "ramping_layup_boost",
                    "detail": "reserved for ramping rep",
                    "points": 30,
                })

    candidates.sort(key=lambda c: c["fit_score"], reverse=True)
    return candidates[0]


def select_ramping_layups(leads: list[dict], reps: list[Rep],
                          fairness: dict) -> set[str]:
    """
    Pick a small share of easy leads (warm tier, mid-size, fitting verticals)
    and reserve their accounts for ramping reps.
    """
    ramping = [r for r in reps if r.ramp_status == "ramping"]
    if not ramping:
        return set()
    share_pct = fairness.get("ramping_rep_layup_share_pct", 15)

    # Score warm/cool leads on simple "easy" criteria for the ramping rep.
    eligible = [
        l for l in leads
        if l.get("outbound_tier") in ("Warm", "Cool")
        and (l.get("company_size_min") or 0) < 1000
        and any(v in (l.get("outbound_vertical") or "")
                for r in ramping for v in r.verticals)
    ]
    n = max(1, int(len(leads) * share_pct / 100))
    chosen_accounts: set[str] = set()
    for l in eligible[:n]:
        acc = l.get("account_id")
        if acc:
            chosen_accounts.add(acc)
    return chosen_accounts


def route_all(leads: list[dict], reps: list[Rep],
              fairness: dict) -> list[RoutedLead]:
    """
    Match every Hot/Warm/Cool lead to a rep. Personal-domain leads with
    Low tier are skipped — outbound shouldn't waste cycles on those.
    """
    layups = select_ramping_layups(leads, reps, fairness)

    routed: list[RoutedLead] = []
    for lead in leads:
        tier = lead.get("outbound_tier") or "Low"
        if tier == "Low":
            continue
        match = match_lead(reps, lead, fairness, ramping_rep_layups=layups)
        sigs = lead.get("signals") or []
        primary_signal = sigs[0]["signal_type"] if sigs else "firmographic_fit"
        routed.append(RoutedLead(
            lead_email=lead["email"],
            lead_name=lead.get("name"),
            account_id=lead.get("account_id", ""),
            company=lead.get("company"),
            title=lead.get("title"),
            seniority_level=lead.get("seniority_level"),
            outbound_score=lead.get("outbound_score", 0),
            outbound_tier=tier,
            rep_id=match["rep_id"],
            rep_name=match["rep_name"],
            fit_score=match["fit_score"],
            fit_breakdown=match["fit_breakdown"],
            play_id=None,                # filled by plays.assign_plays
            primary_signal=primary_signal,
            signals=sigs,
        ))
    return routed
