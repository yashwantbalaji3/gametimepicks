import unittest
from pipeline.daily.build_mixed_sport_cards import _tier, _am_to_dec, _dec_to_am


class TestMixedCards(unittest.TestCase):
    def test_tier_buckets_by_combined_odds(self):
        self.assertEqual(_tier(120), "Low")
        self.assertEqual(_tier(150), "Low")
        self.assertEqual(_tier(300), "Medium")
        self.assertEqual(_tier(700), "High")
        self.assertEqual(_tier(1500), "Longshot")

    def test_combined_odds_math_roundtrip(self):
        # -270 (1.370) × +101 (2.010) = 2.754 → ~+175
        dec = _am_to_dec(-270) * _am_to_dec(101)
        self.assertAlmostEqual(dec, 2.754, places=2)
        self.assertEqual(_dec_to_am(dec), 175)


class TestSettledGuardrails(unittest.TestCase):
    """June-12 settled-data guardrails for suggested-card legs (see
    docs/methodology/june12-model-learning-notes.md)."""

    def test_overprojected_over_markets_excluded(self):
        from pipeline.daily.build_mixed_sport_cards import leg_passes_settled_guardrails
        self.assertFalse(leg_passes_settled_guardrails({"market": "batter_total_bases", "side": "Over", "edgePct": 5}))
        self.assertFalse(leg_passes_settled_guardrails({"market": "pitcher_strikeouts", "side": "Over", "edgePct": 5}))
        # Unders on those markets settled fine (54.5% / 51.1%) — still allowed.
        self.assertTrue(leg_passes_settled_guardrails({"market": "batter_total_bases", "side": "Under", "edgePct": 5}))
        self.assertTrue(leg_passes_settled_guardrails({"market": "pitcher_strikeouts", "side": "Under", "edgePct": 5}))

    def test_outsized_edges_excluded(self):
        from pipeline.daily.build_mixed_sport_cards import leg_passes_settled_guardrails
        self.assertFalse(leg_passes_settled_guardrails({"market": "batter_hits", "side": "Over", "edgePct": 25.6}))
        self.assertFalse(leg_passes_settled_guardrails({"market": "batter_hits", "side": "Over", "edgePct": -22}))
        self.assertTrue(leg_passes_settled_guardrails({"market": "batter_hits", "side": "Over", "edgePct": 12.4}))
