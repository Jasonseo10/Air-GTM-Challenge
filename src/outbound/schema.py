"""
Dataclasses for the outbound layer.

Kept as plain dataclasses (no third-party deps) so the runtime stays
stdlib-only, matching the rest of the pipeline. Each shape has a `to_dict`
for JSON emission and a `from_dict` for reading config files.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Optional


# ---------------------------------------------------------------------------
# Sales rep
# ---------------------------------------------------------------------------

@dataclass
class Rep:
    """One sales rep. Mix of hard fit + qualitative fit fields."""
    rep_id: str
    name: str
    segment: str                                     # SMB | Mid-Market | Enterprise
    verticals: list[str]
    persona_strength: list[str]
    deal_size_band_usd: list[int]                    # [min, max]
    languages: list[str]
    timezone: str
    tenure_months: int
    capacity_max: int
    capacity_current: int

    # Qualitative fit
    prior_companies: list[str] = field(default_factory=list)
    prior_roles: list[str] = field(default_factory=list)
    domain_expertise_tags: list[str] = field(default_factory=list)
    selling_style: str = ""
    buyer_archetype_affinity: list[str] = field(default_factory=list)
    competitor_replace_experience: dict[str, int] = field(default_factory=dict)
    past_wins: list[dict] = field(default_factory=list)
    pursuit_stage_strength: dict[str, float] = field(default_factory=dict)

    ramp_status: Optional[str] = None
    needs_assist: bool = False

    @classmethod
    def from_dict(cls, d: dict) -> "Rep":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})

    def to_dict(self) -> dict:
        return asdict(self)

    @property
    def capacity_remaining(self) -> int:
        return max(0, self.capacity_max - self.capacity_current)

    @property
    def utilization_pct(self) -> float:
        if self.capacity_max == 0:
            return 0.0
        return self.capacity_current / self.capacity_max * 100


# ---------------------------------------------------------------------------
# Trigger signal
# ---------------------------------------------------------------------------

@dataclass
class TriggerSignal:
    """An external event on an account that creates an outbound opportunity."""
    account_id: str
    signal_type: str                  # funding_recent | exec_hire_marketing | ...
    days_ago: int
    payload: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# Routed lead — the output of match.py
# ---------------------------------------------------------------------------

@dataclass
class RoutedLead:
    lead_email: str
    lead_name: Optional[str]
    account_id: str
    company: Optional[str]
    title: Optional[str]
    seniority_level: Optional[str]
    outbound_score: int
    outbound_tier: str
    rep_id: str
    rep_name: str
    fit_score: int
    fit_breakdown: list[dict]            # [{factor, points, detail}, ...]
    play_id: Optional[str]
    primary_signal: Optional[str]
    signals: list[dict]                  # full payload list

    def to_dict(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# Account play (bundled multi-thread)
# ---------------------------------------------------------------------------

@dataclass
class AccountPlay:
    account_id: str
    company: Optional[str]
    industry: Optional[str]
    company_size_band: Optional[str]
    outbound_vertical: Optional[str]
    rep_id: str                          # single-thread the account
    rep_name: str
    primary_lead: dict                   # {email, name, title, role, why}
    supporting_leads: list[dict]         # [{email, name, title, role, why}, ...]
    signals: list[dict]
    play_id: Optional[str]
    sequence: list[str]                  # ordered narrative of who to touch when

    def to_dict(self) -> dict:
        return asdict(self)
