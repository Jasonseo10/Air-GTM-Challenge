"""
Unit tests for src/outbound/match.py.

Focus: the fit-scoring components produce expected directional movements
(competitor experience helps, vertical match helps, ramping rep is
dampened, etc.). We assert ranges and orderings, not exact point values,
so the tests stay stable as scoring tunings evolve.
"""

import unittest
from src.outbound.match import (
    score_rep_for_lead, match_lead, route_all, _verticals_overlap,
    _expected_acv_band, _lead_domain_tags,
)
from src.outbound.schema import Rep


def _rep(**overrides) -> Rep:
    base = dict(
        rep_id="r1", name="Test Rep", segment="Mid-Market",
        verticals=["DTC", "Food & Beverage"],
        persona_strength=["VP Marketing", "Director Marketing"],
        deal_size_band_usd=[25000, 80000],
        languages=["en"], timezone="UTC",
        tenure_months=24, capacity_max=20, capacity_current=8,
        prior_companies=[], prior_roles=[],
        domain_expertise_tags=["DTC-food"],
        selling_style="consultative-multithread",
        buyer_archetype_affinity=["operator-IC"],
        competitor_replace_experience={"Bynder": 6, "Brandfolder": 2},
        past_wins=[{"vertical": "DTC", "persona": "VP Marketing", "acv_usd": 40000}],
        pursuit_stage_strength={},
        ramp_status=None, needs_assist=False,
    )
    base.update(overrides)
    return Rep(**base)


def _lead(**overrides) -> dict:
    base = dict(
        email="x@y.com", title="VP Marketing", seniority_level="VP",
        outbound_vertical="DTC", company_size_min=200,
        signal_competitor_dam=None, persona_archetype="operator-IC",
        outbound_tier="Warm", outbound_score=40,
        signals=[], account_id="y.com",
    )
    base.update(overrides)
    return base


class TestHardFit(unittest.TestCase):
    def test_vertical_match_beats_no_match(self):
        rep = _rep()
        match = score_rep_for_lead(rep, _lead(outbound_vertical="DTC"), {})
        no_match = score_rep_for_lead(rep, _lead(outbound_vertical="Healthcare"), {})
        self.assertGreater(match["fit_score"], no_match["fit_score"])

    def test_vertical_adjacent_partial_credit(self):
        rep = _rep()
        adjacent = score_rep_for_lead(rep, _lead(outbound_vertical="E-commerce"), {})
        unrelated = score_rep_for_lead(rep, _lead(outbound_vertical="Healthcare"), {})
        self.assertGreater(adjacent["fit_score"], unrelated["fit_score"])

    def test_deal_band_fit_uses_company_size(self):
        rep = _rep()
        fits = score_rep_for_lead(rep, _lead(company_size_min=200), {})
        too_big = score_rep_for_lead(rep, _lead(company_size_min=10000), {})
        self.assertGreater(fits["fit_score"], too_big["fit_score"])


class TestPersonaFit(unittest.TestCase):
    def test_direct_persona_strength_match(self):
        rep = _rep()
        match = score_rep_for_lead(rep, _lead(title="VP Marketing"), {})
        no_match = score_rep_for_lead(rep, _lead(title="Software Engineer"), {})
        self.assertGreater(match["fit_score"], no_match["fit_score"])

    def test_buyer_archetype_match(self):
        rep = _rep(buyer_archetype_affinity=["exec-sponsor"])
        match = score_rep_for_lead(rep, _lead(persona_archetype="exec-sponsor"), {})
        no_match = score_rep_for_lead(rep, _lead(persona_archetype="founder-owner"), {})
        self.assertGreater(match["fit_score"], no_match["fit_score"])


class TestQualitativeFit(unittest.TestCase):
    def test_competitor_replace_specialist_boost(self):
        # Rep has 6 Bynder displacements (>=5 → "specialist")
        rep = _rep(competitor_replace_experience={"Bynder": 6})
        with_signal = _lead(signal_competitor_dam="Bynder")
        no_signal = _lead(signal_competitor_dam=None)
        self.assertGreater(
            score_rep_for_lead(rep, with_signal, {})["fit_score"],
            score_rep_for_lead(rep, no_signal, {})["fit_score"],
        )

    def test_competitor_unfamiliar_no_boost(self):
        rep = _rep(competitor_replace_experience={})
        same = score_rep_for_lead(rep, _lead(signal_competitor_dam="Frontify"), {})
        empty = score_rep_for_lead(rep, _lead(signal_competitor_dam=None), {})
        # No experience with Frontify → no qualitative boost from this factor
        self.assertEqual(
            sum(p["points"] for p in same["fit_breakdown"]
                if p["factor"].startswith("competitor")),
            0,
        )

    def test_past_wins_lift(self):
        rep_with = _rep(past_wins=[
            {"vertical": "DTC", "persona": "VP Marketing", "acv_usd": 40000},
            {"vertical": "DTC", "persona": "VP Marketing", "acv_usd": 50000},
        ])
        rep_without = _rep(past_wins=[])
        lead = _lead(outbound_vertical="DTC", title="VP Marketing")
        self.assertGreater(
            score_rep_for_lead(rep_with, lead, {})["fit_score"],
            score_rep_for_lead(rep_without, lead, {})["fit_score"],
        )


class TestCapacityAndRamping(unittest.TestCase):
    def test_overcap_penalty(self):
        normal = _rep(capacity_current=8, capacity_max=20)
        full = _rep(capacity_current=20, capacity_max=20)
        lead = _lead()
        self.assertGreater(
            score_rep_for_lead(normal, lead, {"max_capacity_utilization_pct": 95})["fit_score"],
            score_rep_for_lead(full, lead, {"max_capacity_utilization_pct": 95})["fit_score"],
        )

    def test_ramping_rep_is_dampened(self):
        senior = _rep(rep_id="senior", ramp_status=None,
                      capacity_current=8, capacity_max=20)
        rookie = _rep(rep_id="rookie", ramp_status="ramping",
                      capacity_current=4, capacity_max=20,
                      past_wins=[])
        lead = _lead()
        # Both have plenty of capacity; rookie should still lose due to dampener.
        s = score_rep_for_lead(senior, lead, {})["fit_score"]
        r = score_rep_for_lead(rookie, lead, {})["fit_score"]
        self.assertGreater(s, r)


class TestRouting(unittest.TestCase):
    def test_route_all_skips_low_tier(self):
        leads = [
            _lead(email="a@y.com", outbound_tier="Hot"),
            _lead(email="b@y.com", outbound_tier="Low"),
            _lead(email="c@y.com", outbound_tier="Cool"),
        ]
        routed = route_all(leads, [_rep()], {})
        emails = {r.lead_email for r in routed}
        self.assertEqual(emails, {"a@y.com", "c@y.com"})

    def test_match_lead_picks_highest_fit(self):
        rep_strong = _rep(rep_id="strong",
                          competitor_replace_experience={"Bynder": 8})
        rep_weak = _rep(rep_id="weak",
                        verticals=["Fintech"],  # vertical mismatch
                        competitor_replace_experience={})
        lead = _lead(signal_competitor_dam="Bynder")
        match = match_lead([rep_strong, rep_weak], lead, {})
        self.assertEqual(match["rep_id"], "strong")


class TestHelpers(unittest.TestCase):
    def test_verticals_overlap_known_neighbors(self):
        self.assertTrue(_verticals_overlap(["DTC"], "E-commerce"))
        self.assertTrue(_verticals_overlap(["Media"], "Sports"))
        self.assertFalse(_verticals_overlap(["DTC"], "Fintech"))

    def test_expected_acv_band_monotonic(self):
        self.assertLess(
            _expected_acv_band({"company_size_min": 30}),
            _expected_acv_band({"company_size_min": 5000}),
        )

    def test_domain_tags_for_dtc(self):
        tags = _lead_domain_tags(_lead(outbound_vertical="DTC"))
        self.assertIn("shopify-ecosystem", tags)


if __name__ == "__main__":
    unittest.main()
