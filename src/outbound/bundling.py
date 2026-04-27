"""
Account-level bundling for multi-threading.

Groups RoutedLeads by account, designates a primary contact (highest
fit score) plus supporting roles (different seniority levels for
multi-thread depth), and assigns the whole account to a single rep
to avoid the same prospect being touched by multiple AEs.
"""

from __future__ import annotations

from typing import Optional

from .schema import RoutedLead, AccountPlay


def _role_for_lead(lead_dict: dict) -> str:
    """Tag a lead with its multi-thread role inside an account."""
    sen = (lead_dict.get("seniority_level") or "").lower()
    title = (lead_dict.get("title") or "").lower()
    if sen == "c-level" or any(t in title for t in ("ceo", "cmo", "cto", "founder")):
        return "economic_buyer"
    if "marketing" in title or "brand" in title or "growth" in title:
        return "champion_marketing"
    if "creative" in title or "design" in title or "content" in title:
        return "champion_creative"
    if "ops" in title or "revops" in title:
        return "operator_IC"
    if sen in ("vp", "director"):
        return "exec_sponsor"
    return "operator_IC"


def _why_for_role(role: str) -> str:
    return {
        "economic_buyer": "exec sponsor — needed for budget approval",
        "champion_marketing": "primary marketing-side champion",
        "champion_creative": "primary creative-side champion",
        "exec_sponsor": "senior multi-thread anchor",
        "operator_IC": "in-the-trenches user / day-to-day pain",
    }.get(role, "supporting contact")


def bundle_accounts(routed: list[RoutedLead]) -> list[AccountPlay]:
    """
    Group routed leads by account_id. Single-lead accounts return as
    one-contact AccountPlays so the dashboard's Account View has one row
    per account regardless of fan-out.
    """
    by_account: dict[str, list[RoutedLead]] = {}
    for r in routed:
        by_account.setdefault(r.account_id, []).append(r)

    plays: list[AccountPlay] = []
    for acc, group in by_account.items():
        # Sort by fit_score desc — primary contact = best-fit assignment.
        group.sort(key=lambda r: r.fit_score, reverse=True)
        primary = group[0]

        # Single rep for the whole account: the primary contact's rep.
        # Reassign supporting leads to the same rep in the AccountPlay
        # (the original RoutedLead per-lead routing is preserved upstream
        #  — bundling.py's job is only the account-level recommendation).
        rep_id = primary.rep_id
        rep_name = primary.rep_name

        primary_d = {
            "email": primary.lead_email,
            "name": primary.lead_name,
            "title": primary.title,
            "seniority_level": primary.seniority_level,
            "fit_score": primary.fit_score,
            "role": _role_for_lead(primary.to_dict()),
            "why": "highest-fit contact at this account",
        }

        supporting: list[dict] = []
        for r in group[1:]:
            role = _role_for_lead(r.to_dict())
            supporting.append({
                "email": r.lead_email,
                "name": r.lead_name,
                "title": r.title,
                "seniority_level": r.seniority_level,
                "fit_score": r.fit_score,
                "role": role,
                "why": _why_for_role(role),
            })

        # Recommended sequence — primary first, then a multi-thread story.
        sequence = [
            f"1. Open with {primary.lead_name or primary.lead_email} "
            f"({primary.title or 'primary contact'}) — strongest fit signal.",
        ]
        for i, s in enumerate(supporting[:2], start=2):
            ref_name = s.get("name") or s.get("email")
            sequence.append(
                f"{i}. After first reply, multi-thread to "
                f"{ref_name} ({s.get('title') or 'supporting contact'}) — "
                f"{s.get('why')}."
            )
        if len(supporting) >= 3:
            sequence.append(
                f"{len(sequence)+1}. {len(supporting)-2} additional contacts at "
                "the account available for follow-up if first thread cools."
            )

        # Pull account-level signals from the primary lead's payload list
        # (all leads in the group share account-level signals).
        signals = primary.signals

        play_id = primary.play_id  # already assigned per-lead by plays.assign_plays

        plays.append(AccountPlay(
            account_id=acc,
            company=primary.company,
            industry=None,
            company_size_band=None,
            outbound_vertical=None,
            rep_id=rep_id,
            rep_name=rep_name,
            primary_lead=primary_d,
            supporting_leads=supporting,
            signals=signals,
            play_id=play_id,
            sequence=sequence,
        ))

    # Sort: highest primary fit score first.
    plays.sort(key=lambda p: p.primary_lead["fit_score"], reverse=True)
    return plays


def attach_account_metadata(plays: list[AccountPlay],
                            leads_with_attrs: list[dict]) -> None:
    """
    Backfill industry / company_size_band / outbound_vertical onto each
    AccountPlay from the enriched leads. Mutates plays in-place.
    """
    by_acc: dict[str, dict] = {}
    for l in leads_with_attrs:
        acc = l.get("account_id")
        if not acc:
            continue
        # First lead at the account wins (fields are account-stable).
        by_acc.setdefault(acc, {
            "industry": l.get("industry"),
            "company_size_band": l.get("company_size_band"),
            "outbound_vertical": l.get("outbound_vertical"),
        })
    for p in plays:
        meta = by_acc.get(p.account_id) or {}
        p.industry = meta.get("industry")
        p.company_size_band = meta.get("company_size_band")
        p.outbound_vertical = meta.get("outbound_vertical")
