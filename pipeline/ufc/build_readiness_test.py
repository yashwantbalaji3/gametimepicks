"""Fail-closed tests for UFC readiness derivation (mirrors ufc-types.test.mjs)."""
from __future__ import annotations

import unittest

from pipeline.ufc.build_readiness import derive_readiness, CURRENT_GATES

ALL = {"scheduleReady": True, "oddsReady": True, "fighterStatsReady": True,
       "gradingReady": True, "backtestReady": True}


class UfcReadinessFailClosedTests(unittest.TestCase):
    def test_current_state_is_schedule_only(self):
        r = derive_readiness(CURRENT_GATES)
        self.assertEqual(r["publicLevel"], "schedule-only")
        self.assertFalse(r["projectionsReady"])
        self.assertFalse(r["parlayReady"])

    def test_schedule_only_no_picks(self):
        r = derive_readiness({"scheduleReady": True})
        self.assertFalse(r["projectionsReady"])
        self.assertFalse(r["parlayReady"])

    def test_odds_only_stays_internal(self):
        r = derive_readiness({"scheduleReady": True, "oddsReady": True})
        self.assertEqual(r["publicLevel"], "odds-internal")
        self.assertFalse(r["projectionsReady"])

    def test_stats_without_grading_no_public_projections(self):
        r = derive_readiness({**ALL, "gradingReady": False, "backtestReady": False})
        self.assertEqual(r["publicLevel"], "projections-internal")
        self.assertFalse(r["projectionsReady"])

    def test_grading_without_backtest_no_parlays(self):
        r = derive_readiness({**ALL, "backtestReady": False})
        self.assertTrue(r["projectionsReady"])
        self.assertFalse(r["parlayReady"])

    def test_all_gates_unlock_parlays(self):
        r = derive_readiness(ALL)
        self.assertEqual(r["publicLevel"], "parlays-public")
        self.assertTrue(r["projectionsReady"])
        self.assertTrue(r["parlayReady"])

    def test_missing_odds_blocks_everything(self):
        r = derive_readiness({**ALL, "oddsReady": False})
        self.assertFalse(r["projectionsReady"])
        self.assertFalse(r["parlayReady"])
        self.assertIn("odds provider not connected (Odds API MMA)", r["blockers"])


if __name__ == "__main__":
    unittest.main()
