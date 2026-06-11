import unittest
from pipeline.world_cup.soccer_policy import parlay_eligibility, risk_tier_for_odds


class TestSoccerPolicy(unittest.TestCase):
    def test_favorite_draw_low_edge_eligible_hybrid(self):
        r = parlay_eligibility(market="moneyline_90", edge=0.013, market_prob=0.35,
                               american_odds=170, sample_min=8, is_underdog=False)
        self.assertTrue(r["parlayEligible"])  # 1.3% clears the hybrid fav/draw threshold

    def test_extreme_underdog_never_eligible(self):
        r = parlay_eligibility(market="moneyline_90", edge=0.03, market_prob=0.11,
                               american_odds=750, sample_min=8, is_underdog=True)
        self.assertFalse(r["parlayEligible"])
        self.assertEqual(r["riskTier"], "Longshot")

    def test_moderate_underdog_needs_bigger_edge_and_not_low(self):
        r = parlay_eligibility(market="moneyline_90", edge=0.03, market_prob=0.20,
                               american_odds=240, sample_min=8, is_underdog=True)
        self.assertTrue(r["parlayEligible"])
        self.assertIn(r["riskTier"], ("High", "Longshot"))  # never Low/Medium

    def test_total_goals_hybrid_threshold(self):
        self.assertTrue(parlay_eligibility(market="match_total_goals", edge=0.02, market_prob=0.43,
                                            american_odds=125, sample_min=8, is_underdog=False)["parlayEligible"])
        self.assertFalse(parlay_eligibility(market="match_total_goals", edge=0.006, market_prob=0.44,
                                            american_odds=120, sample_min=8, is_underdog=False)["parlayEligible"])

    def test_corner_tiered_sample_edge(self):
        self.assertTrue(parlay_eligibility(market="match_total_corners", edge=0.015, market_prob=0.5,
                                           american_odds=-118, corner_sample=10, is_underdog=False)["parlayEligible"])
        self.assertFalse(parlay_eligibility(market="match_total_corners", edge=0.01, market_prob=0.5,
                                            american_odds=-118, corner_sample=3, is_underdog=False)["parlayEligible"])

    def test_anytime_goalscorer_never_low(self):
        r = parlay_eligibility(market="anytime_goalscorer", edge=0.05, market_prob=0.3,
                               american_odds=-200, lineup_ok=True, role_ok=True, is_underdog=False)
        self.assertNotEqual(r["riskTier"], "Low")
        self.assertFalse(r["bankBuilderEligible"])

    def test_player_props_gated_without_lineup(self):
        self.assertFalse(parlay_eligibility(market="player_shots", edge=0.05, market_prob=0.5,
                                            american_odds=-110, lineup_ok=False)["parlayEligible"])

    def test_bank_builder_low_team_market_only(self):
        r = parlay_eligibility(market="match_total_goals", edge=0.03, market_prob=0.5,
                               american_odds=-160, sample_min=8, is_underdog=False)
        self.assertEqual(r["riskTier"], "Low")
        self.assertTrue(r["bankBuilderEligible"])

    def test_risk_tier_from_odds(self):
        self.assertEqual(risk_tier_for_odds(-200), "Low")
        self.assertEqual(risk_tier_for_odds(100), "Medium")
        self.assertEqual(risk_tier_for_odds(250), "High")
        self.assertEqual(risk_tier_for_odds(600), "Longshot")
