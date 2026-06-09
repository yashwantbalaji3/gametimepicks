"""Leakage-safe backtest dataset + calibration + gate tests (fixtures)."""
from __future__ import annotations

import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from pipeline.ufc.build_backtest_dataset import build as build_ds
from pipeline.ufc.backtest_moneyline_model import evaluate
from pipeline.ufc.build_readiness import backtest_gate, derive_readiness

RESULTS = {"results": [
    {"boutId": "b1", "eventName": "UFC X", "eventDate": "2026-05-01",
     "fighterA": "Alex Star", "fighterB": "Bob Foe", "winner": "Alex Star",
     "loser": "Bob Foe", "resultStatus": "final"},
]}


def _snap(dirp: Path, fetched: str, commence: str, fighters, source="mma_mixed_martial_arts"):
    (dirp / f"odds-{fetched.replace(':','-')}.json").write_text(json.dumps({
        "sportKey": source, "generatedAt": fetched,
        "bouts": [{"fighters": fighters, "commenceTime": commence, "bookmaker": "dk",
                   "sides": [{"name": fighters[0], "price": -150, "impliedProbability": 0.6},
                             {"name": fighters[1], "price": 130, "impliedProbability": 0.43}]}],
    }))


class BacktestDatasetTests(unittest.TestCase):
    def setUp(self):
        self._d = tempfile.TemporaryDirectory()
        self.snap = Path(self._d.name) / "snaps"; self.snap.mkdir()
        self.res = Path(self._d.name) / "results.json"; self.res.write_text(json.dumps(RESULTS))

    def tearDown(self):
        self._d.cleanup()

    def test_pregame_snapshot_with_result_makes_rows(self):
        _snap(self.snap, "2026-04-30T12:00:00+00:00", "2026-05-01T02:00:00+00:00", ["Alex Star", "Bob Foe"])
        ds = build_ds(self.snap, self.res)
        self.assertEqual(ds["rowCount"], 2)
        grades = {r["fighter"]: r["result"] for r in ds["rows"]}
        self.assertEqual(grades["Alex Star"], "win")
        self.assertEqual(grades["Bob Foe"], "loss")

    def test_post_commence_snapshot_excluded(self):
        _snap(self.snap, "2026-05-01T03:00:00+00:00", "2026-05-01T02:00:00+00:00", ["Alex Star", "Bob Foe"])
        ds = build_ds(self.snap, self.res)
        self.assertEqual(ds["rowCount"], 0)
        self.assertGreaterEqual(ds["excluded"]["post_commence"], 1)

    def test_no_result_excluded(self):
        _snap(self.snap, "2026-04-30T12:00:00+00:00", "2026-05-01T02:00:00+00:00", ["Future A", "Future B"])
        ds = build_ds(self.snap, self.res)
        self.assertEqual(ds["rowCount"], 0)
        self.assertGreaterEqual(ds["excluded"]["no_result"], 1)

    def test_unlicensed_source_excluded(self):
        _snap(self.snap, "2026-04-30T12:00:00+00:00", "2026-05-01T02:00:00+00:00", ["Alex Star", "Bob Foe"], source="betmma_tips")
        ds = build_ds(self.snap, self.res)
        self.assertEqual(ds["rowCount"], 0)
        self.assertGreaterEqual(ds["excluded"]["unlicensed"], 1)


class BacktestModelTests(unittest.TestCase):
    def test_zero_rows_holds(self):
        s = evaluate({"rows": [], "leakageFailures": 0})
        self.assertEqual(s["launchDecision"], "hold")
        self.assertIsNone(s["marketImpliedBrier"])

    def test_enough_rows_computes_brier_and_passes(self):
        rows = [{"impliedProbability": 0.6, "result": "win"} for _ in range(160)]
        s = evaluate({"rows": rows, "leakageFailures": 0})
        self.assertIsNotNone(s["marketImpliedBrier"])
        self.assertEqual(s["launchDecision"], "pass")
        self.assertFalse(s["modelValidated"])  # stats model still not validated


class BacktestGateTests(unittest.TestCase):
    def setUp(self):
        self._t = tempfile.NamedTemporaryFile(suffix=".json", delete=False); self._t.close()
        self.p = Path(self._t.name)

    def tearDown(self):
        import os
        try: os.unlink(self._t.name)
        except OSError: pass

    def test_insufficient_rows_fails_closed(self):
        self.p.write_text(json.dumps({"rowCount": 3, "launchDecision": "hold"}))
        self.assertFalse(backtest_gate(self.p)[0])

    def test_valid_pass_flips_backtestReady(self):
        self.p.write_text(json.dumps({"rowCount": 200, "launchDecision": "pass", "marketImpliedBrier": 0.21}))
        self.assertTrue(backtest_gate(self.p)[0])

    def test_backtest_insufficient_keeps_projections_locked(self):
        r = derive_readiness({"scheduleReady": True, "oddsReady": True, "fighterStatsReady": True,
                              "gradingReady": True, "backtestReady": False})
        self.assertFalse(r["projectionsReady"])

    def test_parlay_locked_without_parlaysim(self):
        r = derive_readiness({"scheduleReady": True, "oddsReady": True, "fighterStatsReady": True,
                              "gradingReady": True, "backtestReady": True, "parlaySimReady": False})
        self.assertTrue(r["projectionsReady"])
        self.assertFalse(r["parlayReady"])


if __name__ == "__main__":
    unittest.main()
