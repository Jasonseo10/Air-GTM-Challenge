"""
Field-level normalizers.

Each normalizer takes a raw string and returns either a cleaned string or None.
Normalizers are deliberately conservative: we'd rather flag a gap than invent
data. Callers collect per-record issues and include them in the output so GTM
can see why a lead was flagged.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Optional

# ---------------------------------------------------------------------------
# Name
# ---------------------------------------------------------------------------

def normalize_name(raw: Optional[str]) -> Optional[str]:
    """Title-case a name, collapse whitespace, drop empty/placeholder values."""
    if not raw:
        return None
    cleaned = " ".join(raw.strip().split())
    if not cleaned:
        return None
    # Preserve particles that shouldn't be title-cased (de, van, etc.) — not
    # needed for this dataset, but cheap to get right.
    particles = {"de", "van", "von", "la", "da"}
    parts = []
    for token in cleaned.split(" "):
        lower = token.lower()
        if lower in particles and parts:  # keep lowercase unless it's the first name
            parts.append(lower)
        else:
            parts.append(token[:1].upper() + token[1:].lower())
    return " ".join(parts)


def split_name(full_name: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    """Split into (first, last) for Salesforce. Single-token names go to first."""
    if not full_name:
        return None, None
    tokens = full_name.split(" ")
    if len(tokens) == 1:
        return tokens[0], None
    return tokens[0], " ".join(tokens[1:])


# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------

# Pragmatic regex — not RFC 5322, but catches the malformed rows in this
# dataset (missing @, missing TLD, missing domain).
_EMAIL_RE = re.compile(r"^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$", re.IGNORECASE)


def normalize_email(raw: Optional[str]) -> Optional[str]:
    """Lowercase + strip. Returns None if invalid."""
    if not raw:
        return None
    cleaned = raw.strip().lower()
    if not _EMAIL_RE.match(cleaned):
        return None
    return cleaned


def email_domain(email: Optional[str]) -> Optional[str]:
    if not email or "@" not in email:
        return None
    return email.split("@", 1)[1]


# ---------------------------------------------------------------------------
# Title
# ---------------------------------------------------------------------------

# Order matters: longer/more specific phrases first so we don't over-expand.
_TITLE_SUBSTITUTIONS = [
    (re.compile(r"\bsr\.?\s+eng\.?\b", re.IGNORECASE), "Senior Engineer"),
    (re.compile(r"\bsr\.?\s+engineer\b", re.IGNORECASE), "Senior Engineer"),
    (re.compile(r"\bsr\.?\b", re.IGNORECASE), "Senior"),
    (re.compile(r"\bjr\.?\b", re.IGNORECASE), "Junior"),
    (re.compile(r"\bmktg\b", re.IGNORECASE), "Marketing"),
    (re.compile(r"\beng\.?\b", re.IGNORECASE), "Engineer"),
]

# Tokens that should stay uppercase after title-casing.
_ALL_CAPS_TITLE_TOKENS = {"CEO", "CTO", "CFO", "COO", "CMO", "CIO", "VP", "SVP", "EVP"}

# Tokens that stay lowercase when they appear mid-title (but not as the first
# word) — standard title-case convention. e.g., "Head of Sales", not "Head Of
# Sales".
_LOWERCASE_MID_TOKENS = {"of", "and", "the", "in", "on", "for", "to", "or"}


def normalize_title(raw: Optional[str]) -> Optional[str]:
    """Expand abbreviations, title-case, preserve C-level/VP tokens."""
    if not raw:
        return None
    cleaned = " ".join(raw.strip().split())
    if not cleaned:
        return None
    for pattern, replacement in _TITLE_SUBSTITUTIONS:
        cleaned = pattern.sub(replacement, cleaned)
    # Title-case word by word, but keep C-level acronyms uppercase and
    # prepositions/articles lowercase when they're not the first word.
    out_tokens = []
    for idx, token in enumerate(cleaned.split(" ")):
        upper = token.upper()
        lower = token.lower()
        if upper in _ALL_CAPS_TITLE_TOKENS:
            out_tokens.append(upper)
        elif idx > 0 and lower in _LOWERCASE_MID_TOKENS:
            out_tokens.append(lower)
        else:
            out_tokens.append(token[:1].upper() + token[1:].lower())
    return " ".join(out_tokens)


# ---------------------------------------------------------------------------
# Phone
# ---------------------------------------------------------------------------

_PHONE_PLACEHOLDERS = {"call me", "n/a", "na", "none", "tbd", ""}


def normalize_phone(raw: Optional[str]) -> Optional[str]:
    """
    Return E.164-style +1 (XXX) XXX-XXXX for 10/11-digit NANP numbers.
    Placeholders and short/incomplete numbers return None.
    """
    if not raw:
        return None
    stripped = raw.strip().lower()
    if stripped in _PHONE_PLACEHOLDERS:
        return None
    digits = re.sub(r"\D", "", stripped)
    if len(digits) == 10:
        return f"+1 ({digits[0:3]}) {digits[3:6]}-{digits[6:10]}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+1 ({digits[1:4]}) {digits[4:7]}-{digits[7:11]}"
    # Anything else (7-digit fragments like "5551212", or gibberish) is unusable.
    return None


# ---------------------------------------------------------------------------
# Country
# ---------------------------------------------------------------------------

# Assumption: "CA" in this dataset refers to Canada, not California. This is
# the most defensible read given (a) the column is labeled "Country" and
# (b) Canada and CA never co-occur on the same row for the same lead. Called
# out in the README.
_COUNTRY_MAP = {
    "united states": "United States",
    "us": "United States",
    "usa": "United States",
    "u.s.": "United States",
    "u.s.a.": "United States",
    "canada": "Canada",
    "ca": "Canada",
    "uk": "United Kingdom",
    "u.k.": "United Kingdom",
    "united kingdom": "United Kingdom",
    "great britain": "United Kingdom",
    "germany": "Germany",
    "france": "France",
    "india": "India",
}


def normalize_country(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    key = raw.strip().lower()
    if not key:
        return None
    return _COUNTRY_MAP.get(key)  # unknown values become None and get flagged


# ---------------------------------------------------------------------------
# Date
# ---------------------------------------------------------------------------

# Accepted formats, in order of preference.
_DATE_FORMATS = [
    "%Y-%m-%d",       # 2025-04-01
    "%d-%b-%Y",       # 19-Mar-2025
    "%m/%d/%Y",       # 05/07/2025 (assumed US — see README)
]

_RELATIVE_RE = re.compile(r"^(\d+)\s+days?\s+ago$", re.IGNORECASE)


def normalize_date(raw: Optional[str], today: Optional[date] = None) -> Optional[str]:
    """Return ISO-8601 YYYY-MM-DD. `today` is injectable for deterministic tests."""
    if not raw:
        return None
    cleaned = raw.strip()
    if not cleaned:
        return None
    today = today or date.today()

    m = _RELATIVE_RE.match(cleaned)
    if m:
        days = int(m.group(1))
        return (today - timedelta(days=days)).isoformat()

    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(cleaned, fmt).date().isoformat()
        except ValueError:
            continue
    return None


# ---------------------------------------------------------------------------
# Company
# ---------------------------------------------------------------------------

# Canonical display names for companies we've seen more than one spelling of.
# Key is the lowercased/stripped/non-alphanumeric-removed form.
_COMPANY_CANONICAL = {
    "airinc": "Air Inc",
    "examplecorp": "Example Corp",
    "globaltech": "GlobalTech",
    "startupio": "Startup.io",
    "acmeco": "Acme Co",
    "initech": "Initech",
    "umbrellacorp": "Umbrella Corp",
    "company": "Company",  # Literal "COMPANY" in the data — treated as real.
}


def _company_key(raw: str) -> str:
    return re.sub(r"[^a-z0-9]", "", raw.lower())


def normalize_company(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    cleaned = " ".join(raw.strip().split())
    if not cleaned:
        return None
    key = _company_key(cleaned)
    if key in _COMPANY_CANONICAL:
        return _COMPANY_CANONICAL[key]
    # Unknown company: preserve casing for proper nouns, but collapse dots
    # and weird spacing.
    return cleaned


# ---------------------------------------------------------------------------
# Lead source
# ---------------------------------------------------------------------------

_SOURCE_MAP = {
    "linkedin": "LinkedIn",
    "website visitor": "Website Visitor",
    "referral": "Referral",
    "event": "Event",
    "product signup": "Product Signup",
    "product sign-up": "Product Signup",
}


def normalize_source(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    key = raw.strip().lower()
    return _SOURCE_MAP.get(key, raw.strip())
