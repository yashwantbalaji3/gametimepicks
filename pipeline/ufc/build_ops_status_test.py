"""ops-status stage derivation + fail-closed tests."""
from __future__ import annotations

import json, tempfile, unittest
from pathlib import Path
from unittest import mock
import pipeline.ufc.build_ops_status as ops


class OpsStatusTests(unittest.TestCase):
    def _run(self, readiness, backtest=None, sched=None):
        with tempfile.TemporaryDirectory() as d:
            dd = Path(d)
            (dd / "readiness-latest.json").write_text(json.dumps(readiness))
            (dd / "backtest-summary-latest.json").write_text(json.dumps(backtest or {"rowCount": 0}))
            (dd / "schedule-latest.json").write_text(json.dumps(sched or {"eventName": "UFC X", "fightCount": 7, "isRealCard": True}))
            (dd / "odds-latest.json").write_text("{}"); (dd / "results-latest.json").write_text("{}")
            with mock.patch.object(ops, "DATA", dd):
                return ops.build()

    def test_stage1_internal_when_no_backtest(self):
        r = self._run({"scheduleReady": True, "oddsReady": True, "fighterStatsReady": True,
                       "gradingReady": True, "backtestReady": False, "parlaySimReady": False,
                       "projectionsReady": False, "propMarketsAvailable": {"method": False}})
        self.assertEqual(r["currentStage"], 1)
        self.assertFalse(r["publicPicksVisible"])
        self.assertTrue(any("clean graded rows" in b for b in r["blockers"]))

    def test_stage2_when_backtest_ready(self):
        r = self._run({"scheduleReady": True, "oddsReady": True, "fighterStatsReady": True,
                       "gradingReady": True, "backtestReady": True, "parlaySimReady": False,
                       "projectionsReady": True, "propMarketsAvailable": {"method": False}},
                      backtest={"rowCount": 160, "marketImpliedBrier": 0.21})
        self.assertEqual(r["currentStage"], 2)
        self.assertTrue(r["publicPicksVisible"])

    def test_props_blocker_present(self):
        r = self._run({"scheduleReady": True, "oddsReady": True, "fighterStatsReady": True,
                       "gradingReady": True, "backtestReady": False, "propMarketsAvailable": {"method": False, "distance": False, "rounds": False}})
        self.assertTrue(any("prop markets" in b for b in r["blockers"]))
        self.assertEqual(r["targetRowsForPublicMoneyline"], 150)


if __name__ == "__main__":
    unittest.main()
