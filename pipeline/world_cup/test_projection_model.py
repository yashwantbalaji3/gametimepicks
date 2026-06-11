import unittest
from pipeline.world_cup.projection_model import (
    project_match, TeamForm, poisson_hda, poisson_over_under,
)


class TestProjectionModel(unittest.TestCase):
    def test_hda_sums_to_one(self):
        ph, pd, pa = poisson_hda(1.6, 1.0)
        self.assertAlmostEqual(ph + pd + pa, 1.0, places=6)
        self.assertGreater(ph, pa)  # higher home expectation → home favored

    def test_over_under_sums_to_one(self):
        o, u = poisson_over_under(2.7, 2.5)
        self.assertAlmostEqual(o + u, 1.0, places=6)
        self.assertGreater(o, 0.5)  # 2.7 expected vs 2.5 line → over leans

    def test_no_form_gates_projection(self):
        r = project_match((0.67, 0.21, 0.12), TeamForm(None, None, 0), TeamForm(None, None, 0))
        self.assertIsNone(r["moneyline"])  # no independent evidence → not a projection
        self.assertIsNone(r["confidence"])

    def test_zero_sample_gates(self):
        r = project_match((0.5, 0.27, 0.23), TeamForm(1.5, 1.0, 0), TeamForm(1.0, 1.2, 0))
        self.assertIsNone(r["moneyline"])  # sample 0 → weight 0 → gated

    def test_form_moves_probabilities_but_anchored(self):
        market = (0.67, 0.21, 0.12)
        r = project_match(market, TeamForm(1.9, 0.8, 7), TeamForm(0.8, 1.6, 7), total_line=2.5, market_over=0.44)
        ml = r["moneyline"]
        self.assertAlmostEqual(ml["home"] + ml["draw"] + ml["away"], 1.0, places=6)
        # anchored: never more than the cap (0.35) away from market on the blend
        self.assertLessEqual(abs(ml["home"] - market[0]), 0.35)
        self.assertEqual(r["confidence"], "Low")  # never High without xG/bigger sample
        self.assertIn("total", r)

    def test_confidence_capped_low_and_sample_warning(self):
        r = project_match((0.5, 0.27, 0.23), TeamForm(1.5, 1.0, 3), TeamForm(1.2, 1.3, 3))
        self.assertEqual(r["confidence"], "Low")
        self.assertTrue(r["sampleSizeWarning"])  # min sample 3 < 5

    def test_draw_is_modeled(self):
        r = project_match((0.4, 0.3, 0.3), TeamForm(1.2, 1.1, 6), TeamForm(1.1, 1.2, 6))
        self.assertIn("draw", r["moneyline"])
        self.assertGreater(r["moneyline"]["draw"], 0.0)


if __name__ == "__main__":
    unittest.main()
