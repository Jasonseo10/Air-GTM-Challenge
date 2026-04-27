"""
Unit tests for src/outbound/feedback.py.

Focus: weight refit math (lift, EMA blending, sample-size gating),
promotion (versioned + pointer), rep affinity aggregation.
"""

import csv
import json
import tempfile
import unittest
from pathlib import Path

from src.outbound.feedback import (
    refit_weights, apply_updates, compute_rep_affinity,
    promote_new_rules, load_dispositions,
)


def _rules() -> dict:
    return {
        "version": 1,
        "rules": [
            {"id": "good_signal", "description": "x", "field": "x",
             "op": "equals", "value": True, "points": 10},
            {"id": "noise_signal", "description": "y", "field": "y",
             "op": "equals", "value": True, "points": 10},
            {"id": "tiny_sample", "description": "z", "field": "z",
             "op": "equals", "value": True, "points": 10},
        ],
        "tiers": {"hot": 30, "warm": 15, "cool": 5},
    }


def _scored(rule_to_emails: dict[str, list[str]]) -> list[dict]:
    """Build leads_scored where each email matches a given rule_id list."""
    by_email: dict[str, list[str]] = {}
    for rule_id, emails in rule_to_emails.items():
        for e in emails:
            by_email.setdefault(e, []).append(rule_id)
    return [
        {"email": e, "outbound_matched_rule_ids": rules}
        for e, rules in by_email.items()
    ]


def _disp(email: str, outcome: str, rep_id: str = "r1") -> dict:
    return {
        "lead_email": email, "account_id": "acc", "rep_id": rep_id,
        "outcome": outcome, "days_to_outcome": 10,
        "reason": "", "acv_usd": 50000 if outcome == "closed_won" else 0,
        "won_date": "",
    }


class TestRefitWeights(unittest.TestCase):
    def test_high_lift_rule_increases_weight(self):
        # good_signal matches 10 leads, 8 won; baseline = 8/12 ~ 67%; rule = 80% → lift > 1
        emails_good = [f"good{i}@x.com" for i in range(10)]
        emails_other = [f"oth{i}@x.com" for i in range(2)]
        leads = _scored({
            "good_signal": emails_good,
            "noise_signal": emails_good[:5] + emails_other,
        })
        # 8 wins among good_signal, 0 wins among other
        dispositions = (
            [_disp(e, "closed_won") for e in emails_good[:8]] +
            [_disp(e, "closed_lost") for e in emails_good[8:]] +
            [_disp(e, "no_response") for e in emails_other]
        )
        updates = refit_weights(_rules(), leads, dispositions, min_sample=5)
        good = next(u for u in updates if u.rule_id == "good_signal")
        self.assertTrue(good.sufficient_evidence)
        self.assertGreater(good.lift, 1.0)
        self.assertGreaterEqual(good.new_weight, good.old_weight)

    def test_low_lift_rule_decreases_weight(self):
        emails_bad = [f"bad{i}@x.com" for i in range(10)]
        emails_other = [f"oth{i}@x.com" for i in range(10)]
        leads = _scored({
            "noise_signal": emails_bad,
            "good_signal": emails_other,
        })
        # bad: 1 win out of 10; other: 9 wins out of 10 → bad's lift < 1
        dispositions = (
            [_disp(e, "closed_won") for e in emails_bad[:1]] +
            [_disp(e, "closed_lost") for e in emails_bad[1:]] +
            [_disp(e, "closed_won") for e in emails_other[:9]] +
            [_disp(e, "closed_lost") for e in emails_other[9:]]
        )
        updates = refit_weights(_rules(), leads, dispositions, min_sample=5)
        bad = next(u for u in updates if u.rule_id == "noise_signal")
        self.assertTrue(bad.sufficient_evidence)
        self.assertLess(bad.lift, 1.0)
        self.assertLessEqual(bad.new_weight, bad.old_weight)

    def test_insufficient_evidence_keeps_weight(self):
        emails = ["one@x.com", "two@x.com"]
        leads = _scored({"tiny_sample": emails})
        dispositions = [_disp(emails[0], "closed_won"),
                        _disp(emails[1], "closed_lost")]
        updates = refit_weights(_rules(), leads, dispositions, min_sample=8)
        tiny = next(u for u in updates if u.rule_id == "tiny_sample")
        self.assertFalse(tiny.sufficient_evidence)
        self.assertEqual(tiny.new_weight, tiny.old_weight)

    def test_apply_updates_leaves_insufficient_unchanged(self):
        emails = ["a@x.com", "b@x.com"]
        leads = _scored({"tiny_sample": emails})
        dispositions = [_disp(emails[0], "closed_won"),
                        _disp(emails[1], "closed_lost")]
        updates = refit_weights(_rules(), leads, dispositions, min_sample=8)
        new = apply_updates(_rules(), updates)
        original_pts = next(r["points"] for r in _rules()["rules"]
                            if r["id"] == "tiny_sample")
        new_pts = next(r["points"] for r in new["rules"]
                       if r["id"] == "tiny_sample")
        self.assertEqual(new_pts, original_pts)


class TestRepAffinity(unittest.TestCase):
    def test_rep_affinity_buckets_by_vertical_and_seniority(self):
        leads = [
            {"email": "a@x.com", "outbound_vertical": "DTC", "seniority_level": "VP"},
            {"email": "b@x.com", "outbound_vertical": "DTC", "seniority_level": "VP"},
            {"email": "c@x.com", "outbound_vertical": "Sports", "seniority_level": "Director"},
        ]
        dispositions = [
            _disp("a@x.com", "closed_won", "rep1"),
            _disp("b@x.com", "closed_lost", "rep1"),
            _disp("c@x.com", "closed_won", "rep2"),
        ]
        aff = compute_rep_affinity(dispositions, leads)
        self.assertAlmostEqual(aff["rep1"]["DTC"]["VP"]["win_rate"], 0.5)
        self.assertEqual(aff["rep2"]["Sports"]["Director"]["won_n"], 1)
        self.assertEqual(aff["rep2"]["Sports"]["Director"]["avg_acv"], 50000)


class TestPromotion(unittest.TestCase):
    def test_promote_writes_versioned_file_and_updates_pointer(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            rules_dir = tmp / "config"
            rules_dir.mkdir()
            initial = {
                "version": 1,
                "rules": [{"id": "x", "field": "x", "op": "equals",
                           "value": True, "points": 5}],
                "tiers": {"hot": 5, "warm": 3, "cool": 1},
            }
            (rules_dir / "outbound_scoring_rules.json").write_text(
                json.dumps(initial), encoding="utf-8")
            pointer = rules_dir / "outbound_scoring_rules.pointer.json"
            pointer.write_text(json.dumps({
                "active_version": "config/outbound_scoring_rules.json",
                "history": [],
            }), encoding="utf-8")

            new = dict(initial)
            new["version"] = 2
            new["rules"] = [dict(initial["rules"][0])]
            new["rules"][0]["points"] = 8

            rel = promote_new_rules(new, pointer, rules_dir,
                                    promoted_by="test", note="bumped")
            self.assertEqual(rel, "config/outbound_scoring_rules.v2.json")
            written = json.loads(
                (rules_dir / "outbound_scoring_rules.v2.json")
                .read_text(encoding="utf-8")
            )
            self.assertEqual(written["rules"][0]["points"], 8)
            updated_pointer = json.loads(pointer.read_text(encoding="utf-8"))
            self.assertEqual(updated_pointer["active_version"],
                             "config/outbound_scoring_rules.v2.json")
            self.assertEqual(len(updated_pointer["history"]), 1)


class TestDispositionLoading(unittest.TestCase):
    def test_load_dispositions_coerces_numeric(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "d.csv"
            with open(p, "w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=[
                    "lead_email", "account_id", "rep_id", "outcome",
                    "days_to_outcome", "reason", "acv_usd", "won_date",
                ])
                w.writeheader()
                w.writerow({
                    "lead_email": "x@y.com", "account_id": "y.com",
                    "rep_id": "r1", "outcome": "closed_won",
                    "days_to_outcome": "23", "reason": "good fit",
                    "acv_usd": "50000", "won_date": "2026-01-01",
                })
            rows = load_dispositions(p)
            self.assertEqual(rows[0]["days_to_outcome"], 23)
            self.assertEqual(rows[0]["acv_usd"], 50000)


if __name__ == "__main__":
    unittest.main()
