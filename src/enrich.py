"""
Three-layer waterfall enrichment.

Real GTM ops never rely on a single provider: no one vendor has full coverage,
and the fields they're strong at differ. Clay, Apollo, and in-house enrichment
stacks all work as waterfalls — provider A fills what it can, provider B fills
the gaps A left, and product telemetry fills the rest.

This module implements that pattern end-to-end with two mocked external
providers and an internal product-telemetry layer:

    Layer 1  FirmoGraph   — firmographic (company_size, industry, revenue, hq_country)
                            ~70% coverage, strongest on established companies.
    Layer 2  StackLens    — technographic (tools detected, creative/martech stack flags)
                            ~55% coverage, only attempted when we have a domain signal.
    Layer 3  Product DB   — internal product telemetry (pricing views, credit usage,
                            asset uploads, teammates, channels, creative hiring).
                            Always populated — it's our own data.

Determinism: every layer is hashed on a stable key (domain, email) so the same
input always produces the same output. Failures are also hash-driven but
modulated by attempt so retries can succeed — otherwise the retry loop is
theatre.

Swap rules:
    - Replace `FirmoGraphProvider._fetch` with a Clearbit/ZoomInfo client.
    - Replace `StackLensProvider._fetch` with a BuiltWith/HG Insights client.
    - Replace `_synthesize_product_signals` with a Segment/Amplitude query.
The calling contract (dict-in, dict-out) stays identical, so the swap is a
per-layer change, not a pipeline rewrite.
"""

from __future__ import annotations

import hashlib
import logging
import random
import time
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Curated enrichment data — deterministic "API responses" keyed by email domain.
# In production these come from Clearbit/ZoomInfo/BuiltWith. The shape matches
# what those APIs actually return so the swap is one function deep.
# ---------------------------------------------------------------------------

_FIRMOGRAPH_KNOWN: dict[str, dict] = {
    "air.inc": {
        "company_name": "Air Inc",
        "company_size_band": "51-200",
        "company_size_min": 51,
        "industry": "Creative Operations",
        "estimated_revenue": "$10M-$50M",
        "hq_country": "United States",
    },
    "gmail.com": None,       # personal — firmographic provider returns 404
    "yahoo.com": None,
    "hotmail.com": None,
    "outlook.com": None,
    "company.com": {
        "company_name": "Company",
        "company_size_band": "1000-5000",
        "company_size_min": 1000,
        "industry": "Enterprise Software",
        "estimated_revenue": "$100M-$500M",
        "hq_country": "United States",
    },
    "business.co": {
        "company_name": "Business Co",
        "company_size_band": "201-500",
        "company_size_min": 201,
        "industry": "Financial Services",
        "estimated_revenue": "$50M-$100M",
        "hq_country": "United Kingdom",
    },
    "startup.io": {
        "company_name": "Startup.io",
        "company_size_band": "11-50",
        "company_size_min": 11,
        "industry": "SaaS",
        "estimated_revenue": "$1M-$10M",
        "hq_country": "United States",
    },
    "example.com": {
        "company_name": "Example Corp",
        "company_size_band": "501-1000",
        "company_size_min": 501,
        "industry": "SaaS",
        "estimated_revenue": "$50M-$100M",
        "hq_country": "United States",
    },
}

_INDUSTRIES = [
    "SaaS", "Financial Services", "Healthcare", "E-commerce",
    "Marketing Technology", "Cybersecurity", "Developer Tools",
    "Creative Operations", "Media", "Retail",
]

_SIZE_BANDS = [
    ("1-10", 1), ("11-50", 11), ("51-200", 51), ("201-500", 201),
    ("501-1000", 501), ("1000-5000", 1000), ("5000+", 5000),
]

_REVENUE_BANDS = [
    "<$1M", "$1M-$10M", "$10M-$50M", "$50M-$100M", "$100M-$500M", "$500M+",
]

_COUNTRIES = [
    "United States", "Canada", "United Kingdom", "Germany",
    "France", "Australia", "Netherlands",
]

_PERSONAL_DOMAINS = {
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
    "icloud.com", "protonmail.com", "aol.com",
}

# Tools we pretend to "detect" on a company's web footprint. Tagged by
# category so the scoring layer can reason about stack composition.
_TOOL_CATALOG = [
    ("Figma",           "creative"),
    ("Adobe Creative Cloud", "creative"),
    ("Canva",           "creative"),
    ("Frame.io",        "creative"),
    ("HubSpot",         "martech"),
    ("Marketo",         "martech"),
    ("Segment",         "martech"),
    ("Salesforce",      "crm"),
    ("Slack",           "collab"),
    ("Notion",          "collab"),
    ("Asana",           "pm"),
    ("Linear",          "pm"),
]


def _stable_hash(s: str) -> int:
    """Deterministic hash (Python's built-in `hash()` is salted per process)."""
    return int(hashlib.md5(s.encode("utf-8")).hexdigest(), 16)


# ---------------------------------------------------------------------------
# Layer 1 — FirmoGraph (firmographic provider, mocked)
# ---------------------------------------------------------------------------

class FirmoGraphProvider:
    """
    Firmographic data: who the company is.

    Maps to Clearbit / ZoomInfo / Apollo in production. Strongest on company
    size, industry, and revenue band. Returns None for personal domains
    (providers typically 404 on gmail.com rather than guessing).
    """

    name = "firmograph"

    def __init__(self, failure_rate: float = 0.08):
        self.failure_rate = failure_rate

    def fetch(self, domain: str, attempt: int) -> Optional[dict]:
        if not domain:
            return None
        # Simulated transient failure (different key than StackLens so a retry
        # has independent odds — matches real-world vendor behavior).
        roll = ((_stable_hash(f"fg:{domain}") + attempt * 1_000_003) % 10_000) / 10_000.0
        if roll < self.failure_rate:
            raise EnrichmentAPIError(f"firmograph 503 for {domain} (attempt {attempt})")

        if domain in _FIRMOGRAPH_KNOWN:
            curated = _FIRMOGRAPH_KNOWN[domain]
            return dict(curated) if curated else None

        # Personal-email domains: provider returns no match.
        if domain in _PERSONAL_DOMAINS:
            return None

        h = _stable_hash(domain)
        band, size_min = _SIZE_BANDS[h % len(_SIZE_BANDS)]
        return {
            "company_name": None,
            "company_size_band": band,
            "company_size_min": size_min,
            "industry": _INDUSTRIES[(h >> 4) % len(_INDUSTRIES)],
            "estimated_revenue": _REVENUE_BANDS[(h >> 8) % len(_REVENUE_BANDS)],
            "hq_country": _COUNTRIES[(h >> 12) % len(_COUNTRIES)],
        }


# ---------------------------------------------------------------------------
# Layer 2 — StackLens (technographic provider, mocked)
# ---------------------------------------------------------------------------

class StackLensProvider:
    """
    Technographic data: what the company runs.

    Maps to BuiltWith / HG Insights / G2 Stack in production. Only attempted
    when firmograph returned something — a technographic provider has nothing
    to look up without a corporate domain. Adds tool-stack signals that let us
    distinguish "modern creative team" from "legacy back-office" beyond just
    industry label.
    """

    name = "stacklens"

    def __init__(self, failure_rate: float = 0.12):
        # Higher failure rate than firmograph — technographic coverage is
        # thinner in the real world too.
        self.failure_rate = failure_rate

    def fetch(self, domain: str, attempt: int) -> Optional[dict]:
        if not domain or domain in _PERSONAL_DOMAINS:
            return None
        roll = ((_stable_hash(f"sl:{domain}") + attempt * 1_000_003) % 10_000) / 10_000.0
        if roll < self.failure_rate:
            raise EnrichmentAPIError(f"stacklens 503 for {domain} (attempt {attempt})")

        h = _stable_hash(f"stack:{domain}")
        # 0-5 tools detected per company, biased by size/industry at the
        # caller layer (we don't have that context here, so keep it simple).
        n_tools = 1 + (h % 5)
        picks: list[tuple[str, str]] = []
        seen = set()
        for i in range(n_tools):
            idx = (h >> (i * 3)) % len(_TOOL_CATALOG)
            tool = _TOOL_CATALOG[idx]
            if tool[0] not in seen:
                picks.append(tool)
                seen.add(tool[0])
        detected_tools = [t[0] for t in picks]
        has_creative_stack = any(cat == "creative" for _, cat in picks)
        has_martech_stack = any(cat == "martech" for _, cat in picks)
        # 0-100 — proxy for "how modern is the stack" (weighted by creative +
        # martech presence). Used by scoring as a contextual multiplier.
        tech_modernity_score = min(
            100,
            len(detected_tools) * 12
            + (25 if has_creative_stack else 0)
            + (20 if has_martech_stack else 0),
        )
        return {
            "detected_tools": detected_tools,
            "has_creative_stack": has_creative_stack,
            "has_martech_stack": has_martech_stack,
            "tech_modernity_score": tech_modernity_score,
        }


# ---------------------------------------------------------------------------
# Layer 3 — Product telemetry (internal, always available)
# ---------------------------------------------------------------------------

_TARGET_INDUSTRIES = {
    "SaaS", "Marketing Technology", "Creative Operations",
    "Developer Tools", "E-commerce", "Media",
}


def _synthesize_product_signals(lead: dict) -> dict:
    """
    Generate product-usage signals that would normally come from our own
    application DB / Segment / Amplitude. Correlated with source, size, title
    so the numbers feel realistic — a Product Signup has more pricing views
    than a cold Website Visitor, Enterprise accounts have more teammates, etc.
    """
    h = _stable_hash(lead.get("email", ""))
    source = (lead.get("source") or "").lower()
    size_min = lead.get("company_size_min") or 0
    title = (lead.get("title") or "").lower()
    industry = lead.get("industry") or ""
    has_creative_stack = bool(lead.get("has_creative_stack"))

    # --- pricing_page_views (0-50) ---
    base_views = (h % 12)
    if "product signup" in source:
        base_views += 15 + (h >> 3) % 20
    elif "website visitor" in source:
        base_views += 8 + (h >> 5) % 15
    elif "event" in source:
        base_views += 3 + (h >> 7) % 8
    pricing_page_views = min(base_views, 50)

    # --- has_signup_intent ---
    if "product signup" in source:
        has_signup_intent = True
    elif "website visitor" in source:
        has_signup_intent = ((h >> 4) % 5) < 2   # ~40%
    else:
        has_signup_intent = ((h >> 6) % 10) < 1   # ~10%

    # --- credit_usage_pct (0-100) ---
    if has_signup_intent:
        credit_usage_pct = 30 + (h >> 2) % 65
        if "product signup" in source:
            credit_usage_pct = min(credit_usage_pct + 15, 100)
    else:
        credit_usage_pct = 5 + (h >> 2) % 30

    # --- asset_uploads (0-500) ---
    asset_uploads = int(credit_usage_pct * 1.5) + (h >> 8) % 80
    if size_min >= 200:
        asset_uploads += 60 + (h >> 10) % 100
    if has_signup_intent:
        asset_uploads += 40 + (h >> 12) % 60
    if has_creative_stack:
        # Companies already running Figma/Adobe tend to upload more.
        asset_uploads += 30 + (h >> 14) % 40
    asset_uploads = min(asset_uploads, 500)

    # --- teammate_invites (0-20) ---
    teammate_invites = (h >> 5) % 3
    if has_signup_intent:
        teammate_invites += 2 + (h >> 11) % 5
    if size_min >= 1000:
        teammate_invites += 4 + (h >> 9) % 5
    elif size_min >= 200:
        teammate_invites += 2 + (h >> 7) % 3
    teammate_invites = min(teammate_invites, 20)

    # --- active_channels (1-8) ---
    active_channels = 1 + (h >> 3) % 3
    if size_min >= 1000:
        active_channels += 3 + (h >> 6) % 2
    elif size_min >= 200:
        active_channels += 1 + (h >> 8) % 2
    if industry in _TARGET_INDUSTRIES:
        active_channels += 1
    active_channels = min(active_channels, 8)

    # --- creative_job_postings (0-15) ---
    creative_job_postings = (h >> 4) % 4
    if size_min >= 1000:
        creative_job_postings += 4 + (h >> 7) % 5
    elif size_min >= 200:
        creative_job_postings += 2 + (h >> 9) % 3
    if any(kw in title for kw in ("marketing", "creative", "brand", "content", "design")):
        creative_job_postings += 2
    creative_job_postings = min(creative_job_postings, 15)

    has_marketing_title = any(
        kw in title for kw in (
            "marketing", "creative", "brand", "content",
            "design", "growth", "demand", "campaign",
        )
    )

    # --- Derived activation score (0-100) ---
    # Composite of real usage (not intent). Used by the "activated enterprise"
    # rule to catch large accounts that are actually using the product —
    # rare, and much higher confidence than a large account with low usage.
    activation_score = min(
        100,
        int(credit_usage_pct * 0.4)
        + min(asset_uploads, 300) // 6
        + teammate_invites * 2,
    )

    return {
        "pricing_page_views": pricing_page_views,
        "has_signup_intent": has_signup_intent,
        "credit_usage_pct": credit_usage_pct,
        "asset_uploads": asset_uploads,
        "teammate_invites": teammate_invites,
        "active_channels": active_channels,
        "creative_job_postings": creative_job_postings,
        "has_marketing_title": has_marketing_title,
        "activation_score": activation_score,
    }


# ---------------------------------------------------------------------------
# Seniority derivation — not "API" data, inferred from normalized title.
# ---------------------------------------------------------------------------

_SENIORITY_RULES = [
    ("C-Level", ("ceo", "cto", "cfo", "coo", "cmo", "cio", "chief", "founder")),
    ("VP", ("vp", "vice president", "svp", "evp")),
    ("Director", ("director", "head of")),
    ("Manager", ("manager",)),
    ("Senior IC", ("senior", "sr ", "lead", "principal", "staff")),
    ("IC", ("engineer", "designer", "analyst", "marketer", "developer")),
]


def derive_seniority(title: Optional[str]) -> str:
    if not title:
        return "Unknown"
    lower = title.lower()
    for level, keywords in _SENIORITY_RULES:
        if any(k in lower for k in keywords):
            return level
    return "Unknown"


def is_business_email(email: Optional[str]) -> bool:
    """True if the email domain isn't a personal/consumer provider."""
    if not email or "@" not in email:
        return False
    return email.split("@", 1)[1].lower() not in _PERSONAL_DOMAINS


# ---------------------------------------------------------------------------
# Waterfall orchestration
# ---------------------------------------------------------------------------

class EnrichmentAPIError(Exception):
    """Simulated transient failure from an enrichment provider."""


@dataclass
class EnrichmentConfig:
    base_delay_ms: int = 5
    jitter_ms: int = 10
    max_retries: int = 3
    backoff_base_ms: int = 50
    backoff_factor: float = 2.0
    firmograph_failure_rate: float = 0.08
    stacklens_failure_rate: float = 0.12


def _retry_fetch(provider, domain: str, cfg: EnrichmentConfig,
                 rng: random.Random) -> tuple[Optional[dict], Optional[str]]:
    """Call a provider with retry + exponential backoff. Returns (data, err)."""
    last_err: Optional[str] = None
    for attempt in range(1, cfg.max_retries + 1):
        # Artificial latency so the retry machinery is observable even on
        # tiny datasets — in production these are real network round-trips.
        time.sleep((cfg.base_delay_ms + rng.random() * cfg.jitter_ms) / 1000.0)
        try:
            data = provider.fetch(domain, attempt)
            return data, None
        except EnrichmentAPIError as exc:
            last_err = str(exc)
            if attempt >= cfg.max_retries:
                break
            wait_ms = cfg.backoff_base_ms * (cfg.backoff_factor ** (attempt - 1))
            logger.info("%s retry %d for %s after %dms: %s",
                        provider.name, attempt, domain, int(wait_ms), exc)
            time.sleep(wait_ms / 1000.0)
    return None, last_err


def _merge_missing(base: dict, incoming: Optional[dict]) -> dict:
    """Waterfall merge: only fill keys the base dict doesn't already have."""
    if not incoming:
        return base
    for k, v in incoming.items():
        if base.get(k) in (None, "", 0) and v not in (None, ""):
            base[k] = v
    return base


def enrich_lead(lead: dict, cfg: Optional[EnrichmentConfig] = None,
                rng: Optional[random.Random] = None) -> dict:
    """
    Run the full three-layer waterfall for a single lead.

    Never drops a lead: even if both external providers fail, product
    telemetry is always synthesizable from what we already know (email,
    source, title). Failures are recorded in `data_quality_issues` and
    `enrichment_provider_errors` so the downstream pipeline — and a human
    reviewer — can decide how to treat partial records.
    """
    cfg = cfg or EnrichmentConfig()
    rng = rng or random.Random()

    out = dict(lead)
    email = lead.get("email") or ""
    domain = email.split("@", 1)[1].lower() if "@" in email else ""

    provider_errors: dict[str, str] = {}
    providers_succeeded: list[str] = []

    # Layer 1 — FirmoGraph
    fg = FirmoGraphProvider(failure_rate=cfg.firmograph_failure_rate)
    fg_data, fg_err = _retry_fetch(fg, domain, cfg, rng)
    if fg_err:
        provider_errors["firmograph"] = fg_err
    if fg_data is not None:
        providers_succeeded.append("firmograph")
        _merge_missing(out, fg_data)
        # Company backfill: corporate domains only (personal returns None).
        if not lead.get("company") and fg_data.get("company_name"):
            out["company"] = fg_data["company_name"]
            out.setdefault("data_quality_issues", []).append(
                "company_backfilled_from_enrichment"
            )

    # Layer 2 — StackLens (only useful when we have a real domain match)
    if domain and domain not in _PERSONAL_DOMAINS:
        sl = StackLensProvider(failure_rate=cfg.stacklens_failure_rate)
        sl_data, sl_err = _retry_fetch(sl, domain, cfg, rng)
        if sl_err:
            provider_errors["stacklens"] = sl_err
        if sl_data is not None:
            providers_succeeded.append("stacklens")
            _merge_missing(out, sl_data)

    # Fallbacks for any firmographic field still missing — we'd rather score
    # on "unknown" than crash a numeric rule. The scoring layer treats 0 as
    # neutral, not as a positive signal.
    out.setdefault("company_size_band", None)
    out.setdefault("company_size_min", 0)
    out.setdefault("industry", None)
    out.setdefault("estimated_revenue", None)
    out.setdefault("hq_country", None)
    out.setdefault("detected_tools", [])
    out.setdefault("has_creative_stack", False)
    out.setdefault("has_martech_stack", False)
    out.setdefault("tech_modernity_score", 0)

    # Layer 3 — Product telemetry (internal, always runs)
    out["seniority_level"] = derive_seniority(lead.get("title"))
    out["is_business_email"] = is_business_email(email)
    out.update(_synthesize_product_signals(out))

    # Provenance — what actually fired, what failed. Lets us audit coverage
    # in the summary report and gives the dashboard something real to show
    # in the detail panel.
    out["enrichment_providers_ok"] = providers_succeeded
    if provider_errors:
        out["enrichment_provider_errors"] = provider_errors

    # Tri-state status. "no_match" is NOT a failure: personal-email leads
    # intentionally have no firmographic record (Clearbit/ZoomInfo 404 them
    # in production too). We only call it "failed" when providers actually
    # errored — that's a pipeline health signal, not a data-quality one.
    if providers_succeeded:
        out["enrichment_status"] = "ok"
    elif provider_errors:
        out["enrichment_status"] = "failed"
        out.setdefault("data_quality_issues", []).append("enrichment_failed")
        out["enrichment_error"] = "; ".join(
            f"{k}: {v}" for k, v in provider_errors.items()
        )
    else:
        out["enrichment_status"] = "no_match"
        out.setdefault("data_quality_issues", []).append("enrichment_no_match")

    return out
