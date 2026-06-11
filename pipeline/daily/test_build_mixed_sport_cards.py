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
