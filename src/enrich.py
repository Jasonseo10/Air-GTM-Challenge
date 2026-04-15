"""
Mocked enrichment API (Clearbit/ZoomInfo-style).

The `enrich_lead` function is the public interface and looks/behaves like a
real network call: it takes time, it occasionally fails, and callers retry
with exponential backoff. This lets us demonstrate the integration pattern
without any external dependency.

Determinism: the mock hashes the company+domain so the same input always
produces the same enrichment output. Failures are also hash-driven but
modulated by an attempt counter so retries can succeed.

Adds two enriched fields (plus a few bonuses):
  - company_size_band     (e.g., "51-200")
  - company_size_min      (int, for numeric scoring rules)
  - industry              (e.g., "SaaS", "Financial Services")
  - estimated_revenue     ("$1M-$10M", etc.)
  - seniority_level       (derived from title)
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
# Mock dataset — deterministic "API responses" keyed by email domain.
# In a real integration this would be replaced by a Clearbit/ZoomInfo HTTP
# client. Keeping the shape identical to what those APIs return would make
# the swap a one-line change in `_call_mock_api`.
# ---------------------------------------------------------------------------

# Curated for domains we see in the sample data. Everything else falls through
# to a deterministic hash-based synthesis so no lead is ever un-enriched
# (except when the API throws).
_DOMAIN_ENRICHMENTS: dict[str, dict] = {
    "air.inc": {
        "company_name": "Air Inc",
        "company_size_band": "51-200",
        "company_size_min": 51,
        "industry": "Creative Operations",
        "estimated_revenue": "$10M-$50M",
    },
    "gmail.com": {
        "company_name": None,  # personal email — company must come from the lead row
        "company_size_band": "Unknown",
        "company_size_min": 0,
        "industry": "Personal / Unknown",
        "estimated_revenue": "Unknown",
    },
    "yahoo.com": {
        "company_name": None,
        "company_size_band": "Unknown",
        "company_size_min": 0,
        "industry": "Personal / Unknown",
        "estimated_revenue": "Unknown",
    },
    "company.com": {
        "company_name": "Company",
        "company_size_band": "1000-5000",
        "company_size_min": 1000,
        "industry": "Enterprise Software",
        "estimated_revenue": "$100M-$500M",
    },
    "business.co": {
        "company_name": "Business Co",
        "company_size_band": "201-500",
        "company_size_min": 201,
        "industry": "Financial Services",
        "estimated_revenue": "$50M-$100M",
    },
    "startup.io": {
        "company_name": "Startup.io",
        "company_size_band": "11-50",
        "company_size_min": 11,
        "industry": "SaaS",
        "estimated_revenue": "$1M-$10M",
    },
    "example.com": {
        "company_name": "Example Corp",
        "company_size_band": "501-1000",
        "company_size_min": 501,
        "industry": "SaaS",
        "estimated_revenue": "$50M-$100M",
    },
}

_INDUSTRIES = [
    "SaaS",
    "Financial Services",
    "Healthcare",
    "E-commerce",
    "Marketing Technology",
    "Cybersecurity",
    "Developer Tools",
]

_SIZE_BANDS = [
    ("1-10", 1),
    ("11-50", 11),
    ("51-200", 51),
    ("201-500", 201),
    ("501-1000", 501),
    ("1000-5000", 1000),
    ("5000+", 5000),
]

_REVENUE_BANDS = [
    "<$1M",
    "$1M-$10M",
    "$10M-$50M",
    "$50M-$100M",
    "$100M-$500M",
    "$500M+",
]


def _stable_hash(s: str) -> int:
    """Deterministic hash (Python's built-in hash is salted per process)."""
    return int(hashlib.md5(s.encode("utf-8")).hexdigest(), 16)


def _synthesize_enrichment(domain: str) -> dict:
    """Fallback enrichment for unknown domains. Deterministic by domain."""
    h = _stable_hash(domain)
    band, size_min = _SIZE_BANDS[h % len(_SIZE_BANDS)]
    industry = _INDUSTRIES[(h >> 4) % len(_INDUSTRIES)]
    revenue = _REVENUE_BANDS[(h >> 8) % len(_REVENUE_BANDS)]
    return {
        "company_name": None,
        "company_size_band": band,
        "company_size_min": size_min,
        "industry": industry,
        "estimated_revenue": revenue,
    }


# ---------------------------------------------------------------------------
# Seniority derivation — not from the "API", from the normalized title.
# Kept alongside enrichment because it's conceptually the same step: inferring
# structured attributes callers can score against.
# ---------------------------------------------------------------------------

_SENIORITY_RULES = [
    ("C-Level", ("ceo", "cto", "cfo", "coo", "cmo", "cio", "chief")),
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


# ---------------------------------------------------------------------------
# Mock network call
# ---------------------------------------------------------------------------

class EnrichmentAPIError(Exception):
    """Simulated transient failure from the enrichment provider."""


@dataclass
class EnrichmentConfig:
    failure_rate: float = 0.10     # probability a single attempt fails
    base_delay_ms: int = 5         # artificial latency floor
    jitter_ms: int = 10            # added latency jitter
    max_retries: int = 3           # per-lead retry budget
    backoff_base_ms: int = 50      # first backoff wait
    backoff_factor: float = 2.0    # exponential factor


def _call_mock_api(email: str, attempt: int, cfg: EnrichmentConfig,
                   rng: random.Random) -> dict:
    """The 'HTTP call'. Sleeps, sometimes raises, otherwise returns a dict."""
    time.sleep((cfg.base_delay_ms + rng.random() * cfg.jitter_ms) / 1000.0)

    # Deterministic-ish failure: hash(email)+attempt determines outcome so
    # the same email can succeed on a later attempt (otherwise retries would
    # be pointless).
    roll = ((_stable_hash(email) + attempt * 1_000_003) % 10_000) / 10_000.0
    if roll < cfg.failure_rate:
        raise EnrichmentAPIError(f"simulated 503 for {email} (attempt {attempt})")

    domain = email.split("@", 1)[1] if "@" in email else ""
    base = _DOMAIN_ENRICHMENTS.get(domain) or _synthesize_enrichment(domain)
    return dict(base)  # defensive copy


def enrich_lead(lead: dict, cfg: Optional[EnrichmentConfig] = None,
                rng: Optional[random.Random] = None) -> dict:
    """
    Enrich a single lead. Returns a new dict with enriched fields merged in.

    On persistent failure, the lead still comes back but with
    `enrichment_status = "failed"` and a note in `data_quality_issues`. We
    never drop leads at this stage — scoring and CRM ingestion can still
    happen on partial data.
    """
    cfg = cfg or EnrichmentConfig()
    rng = rng or random.Random()
    email = lead["email"]

    last_error: Optional[Exception] = None
    enrichment: Optional[dict] = None
    for attempt in range(1, cfg.max_retries + 1):
        try:
            enrichment = _call_mock_api(email, attempt, cfg, rng)
            logger.debug("enriched %s on attempt %d", email, attempt)
            break
        except EnrichmentAPIError as exc:
            last_error = exc
            if attempt >= cfg.max_retries:
                break
            wait_ms = cfg.backoff_base_ms * (cfg.backoff_factor ** (attempt - 1))
            logger.info("retry %d for %s after %dms: %s",
                        attempt, email, int(wait_ms), exc)
            time.sleep(wait_ms / 1000.0)

    out = dict(lead)
    out["seniority_level"] = derive_seniority(lead.get("title"))
    if enrichment is None:
        out["enrichment_status"] = "failed"
        # Bucket tag for the histogram + separate detail column for audit.
        out.setdefault("data_quality_issues", []).append("enrichment_failed")
        out["enrichment_error"] = str(last_error) if last_error else "unknown"
        out["company_size_band"] = None
        out["company_size_min"] = 0
        out["industry"] = None
        out["estimated_revenue"] = None
    else:
        out["enrichment_status"] = "ok"
        out["company_size_band"] = enrichment["company_size_band"]
        out["company_size_min"] = enrichment["company_size_min"]
        out["industry"] = enrichment["industry"]
        out["estimated_revenue"] = enrichment["estimated_revenue"]
        # If we don't have a company on the lead but the domain is corporate,
        # backfill from enrichment. Personal domains return None and are a no-op.
        if not lead.get("company") and enrichment.get("company_name"):
            out["company"] = enrichment["company_name"]
            out.setdefault("data_quality_issues", []).append(
                "company_backfilled_from_enrichment"
            )
    return out
