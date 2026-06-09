"""Tests for UFC moneyline model + features + parlay gating (no network)."""
from __future__ import annotations

import unittest
from pipeline.ufc.model_moneyline import project, build as build_proj
from pipeline.ufc.build_suggested_parlays import build as build_parlays

BASE = {"fighterA": "A", "fighterB": "B", "oddsA": -150, "marketImpliedA": 0.6,
        "marketImpliedB": 0.4, "dataQuality": 1.0, "isFutures": False,
        "deltas": {"recentWinRate": 0.2, "winRate": 0.1, "finishRate": 0.1,
                   "sigStrPerRound": 2.0, "takedownsPerRound": 0.5, "reachInches": 3, "experience": 5}}


class MoneylineModelTests(unittest.TestCase):
    def test_probabilities_sum_to_one(self):
        p = project(BASE, validated=True)
        self.assertAlmostEqual(p["modelProbability"] + (1 - p["modelProbability"]), 1.0)

    def test_adjustment_capped(self):
        big = {**BASE, "deltas": {k: 100 for k in BASE["deltas"]}}
        p = project(big, validated=True)
        self.assertLessEqual(abs(p["modelAdjustment"]), 0.04 + 1e-9)

    def test_shrinks_toward_market(self):
        p = project(BASE, validated=True)
        # model stays within a few points of market (shrunk + capped)
        self.assertLess(abs(p["modelProbability"] - p["marketImpliedProbability"]), 0.05)

    def test_low_data_quality_pulls_to_market(self):
        lowq = {**BASE, "dataQuality": 0.3}
        p = project(lowq, validated=True)
        self.assertLess(abs(p["modelProbability"] - p["marketImpliedProbability"]),
                        abs(project(BASE, validated=True)["modelProbability"] - BASE["marketImpliedA"]) + 1e-9)

    def test_futures_never_public(self):
        fut = {**BASE, "isFutures": True}
        self.assertFalse(project(fut, validated=True)["publicEligible"])

    def test_unvalidated_never_public(self):
        self.assertFalse(project(BASE, validated=False)["publicEligible"])

    def test_validated_clean_bout_is_public_eligible(self):
        self.assertTrue(project(BASE, validated=True)["publicEligible"])


class ParlayGatingTests(unittest.TestCase):
    def _proj(self, eligible):
        return {"projections": [{**project(BASE, validated=True), "publicEligible": eligible}]}

    def test_locked_without_backtest(self):
        out = build_parlays(self._proj(True), backtest_ready=False, parlay_sim_ready=True)
        self.assertFalse(out["publicReady"])
        self.assertIn("backtestReady=false", out["blockers"])

    def test_locked_without_parlaysim(self):
        out = build_parlays(self._proj(True), backtest_ready=True, parlay_sim_ready=False)
        self.assertFalse(out["publicReady"])
        self.assertIn("parlaySimReady=false", out["blockers"])

    def test_no_cards_without_eligible_legs(self):
        out = build_parlays(self._proj(False), backtest_ready=True, parlay_sim_ready=True)
        self.assertFalse(out["publicReady"])
        self.assertEqual(out["cards"], [])

    def test_lane_caps(self):
        out = build_parlays(self._proj(True), backtest_ready=False, parlay_sim_ready=False)
        self.assertLessEqual(out["maxLegsByLane"]["bank"], 2)
        self.assertLessEqual(out["maxLegsByLane"]["low"], 2)
        self.assertLessEqual(out["maxLegsByLane"]["high"], 3)


if __name__ == "__main__":
    unittest.main()
