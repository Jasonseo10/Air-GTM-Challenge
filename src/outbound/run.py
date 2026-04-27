"""
Outbound pipeline orchestration.

Reads the existing clean_leads.json (output of the round-1 product-led
pipeline), attaches outbound-only signals + persona flags, scores against
the outbound rule set, matches to reps, bundles into account-level plays,
and writes the routing artifacts.

Note: this pipeline does NOT modify the existing clean_leads.json or any
output of the round-1 pipeline. All artifacts are written to output/
under outbound_* names.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from dataclasses import asdict
from pathlib import Path
from typing import Optional

from .signals import attach_outbound_attributes
from .outbound_score import load_active_rules, score_all
from .match import load_team, route_all
from .plays import load_plays, assign_plays
from .bundling import bundle_accounts, attach_account_metadata
from .feedback import (
    load_dispositions, refit_weights, apply_updates,
    compute_rep_affinity,
)


logger = logging.getLogger(__name__)


def run_routing(input_leads_path: Path,
                team_path: Path,
                pointer_path: Path,
                plays_path: Path,
                output_dir: Path) -> dict:
    """Score + match + bundle. Writes routing artifacts."""
    output_dir.mkdir(parents=True, exist_ok=True)

    leads = json.loads(input_leads_path.read_text(encoding="utf-8"))
    enriched, signals_by_account = attach_outbound_attributes(leads)

    rules, active_path = load_active_rules(pointer_path)
    scored = score_all(enriched, rules)

    reps, fairness = load_team(team_path)
    routed = route_all(scored, reps, fairness)

    plays = load_plays(plays_path)
    routed_dicts = assign_plays(routed, plays, reps)

    # Bundling needs the routed objects (not dicts) to keep types tight.
    account_plays = bundle_accounts(routed)
    attach_account_metadata(account_plays, scored)

    # Apply per-lead play_id back into the AccountPlay primary lead.
    play_by_email = {d["lead_email"]: d for d in routed_dicts}
    for ap in account_plays:
        primary_email = ap.primary_lead["email"]
        ap.play_id = play_by_email.get(primary_email, {}).get("play_id")

    # --- Write artifacts ---
    (output_dir / "routed_leads.json").write_text(
        json.dumps(routed_dicts, indent=2, default=str),
        encoding="utf-8",
    )
    (output_dir / "account_plays.json").write_text(
        json.dumps([ap.to_dict() for ap in account_plays], indent=2, default=str),
        encoding="utf-8",
    )
    (output_dir / "outbound_scored_leads.json").write_text(
        json.dumps(scored, indent=2, default=str),
        encoding="utf-8",
    )

    # Stats summary.
    tier_counts = {"Hot": 0, "Warm": 0, "Cool": 0, "Low": 0}
    for l in scored:
        tier_counts[l.get("outbound_tier", "Low")] = (
            tier_counts.get(l.get("outbound_tier", "Low"), 0) + 1
        )
    rep_load = {r.rep_id: 0 for r in reps}
    for r in routed:
        rep_load[r.rep_id] = rep_load.get(r.rep_id, 0) + 1

    return {
        "leads_in": len(leads),
        "leads_routed": len(routed),
        "accounts_bundled": len(account_plays),
        "active_rules_path": active_path,
        "tier_counts": tier_counts,
        "rep_load": rep_load,
    }


def run_feedback(input_leads_path: Path,
                 dispositions_path: Path,
                 team_path: Path,
                 pointer_path: Path,
                 output_dir: Path) -> dict:
    """Compute weight refit + rep affinity. Does NOT promote."""
    output_dir.mkdir(parents=True, exist_ok=True)

    leads = json.loads(input_leads_path.read_text(encoding="utf-8"))
    enriched, _ = attach_outbound_attributes(leads)
    rules, active_path = load_active_rules(pointer_path)
    scored = score_all(enriched, rules)

    dispositions = load_dispositions(dispositions_path)
    updates = refit_weights(rules, scored, dispositions)
    proposed_rules = apply_updates(rules, updates) if updates else None
    affinity = compute_rep_affinity(dispositions, scored)

    weight_doc = {
        "active_rules_path": active_path,
        "baseline_win_rate": (
            updates[0].baseline_win_rate if updates else 0.0
        ),
        "n_dispositions_terminal": sum(
            1 for d in dispositions
            if d.get("outcome") in {
                "closed_won", "closed_lost", "disqualified", "no_response"
            }
        ),
        "updates": [u.to_dict() for u in updates],
        "proposed_rules": proposed_rules,
    }
    (output_dir / "weight_updates.json").write_text(
        json.dumps(weight_doc, indent=2, default=str),
        encoding="utf-8",
    )
    (output_dir / "rep_affinity.json").write_text(
        json.dumps(affinity, indent=2, default=str),
        encoding="utf-8",
    )
    return {
        "n_updates": len(updates),
        "n_sufficient": sum(1 for u in updates if u.sufficient_evidence),
        "n_dispositions": len(dispositions),
        "active_rules_path": active_path,
    }


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Air outbound routing pipeline")
    parser.add_argument("--input", default="output/clean_leads.json",
                        help="Path to clean_leads.json from the round-1 pipeline")
    parser.add_argument("--team", default="config/sales_team.json")
    parser.add_argument("--pointer", default="config/outbound_scoring_rules.pointer.json")
    parser.add_argument("--plays", default="config/play_library.json")
    parser.add_argument("--dispositions", default="data/dispositions.csv")
    parser.add_argument("--output-dir", default="output")
    parser.add_argument("--mode", choices=["route", "feedback", "both"],
                        default="both",
                        help="route = score+match+bundle; feedback = refit+affinity")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    out_dir = Path(args.output_dir)
    if args.mode in ("route", "both"):
        stats = run_routing(
            input_leads_path=Path(args.input),
            team_path=Path(args.team),
            pointer_path=Path(args.pointer),
            plays_path=Path(args.plays),
            output_dir=out_dir,
        )
        print("Routing complete:")
        for k, v in stats.items():
            print(f"  {k}: {v}")

    if args.mode in ("feedback", "both"):
        stats = run_feedback(
            input_leads_path=Path(args.input),
            dispositions_path=Path(args.dispositions),
            team_path=Path(args.team),
            pointer_path=Path(args.pointer),
            output_dir=out_dir,
        )
        print("Feedback complete:")
        for k, v in stats.items():
            print(f"  {k}: {v}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
