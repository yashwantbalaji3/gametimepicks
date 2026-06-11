import unittest
from pipeline.world_cup.projection_model import (
    project_match, TeamForm, poisson_hda, poisson_over_under,
    model_weight, classify_projection,
    UNDERDOG_MARKET_FLOOR, MIN_SAMPLE_ACTIVE, OPENING_DAY_MAX_WEIGHT,
)
from pipeline.world_cup.build_features import is_underdog_side, build_match_features


class TestPoisson(unittest.TestCase):
    def test_hda_sums_to_one(self):
        ph, pd, pa = poisson_hda(1.6, 1.0)
        self.assertAlmostEqual(ph + pd + pa, 1.0, places=6)
        self.assertGreater(ph, pa)

    def test_over_under_sums_to_one(self):
        o, u = poisson_over_under(2.7, 2.5)
        self.assertAlmostEqual(o + u, 1.0, places=6)
        self.assertGreater(o, 0.5)


class TestWeighting(unittest.TestCase):
    def test_market_anchored_weight_is_capped_low(self):
        # Even at a healthy sample, the independent-model weight stays small and the market keeps
        # the large majority — the opening-day anchoring fix.
        w = model_weight(TeamForm(1.5, 1.0, 8), TeamForm(1.0, 1.2, 8), opponent_adjusted=False)
        self.assertLessEqual(w, OPENING_DAY_MAX_WEIGHT)
        self.assertLess(w, 0.15)  # opponent-unadjusted → further reduced
        self.assertGreater(w, 0.0)

    def test_opponent_adjusted_gets_more_weight_than_raw(self):
        raw = model_weight(TeamForm(1.5, 1.0, 8), TeamForm(1.0, 1.2, 8), opponent_adjusted=False)
        adj = model_weight(TeamForm(1.5, 1.0, 8), TeamForm(1.0, 1.2, 8), opponent_adjusted=True)
        self.assertGreater(adj, raw)

    def test_zero_sample_zero_weight(self):
        self.assertEqual(model_weight(TeamForm(1.5, 1.0, 0), TeamForm(1.0, 1.0, 3), opponent_adjusted=True), 0.0)

    def test_market_movement_is_small(self):
        # With heavier anchoring, the blended prob barely moves off market on opening day.
        market = (0.67, 0.21, 0.12)
        r = project_match(market, TeamForm(1.9, 0.8, 8), TeamForm(0.8, 1.6, 8), opponent_adjusted=False)
        self.assertLess(abs(r["moneyline"]["home"] - market[0]), 0.06)


class TestUnderdogDetection(unittest.TestCase):
    def test_plus_money_is_underdog(self):
        self.assertTrue(is_underdog_side(185, 0.34))
        self.assertTrue(is_underdog_side(750, 0.11))

    def test_clear_favorite_is_not_underdog(self):
        self.assertFalse(is_underdog_side(-235, 0.67))


class TestClassifier(unittest.TestCase):
    def test_south_africa_scenario_gated_market_sanity(self):
        # The exact red-flag case: 11.2% market underdog must be gated, never active/public.
        status, public, _ = classify_projection(
            market_prob=0.112, model_prob=0.13, market_type="moneyline_90",
            sample_min=8, opponent_adjusted=False, is_underdog=True,
        )
        self.assertEqual(status, "gated_market_sanity")
        self.assertFalse(public)

    def test_thin_sample_gated(self):
        status, public, _ = classify_projection(
            market_prob=0.45, model_prob=0.52, market_type="moneyline_90",
            sample_min=MIN_SAMPLE_ACTIVE - 1, opponent_adjusted=True, is_underdog=False,
        )
        self.assertEqual(status, "gated_sample_size")
        self.assertFalse(public)

    def test_underdog_lift_without_opponent_adjustment_gated(self):
        # A meaningful underdog lift with no opponent adjustment is gated_missing_features.
        status, public, _ = classify_projection(
            market_prob=0.30, model_prob=0.36, market_type="moneyline_90",
            sample_min=8, opponent_adjusted=False, is_underdog=True,
        )
        self.assertEqual(status, "gated_missing_features")
        self.assertFalse(public)

    def test_small_edge_research_only(self):
        status, public, _ = classify_projection(
            market_prob=0.50, model_prob=0.51, market_type="moneyline_90",
            sample_min=8, opponent_adjusted=True, is_underdog=False,
        )
        self.assertEqual(status, "research_only")
        self.assertFalse(public)

    def test_active_requires_all_gates(self):
        # Favorite, healthy sample, opponent-adjusted, meaningful edge → active + public.
        status, public, _ = classify_projection(
            market_prob=0.50, model_prob=0.55, market_type="moneyline_90",
            sample_min=8, opponent_adjusted=True, is_underdog=False,
        )
        self.assertEqual(status, "active")
        self.assertTrue(public)

    def test_total_active_with_smaller_edge(self):
        # Totals have a lower active edge threshold than ML.
        status, public, _ = classify_projection(
            market_prob=0.50, model_prob=0.527, market_type="match_total_goals",
            sample_min=8, opponent_adjusted=True, is_underdog=False,
        )
        self.assertEqual(status, "active")
        self.assertTrue(public)


class TestNoEcho(unittest.TestCase):
    def test_no_form_no_pick(self):
        r = project_match((0.67, 0.21, 0.12), TeamForm(None, None, 0), TeamForm(None, None, 0))
        self.assertIsNone(r["moneyline"])

    def test_draw_modeled(self):
        r = project_match((0.4, 0.3, 0.3), TeamForm(1.2, 1.1, 6), TeamForm(1.1, 1.2, 6))
        self.assertIn("draw", r["moneyline"])
        self.assertGreater(r["moneyline"]["draw"], 0.0)


class TestFeatures(unittest.TestCase):
    def test_features_flag_missing_rank_and_opponent_adjustment(self):
        mf = build_match_features(
            home_team="Mexico", away_team="South Africa",
            home_form={"goalsFor90": 1.8, "goalsAgainst90": 0.9, "played": 8},
            away_form={"goalsFor90": 1.0, "goalsAgainst90": 1.4, "played": 7},
            market={"result": {"homeWinPct": 0.67, "drawPct": 0.21, "awayWinPct": 0.11},
                    "totals": {"line": 2.5, "overPct": 0.44}},
        )
        self.assertFalse(mf.rank_available)
        self.assertFalse(mf.opponent_adjusted)
        self.assertEqual(mf.sample_min, 7)
        self.assertIsNone(mf.home.fifa_rank)  # never faked


if __name__ == "__main__":
    unittest.main()
