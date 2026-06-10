"""Tests for build_game_outlook — pure market-implied derivation (no model)."""
from __future__ import annotations

import sys, types, unittest
sys.modules.setdefault("requests", types.ModuleType("requests"))

from pipeline.build_game_outlook import derive_game  # noqa: E402


class GameOutlookTests(unittest.TestCase):
    def test_implied_win_prob_devigged_sums_to_one(self):
        o = derive_game({"moneyline": {"home": -130, "away": 110},
                         "spread": {"home": -2.5}, "total": {"line": 214.5}})
        self.assertAlmostEqual(o["impliedWinProbHome"] + o["impliedWinProbAway"], 1.0, places=3)
        self.assertGreater(o["impliedWinProbHome"], o["impliedWinProbAway"])  # home favored

    def test_team_totals_from_total_and_spread(self):
        o = derive_game({"moneyline": {"home": -130, "away": 110},
                         "spread": {"home": -2.5}, "total": {"line": 214.5}})
        self.assertEqual(o["teamTotalHome"], 108.5)
        self.assertEqual(o["teamTotalAway"], 106.0)
        self.assertEqual(o["teamTotalHome"] + o["teamTotalAway"], o["total"])

    def test_missing_flags(self):
        o = derive_game({"moneyline": None, "spread": {}, "total": {}})
        self.assertIn("moneyline", o["missing"])
        self.assertIn("total", o["missing"])
        self.assertIsNone(o["impliedWinProbHome"])

    def test_no_fabrication_when_partial(self):
        o = derive_game({"moneyline": {"home": -150, "away": 130}, "spread": {}, "total": {}})
        self.assertIsNotNone(o["impliedWinProbHome"])     # has ML
        self.assertIsNone(o["teamTotalHome"])             # no total/spread -> no fabricated totals


if __name__ == "__main__":
    unittest.main()
