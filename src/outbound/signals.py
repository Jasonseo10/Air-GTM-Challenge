"""
Deterministic synthesis of outbound trigger signals + outbound-relevant
account fields (outbound_vertical, persona flags).

Why synthesize instead of read a CSV: signals are *derivable* attributes
of an account at a point in time. In production this module would call
real sources — Crunchbase / PitchBook for funding, LinkedIn Sales Nav for
exec hires, BuiltWith for tech stack, etc. Here we deterministically
synthesize from a hash of the account_id so the same input always
produces the same signal set, mirroring how src/enrich.py mocks the
firmographic API.

This is also the file you'd swap when wiring Clay or BuiltWith. The rest
of the outbound pipeline doesn't care where signals came from.
"""

from __future__ import annotations

import hashlib
from dataclasses import asdict
from typing import Optional

from .schema import TriggerSignal


# ---------------------------------------------------------------------------
# Account derivation
# ---------------------------------------------------------------------------

# Personal email domains — leads from these don't roll up to a real account.
PERSONAL_DOMAINS = {"gmail.com", "yahoo.com", "outlook.com", "hotmail.com",
                    "icloud.com", "aol.com", "live.com"}


def derive_account_id(lead: dict) -> str:
    """
    Pick the most stable account identifier we can derive from a lead.
    Corporate domain is preferred (consistent across leads); for personal
    domains we fall back to a per-lead pseudo-account so they don't all
    bundle under "gmail.com".
    """
    email = (lead.get("email") or "").lower()
    domain = email.split("@", 1)[1] if "@" in email else ""
    if domain and domain not in PERSONAL_DOMAINS:
        return domain
    # Personal-domain lead — bundle by company name if present, else by email.
    co = (lead.get("company") or "").strip().lower().replace(" ", "-")
    if co:
        return f"{co}.personal"
    return email or "unknown.personal"


def is_personal_domain(account_id: str) -> bool:
    return account_id.endswith(".personal")


# ---------------------------------------------------------------------------
# Hashing helper
# ---------------------------------------------------------------------------

def _stable_hash(s: str) -> int:
    return int(hashlib.md5(s.encode("utf-8")).hexdigest(), 16)


# ---------------------------------------------------------------------------
# Outbound vertical synthesis
# ---------------------------------------------------------------------------

# Air's actual ICP verticals. Synthesizes a richer outbound-relevant vertical
# than the firmographic-API "industry" field, which is too coarse.
_VERTICAL_POOL = [
    "DTC", "Food & Beverage", "Beauty", "Fashion", "CPG",
    "Media", "Entertainment", "Sports", "Broadcast",
    "Agency", "E-commerce", "Retail",
    "SaaS", "Marketing Technology", "Developer Tools", "Fintech",
    "Creative Operations",
]

# When the firmographic industry constrains the vertical, route accordingly
# so the synthesized vertical isn't wildly inconsistent with what we already
# know about the account.
_INDUSTRY_TO_VERTICAL_BIAS = {
    "Creative Operations": ["Creative Operations", "Agency", "Media"],
    "Marketing Technology": ["Marketing Technology", "SaaS"],
    "E-commerce": ["DTC", "E-commerce", "Fashion", "Beauty"],
    "SaaS": ["SaaS", "Developer Tools", "Marketing Technology"],
    "Developer Tools": ["Developer Tools", "SaaS"],
    "Enterprise Software": ["SaaS", "Marketing Technology", "Fintech"],
    "Financial Services": ["Fintech", "CPG"],
    "Healthcare": ["Healthcare", "CPG"],
    "Media": ["Media", "Entertainment", "Broadcast"],
}


def synthesize_outbound_vertical(account_id: str, industry: Optional[str]) -> str:
    """
    Deterministically pick a richer vertical from the pool, biased by
    firmographic industry where one is known.
    """
    h = _stable_hash(f"vertical::{account_id}")
    if industry and industry in _INDUSTRY_TO_VERTICAL_BIAS:
        bias = _INDUSTRY_TO_VERTICAL_BIAS[industry]
        return bias[h % len(bias)]
    return _VERTICAL_POOL[h % len(_VERTICAL_POOL)]


# ---------------------------------------------------------------------------
# Persona flags — derived purely from existing title + seniority
# ---------------------------------------------------------------------------

_MARKETING_KEYWORDS = ("marketing", "brand", "growth", "demand", "campaign")
_CREATIVE_KEYWORDS = ("creative", "design", "content", "art director", "video")
_OPS_KEYWORDS = ("marketing ops", "revops", "creative ops", "design ops")
_SENIOR_TIERS = {"C-Level", "VP", "Director"}


def derive_persona_flags(lead: dict) -> dict:
    title = (lead.get("title") or "").lower()
    seniority = lead.get("seniority_level") or ""
    senior = seniority in _SENIOR_TIERS

    has_marketing = any(k in title for k in _MARKETING_KEYWORDS)
    has_creative = any(k in title for k in _CREATIVE_KEYWORDS)
    has_ops = any(k in title for k in _OPS_KEYWORDS)

    # Buyer archetype — best-effort inference from title.
    if any(k in title for k in ("ceo", "founder", "owner", "co-founder")):
        archetype = "founder-owner"
    elif seniority == "C-Level":
        archetype = "exec-sponsor"
    elif senior and (has_marketing or has_creative):
        archetype = "exec-sponsor"
    elif has_ops or "engineer" in title or "developer" in title or "data" in title:
        archetype = "technical-buyer"
    else:
        archetype = "operator-IC"

    return {
        "persona_marketing_senior": has_marketing and senior,
        "persona_creative_senior": has_creative and senior,
        "persona_ops": has_ops,
        "persona_archetype": archetype,
    }


# ---------------------------------------------------------------------------
# Trigger signal synthesis (account-level, deterministic by account_id)
# ---------------------------------------------------------------------------

# Signal frequencies and payload generators. Tuned so:
#   - ~25% accounts get 1 signal
#   - ~12% accounts get 2 signals (bundle-worthy)
#   - ~5% accounts get 3+ signals (apex outbound targets)
_SIGNAL_TYPES = [
    "funding_recent",
    "exec_hire_marketing",
    "exec_hire_creative",
    "creative_hiring_spike",
    "competitor_dam_in_stack",
    "rebrand_or_campaign",
    "agency_change",
    "ad_spend_ramp",
    "channel_expansion_new",
]

_FUNDING_ROUNDS = ["Seed", "Series A", "Series B", "Series C", "Growth"]
_FUNDING_AMOUNTS = {"Seed": 4, "Series A": 12, "Series B": 35, "Series C": 80, "Growth": 150}
_COMPETITORS = ["Bynder", "Brandfolder", "Frontify", "Aprimo", "Dropbox"]
_CHANNELS_NEW = ["TikTok Shop", "Amazon", "Retail (Target)", "Retail (Sephora)", "Broadcast", "OOH"]
_AGENCIES_FROM = ["BBDO", "Wieden+Kennedy", "Gin Lane", "Mythology", "Anomaly"]
_AGENCIES_TO = ["Mother", "Gut", "TBWA\\Chiat\\Day", "in-house team", "Battery"]
_EXEC_TITLES_MKT = ["CMO", "VP Marketing", "Head of Brand", "VP Growth"]
_EXEC_TITLES_CRT = ["Creative Director", "Head of Creative", "VP Creative", "Design Ops Lead"]


def _signal_count_for_account(account_id: str) -> int:
    """How many signals does this account get? Probability-shaped by hash."""
    h = _stable_hash(f"count::{account_id}") % 100
    if h < 12:       # 12%: 3 signals (apex outbound targets)
        return 3
    if h < 32:       # 20%: 2 signals (bundle-worthy)
        return 2
    if h < 70:       # 38%: 1 signal
        return 1
    return 0


def _pick_signal_type(account_id: str, slot: int) -> str:
    h = _stable_hash(f"sig::{account_id}::{slot}")
    return _SIGNAL_TYPES[h % len(_SIGNAL_TYPES)]


def _build_payload(signal_type: str, account_id: str, vertical: str) -> dict:
    h = _stable_hash(f"pl::{account_id}::{signal_type}")
    if signal_type == "funding_recent":
        rnd = _FUNDING_ROUNDS[h % len(_FUNDING_ROUNDS)]
        return {
            "round": rnd,
            "amount_m_usd": _FUNDING_AMOUNTS[rnd] + (h % 8),
            "lead_investor": ["Sequoia", "a16z", "Bessemer", "General Catalyst"][(h >> 4) % 4],
        }
    if signal_type == "exec_hire_marketing":
        return {
            "exec_title": _EXEC_TITLES_MKT[h % len(_EXEC_TITLES_MKT)],
            "exec_name": ["Alex Rivera", "Jamie Park", "Morgan Liu", "Taylor Brooks"][(h >> 3) % 4],
        }
    if signal_type == "exec_hire_creative":
        return {
            "exec_title": _EXEC_TITLES_CRT[h % len(_EXEC_TITLES_CRT)],
            "exec_name": ["Sam Ortiz", "Jordan Sato", "Riley Chen", "Cameron Kim"][(h >> 3) % 4],
        }
    if signal_type == "creative_hiring_spike":
        roles = ["Designer", "Brand Lead", "Social Manager", "Video Editor", "Content Producer"]
        return {
            "role_count_30d": 4 + (h % 6),
            "roles": roles[: 3 + (h % 3)],
        }
    if signal_type == "competitor_dam_in_stack":
        return {"competitor": _COMPETITORS[h % len(_COMPETITORS)]}
    if signal_type == "rebrand_or_campaign":
        return {
            "campaign_or_rebrand": ["rebrand", "tentpole campaign", "category launch"][h % 3],
            "detected_via": ["press release", "homepage refresh", "ad library"][((h >> 2) % 3)],
        }
    if signal_type == "agency_change":
        return {
            "from_agency": _AGENCIES_FROM[h % len(_AGENCIES_FROM)],
            "to_agency": _AGENCIES_TO[(h >> 2) % len(_AGENCIES_TO)],
        }
    if signal_type == "ad_spend_ramp":
        return {
            "pct_increase": 40 + (h % 80),
            "channel": ["Meta", "Google", "TikTok"][h % 3],
        }
    if signal_type == "channel_expansion_new":
        return {"new_channel": _CHANNELS_NEW[h % len(_CHANNELS_NEW)]}
    return {}


def synthesize_signals_for_account(account_id: str, vertical: str) -> list[TriggerSignal]:
    """
    Deterministic signal synthesis for one account.

    Personal-domain accounts (gmail/yahoo email + a known company) get
    signals too — the company is real even when the email is personal.
    Truly anonymous leads (no email + no company) bottom out as
    "unknown.personal" and get no signals.
    """
    if account_id.startswith("unknown."):
        return []
    n = _signal_count_for_account(account_id)
    if n == 0:
        return []
    chosen: list[str] = []
    sigs: list[TriggerSignal] = []
    slot = 0
    while len(chosen) < n and slot < n * 4:  # bounded search to avoid duplicates
        st = _pick_signal_type(account_id, slot)
        slot += 1
        if st in chosen:
            continue
        chosen.append(st)
        days_ago = 5 + (_stable_hash(f"days::{account_id}::{st}") % 85)
        sigs.append(TriggerSignal(
            account_id=account_id,
            signal_type=st,
            days_ago=days_ago,
            payload=_build_payload(st, account_id, vertical),
        ))
    return sigs


# ---------------------------------------------------------------------------
# Top-level: enrich a lead set with outbound-only fields
# ---------------------------------------------------------------------------

def attach_outbound_attributes(leads: list[dict]) -> tuple[list[dict], dict[str, list[TriggerSignal]]]:
    """
    Returns (enriched_leads, signals_by_account).

    Each lead gets:
      - account_id
      - outbound_vertical
      - persona_*
      - signal_<type> booleans (for the rule engine)
      - signal_competitor_dam (string vendor name) when applicable
      - signals (full payload list, for UI rendering)

    Signals are computed once per account and broadcast to every lead at
    that account.
    """
    # First pass: bucket leads by account.
    by_account: dict[str, list[dict]] = {}
    for lead in leads:
        acc = derive_account_id(lead)
        by_account.setdefault(acc, []).append(lead)

    # Second pass: compute account-level signals + vertical.
    signals_by_account: dict[str, list[TriggerSignal]] = {}
    vertical_by_account: dict[str, str] = {}
    for acc, group in by_account.items():
        # Use any lead's industry — they should match for the same domain.
        industry = next((l.get("industry") for l in group if l.get("industry")), None)
        vertical = synthesize_outbound_vertical(acc, industry)
        vertical_by_account[acc] = vertical
        signals_by_account[acc] = synthesize_signals_for_account(acc, vertical)

    # Third pass: attach to each lead.
    out: list[dict] = []
    for lead in leads:
        acc = derive_account_id(lead)
        vertical = vertical_by_account[acc]
        sigs = signals_by_account[acc]
        sig_types = {s.signal_type for s in sigs}

        enriched = dict(lead)
        enriched["account_id"] = acc
        enriched["outbound_vertical"] = vertical
        enriched.update(derive_persona_flags(lead))

        # Boolean signal flags consumed by the rule engine.
        for st in _SIGNAL_TYPES:
            enriched[f"signal_{st}"] = (st in sig_types)
        # Special: competitor_dam stores the vendor string for play rendering.
        comp_sig = next((s for s in sigs if s.signal_type == "competitor_dam_in_stack"), None)
        enriched["signal_competitor_dam"] = (
            comp_sig.payload.get("competitor") if comp_sig else None
        )
        # Convenience aliases used in scoring rules.
        enriched["signal_funding_recent"] = enriched["signal_funding_recent"]
        enriched["signal_exec_hire_marketing"] = enriched["signal_exec_hire_marketing"]
        enriched["signal_exec_hire_creative"] = enriched["signal_exec_hire_creative"]
        enriched["signal_creative_hiring_spike"] = enriched["signal_creative_hiring_spike"]
        enriched["signal_rebrand"] = enriched["signal_rebrand_or_campaign"]
        enriched["signal_agency_change"] = enriched["signal_agency_change"]
        enriched["signal_ad_spend_ramp"] = enriched["signal_ad_spend_ramp"]
        enriched["signal_channel_expansion"] = enriched["signal_channel_expansion_new"]

        # Full signal payload list for UI display.
        enriched["signals"] = [asdict(s) for s in sigs]
        out.append(enriched)

    return out, signals_by_account
