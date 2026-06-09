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
