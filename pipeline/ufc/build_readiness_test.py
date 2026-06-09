"""Fail-closed tests for UFC readiness derivation (mirrors ufc-types.test.mjs)."""
from __future__ import annotations

import unittest

from pipeline.ufc.build_readiness import derive_readiness, CURRENT_GATES

ALL = {"scheduleReady": True, "oddsReady": True, "fighterStatsReady": True,
       "gradingReady": True, "backtestReady": True, "parlaySimReady": True}


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

    def test_grading_without_backtest_stays_internal(self):
        # Grading connected but NO backtest → grading-internal; public picks locked.
        r = derive_readiness({**ALL, "backtestReady": False})
        self.assertEqual(r["publicLevel"], "grading-internal")
        self.assertFalse(r["projectionsReady"])
        self.assertFalse(r["parlayReady"])

    def test_all_gates_incl_parlaysim_unlock_parlays(self):
        r = derive_readiness(ALL)
        self.assertEqual(r["publicLevel"], "parlays-public")
        self.assertTrue(r["projectionsReady"])
        self.assertTrue(r["parlayReady"])

    def test_backtest_without_parlaysim_unlocks_projections_only(self):
        # all gates EXCEPT parlay simulation → projections public, parlays LOCKED.
        r = derive_readiness({**ALL, "parlaySimReady": False})
        self.assertEqual(r["publicLevel"], "projections-public")
        self.assertTrue(r["projectionsReady"])
        self.assertFalse(r["parlayReady"])

    def test_missing_odds_blocks_everything(self):
        r = derive_readiness({**ALL, "oddsReady": False})
        self.assertFalse(r["projectionsReady"])
        self.assertFalse(r["parlayReady"])
        self.assertIn("odds provider not connected (Odds API MMA)", r["blockers"])


class UfcOddsGateTests(unittest.TestCase):
    """oddsReady is derived from a REAL, fresh odds artifact; odds alone never
    unlock projections/parlays."""

    def setUp(self):
        import tempfile
        from pathlib import Path
        self._tmp = tempfile.NamedTemporaryFile(suffix=".json", delete=False)
        self._tmp.close()
        self._path = Path(self._tmp.name)

    def tearDown(self):
        import os
        try: os.unlink(self._tmp.name)
        except OSError: pass

    def _write(self, **over):
        import json
        from datetime import datetime, timezone
        base = {"generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "oddsReady": True, "eventCount": 1, "marketCount": 2, "bouts": [{}, {}]}
        base.update(over)
        self._path.write_text(json.dumps(base))

    def test_fresh_real_odds_flips_oddsReady(self):
        from pipeline.ufc.build_readiness import odds_gate
        self._write()
        ready, status = odds_gate(self._path)
        self.assertTrue(ready)
        self.assertTrue(status["oddsReady"])

    def test_odds_alone_does_not_unlock_picks(self):
        from pipeline.ufc.build_readiness import derive_readiness
        r = derive_readiness({"scheduleReady": True, "oddsReady": True})
        self.assertEqual(r["publicLevel"], "odds-internal")
        self.assertFalse(r["projectionsReady"])
        self.assertFalse(r["parlayReady"])

    def test_stale_odds_not_ready(self):
        from pipeline.ufc.build_readiness import odds_gate
        from datetime import datetime, timezone, timedelta
        self._write(generatedAt=(datetime.now(timezone.utc) - timedelta(hours=200)).isoformat(timespec="seconds"))
        ready, status = odds_gate(self._path)
        self.assertFalse(ready)

    def test_missing_odds_artifact_fail_closed(self):
        import os
        from pipeline.ufc.build_readiness import odds_gate
        os.unlink(self._tmp.name)
        ready, status = odds_gate(self._path)
        self.assertFalse(ready)

    def test_zero_bout_odds_not_ready(self):
        from pipeline.ufc.build_readiness import odds_gate
        self._write(oddsReady=False, marketCount=0, bouts=[])
        ready, status = odds_gate(self._path)
        self.assertFalse(ready)


class UfcFighterStatsGateTests(unittest.TestCase):
    """fighterStatsReady from the real derived artifact; never unlocks picks."""

    def setUp(self):
        import tempfile
        from pathlib import Path
        self._tmp = tempfile.NamedTemporaryFile(suffix=".json", delete=False)
        self._tmp.close()
        self._path = Path(self._tmp.name)

    def tearDown(self):
        import os
        try: os.unlink(self._tmp.name)
        except OSError: pass

    def _write(self, **over):
        import json
        from datetime import datetime, timezone
        base = {"provider": "greco1899_ufcstats_csv", "sourceLicense": "GPL-3.0",
                "fighterCount": 2695, "fightCount": 17402,
                "latestFightDate": datetime.now(timezone.utc).date().isoformat(),
                "fighters": [{"rates": {"statRounds": 5}} for _ in range(10)]}
        base.update(over)
        self._path.write_text(json.dumps(base))

    def test_fresh_valid_flips_fighterStatsReady(self):
        from pipeline.ufc.build_readiness import fighter_stats_gate
        self._write()
        ready, status = fighter_stats_gate(self._path)
        self.assertTrue(ready)
        self.assertEqual(status["fighterCount"], 2695)

    def test_too_few_fighters_fails_closed(self):
        from pipeline.ufc.build_readiness import fighter_stats_gate
        self._write(fighterCount=50)
        self.assertFalse(fighter_stats_gate(self._path)[0])

    def test_missing_license_metadata_fails_closed(self):
        from pipeline.ufc.build_readiness import fighter_stats_gate
        self._write(sourceLicense=None)
        self.assertFalse(fighter_stats_gate(self._path)[0])

    def test_stale_fighter_data_fails_closed(self):
        from pipeline.ufc.build_readiness import fighter_stats_gate
        self._write(latestFightDate="2024-01-01")
        self.assertFalse(fighter_stats_gate(self._path)[0])

    def test_missing_artifact_fails_closed(self):
        import os
        from pipeline.ufc.build_readiness import fighter_stats_gate
        os.unlink(self._tmp.name)
        self.assertFalse(fighter_stats_gate(self._path)[0])

    def test_stats_plus_odds_still_lock_projections(self):
        from pipeline.ufc.build_readiness import derive_readiness
        r = derive_readiness({"scheduleReady": True, "oddsReady": True, "fighterStatsReady": True})
        self.assertEqual(r["publicLevel"], "projections-internal")
        self.assertFalse(r["projectionsReady"])
        self.assertFalse(r["parlayReady"])


class UfcGradingGateTests(unittest.TestCase):
    """gradingReady from real results + a working grader; never unlocks public picks."""

    def setUp(self):
        import tempfile
        from pathlib import Path
        self._d = tempfile.TemporaryDirectory()
        self.res = Path(self._d.name) / "results.json"
        self.grd = Path(self._d.name) / "graded.json"

    def tearDown(self):
        self._d.cleanup()

    def _write(self, *, final=1519, latest=None, license_="GPL-3.0", decisive=1):
        import json
        from datetime import datetime, timezone
        latest = latest or datetime.now(timezone.utc).date().isoformat()
        self.res.write_text(json.dumps({"provider": "greco1899_ufcstats_csv", "sourceLicense": license_,
                                        "eventCount": 126, "finalBoutCount": final, "latestEventDate": latest}))
        self.grd.write_text(json.dumps({"tally": {"win": decisive, "loss": 1, "pending": 8}}))

    def test_valid_results_and_grader_flip_gradingReady(self):
        from pipeline.ufc.build_readiness import grading_gate
        self._write()
        self.assertTrue(grading_gate(self.res, self.grd)[0])

    def test_too_few_final_bouts_fails_closed(self):
        from pipeline.ufc.build_readiness import grading_gate
        self._write(final=10)
        self.assertFalse(grading_gate(self.res, self.grd)[0])

    def test_stale_results_fail_closed(self):
        from pipeline.ufc.build_readiness import grading_gate
        self._write(latest="2024-01-01")
        self.assertFalse(grading_gate(self.res, self.grd)[0])

    def test_no_grader_artifact_fails_closed(self):
        from pipeline.ufc.build_readiness import grading_gate
        self._write()
        self.grd.unlink()
        self.assertFalse(grading_gate(self.res, self.grd)[0])

    def test_grader_no_decisive_fails_closed(self):
        from pipeline.ufc.build_readiness import grading_gate
        self._write(decisive=0)
        # tally win=0,loss=1 → decisive=1 still; force both 0
        self.grd.write_text('{"tally":{"win":0,"loss":0,"pending":8}}')
        self.assertFalse(grading_gate(self.res, self.grd)[0])

    def test_grading_plus_stats_odds_still_lock_projections(self):
        from pipeline.ufc.build_readiness import derive_readiness
        r = derive_readiness({"scheduleReady": True, "oddsReady": True,
                              "fighterStatsReady": True, "gradingReady": True})
        self.assertEqual(r["publicLevel"], "grading-internal")
        self.assertFalse(r["projectionsReady"])
        self.assertFalse(r["parlayReady"])


if __name__ == "__main__":
    unittest.main()
