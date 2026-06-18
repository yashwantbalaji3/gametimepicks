"""Unit tests for the active Dual Bank Builder settlement grading rules (pure, no network)."""
import unittest

from pipeline.settle_active_dual_bank_builder import grade_over_under, grade_double_chance, lane_result


class TestGrading(unittest.TestCase):
    def test_strikeouts_over(self):
        # Over 3.5: 4 K wins, 3 K loses.
        self.assertEqual(grade_over_under(4, "over", 3.5), "won")
        self.assertEqual(grade_over_under(3, "over", 3.5), "lost")

    def test_strikeouts_under(self):
        # Under 4.5: 1 K wins, 5 K loses; exactly 4 wins.
        self.assertEqual(grade_over_under(1, "under", 4.5), "won")
        self.assertEqual(grade_over_under(5, "under", 4.5), "lost")
        self.assertEqual(grade_over_under(4, "under", 4.5), "won")

    def test_double_chance(self):
        # Colombia 3–1 → win → won; Ghana 1–0 → win → won; a draw → won; a loss → lost.
        self.assertEqual(grade_double_chance(3, 1), "won")
        self.assertEqual(grade_double_chance(1, 0), "won")
        self.assertEqual(grade_double_chance(1, 1), "won")   # draw covered
        self.assertEqual(grade_double_chance(0, 2), "lost")

    def test_lane_result(self):
        won = {"settlement": {"result": "won"}}
        lost = {"settlement": {"result": "lost"}}
        void = {"settlement": {"result": "void"}}
        pend = {"settlement": {"result": "pending"}}
        self.assertEqual(lane_result([won, won]), "won")
        self.assertEqual(lane_result([won, lost]), "lost")     # any loss → lane lost
        self.assertEqual(lane_result([won, void]), "won")      # void drops, remaining won
        self.assertEqual(lane_result([void, void]), "push")
        self.assertEqual(lane_result([won, pend]), "pending")


if __name__ == "__main__":
    unittest.main()
