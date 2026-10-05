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
    """Grading = a real results corpus AND our model's winner forecasts settled in the Forecast
    Ledger. A market-price grade never counts, and grading never unlocks public picks."""

    def setUp(self):
        import tempfile
        from pathlib import Path
        self._d = tempfile.TemporaryDirectory()
        self.res = Path(self._d.name) / "results.json"
        self.ledger = Path(self._d.name) / "ufc.jsonl"
        self.summary = Path(self._d.name) / "summary.json"

    def tearDown(self):
        self._d.cleanup()

    def _write_results(self, *, final=1519, latest=None, license_="GPL-3.0"):
        import json
        from datetime import datetime, timezone
        latest = latest or datetime.now(timezone.utc).date().isoformat()
        self.res.write_text(json.dumps({"provider": "greco1899_ufcstats_csv", "sourceLicense": license_,
                                        "eventCount": 126, "finalBoutCount": final, "latestEventDate": latest}))

    @staticmethod
    def _row(**over):
        from datetime import datetime, timedelta, timezone
        now = datetime.now(timezone.utc)
        row = {"family": "ufc_winner", "competition": "UFC Test", "probability": 0.61, "probabilityType": "MODEL",
               "publishedAt": (now - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "market": {"impliedProbability": 0.55, "capturedAt": (now - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ")},
               "settlement": {"state": "SETTLED", "finality": "CANONICAL",
                              "settledAt": (now - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")}}
        for k, v in over.items():
            if isinstance(v, dict) and isinstance(row.get(k), dict):
                row[k] = {**row[k], **v}
            else:
                row[k] = v
        return row

    def _write_ledger(self, rows, recon=None):
        import json
        self.ledger.write_text("".join(json.dumps(r) + "\n" for r in rows))
        self.summary.write_text(json.dumps({"reconciliation": recon if recon is not None else
                                            [{"slateDate": "2026-01-01", "frozen": len(rows), "graded": len(rows),
                                              "void": 0, "pending": 0, "pendingBoutIds": [], "reconciles": True}]}))

    def _settle(self):
        from pipeline.ufc.build_readiness import forecast_settlement_gate
        return forecast_settlement_gate(self.ledger, self.summary)

    def test_results_corpus_valid(self):
        from pipeline.ufc.build_readiness import results_corpus_gate
        self._write_results()
        self.assertTrue(results_corpus_gate(self.res)[0])

    def test_too_few_final_bouts_fails_closed(self):
        from pipeline.ufc.build_readiness import results_corpus_gate
        self._write_results(final=10)
        self.assertFalse(results_corpus_gate(self.res)[0])

    def test_stale_results_fail_closed(self):
        from pipeline.ufc.build_readiness import results_corpus_gate
        self._write_results(latest="2024-01-01")
        self.assertFalse(results_corpus_gate(self.res)[0])

    def test_settled_model_winner_rows_flip_forecastSettlementReady(self):
        self._write_ledger([self._row(), self._row()])
        ok, st = self._settle()
        self.assertTrue(ok)
        self.assertEqual(st["settledCount"], 2)

    def test_no_ledger_fails_closed(self):
        self.assertFalse(self._settle()[0])

    def test_only_pending_and_void_rows_fail_closed(self):
        # PENDING and VOID are never misses, and never evidence that grading works.
        self._write_ledger([self._row(settlement={"state": "PENDING"}), self._row(settlement={"state": "VOID"})])
        ok, st = self._settle()
        self.assertFalse(ok)
        self.assertEqual((st["pendingCount"], st["voidCount"]), (1, 1))

    def test_a_market_probability_is_not_a_model_grade(self):
        self._write_ledger([self._row(probabilityType="MARKET")])
        self.assertFalse(self._settle()[0])

    def test_a_forecast_published_after_settlement_does_not_count(self):
        self._write_ledger([self._row(publishedAt="2099-01-01T00:00:00Z")])
        self.assertFalse(self._settle()[0])

    def test_non_canonical_finality_does_not_count(self):
        self._write_ledger([self._row(settlement={"finality": "PROVISIONAL"})])
        self.assertFalse(self._settle()[0])

    def test_method_and_round_rows_never_count(self):
        self._write_ledger([self._row(family="ufc_method"), self._row(family="ufc_round")])
        self.assertFalse(self._settle()[0])

    def test_stale_settlement_fails_closed(self):
        self._write_ledger([self._row(publishedAt="2024-01-01T00:00:00Z",
                                      settlement={"settledAt": "2024-01-02T00:00:00Z"})])
        self.assertFalse(self._settle()[0])

    def test_a_card_that_does_not_reconcile_fails_closed(self):
        self._write_ledger([self._row()], recon=[{"slateDate": "2026-01-01", "frozen": 3, "graded": 1, "void": 0,
                                                  "pending": 1, "reconciles": False}])
        self.assertFalse(self._settle()[0])

    def test_a_long_pending_bout_is_named_not_blocking(self):
        # A replaced or cancelled bout stays PENDING (never a miss); readiness names it by id.
        self._write_ledger([self._row()], recon=[{"slateDate": "2020-01-01", "frozen": 2, "graded": 1, "void": 0,
                                                  "pending": 1, "pendingBoutIds": ["2020-01-01:a|b"], "reconciles": True}])
        ok, st = self._settle()
        self.assertTrue(ok)
        self.assertEqual(st["stalePendingBoutIds"], ["2020-01-01:a|b"])

    def test_market_capture_is_reported_and_never_grades(self):
        from pipeline.ufc.build_readiness import market_capture_gate, derive_readiness
        self._write_ledger([self._row(), self._row(market={"impliedProbability": None})])
        ok, st = market_capture_gate(self.ledger)
        self.assertFalse(ok)
        self.assertEqual((st["rows"], st["withMarket"]), (2, 1))
        r = derive_readiness({"scheduleReady": True, "oddsReady": True, "fighterStatsReady": True,
                              "resultsCorpusReady": True, "forecastSettlementReady": False,
                              "marketCaptureReady": True})
        self.assertFalse(r["gradingReady"])
        self.assertEqual(r["publicLevel"], "projections-internal")

    def test_grading_needs_both_corpus_and_settlement(self):
        from pipeline.ufc.build_readiness import derive_readiness
        base = {"scheduleReady": True, "oddsReady": True, "fighterStatsReady": True}
        for corpus, settled in ((True, False), (False, True)):
            r = derive_readiness({**base, "resultsCorpusReady": corpus, "forecastSettlementReady": settled})
            self.assertFalse(r["gradingReady"])
        r = derive_readiness({**base, "resultsCorpusReady": True, "forecastSettlementReady": True})
        self.assertTrue(r["gradingReady"])
        self.assertFalse(r["productSettlementReady"])

    def test_the_retired_moneyline_file_is_not_read(self):
        from pathlib import Path
        src = Path(__file__).with_name("build_readiness.py").read_text()
        self.assertNotIn('"graded-moneylines-latest.json"', src, "the retired market-price grade must not feed readiness")

    def test_grading_plus_stats_odds_still_lock_projections(self):
        from pipeline.ufc.build_readiness import derive_readiness
        r = derive_readiness({"scheduleReady": True, "oddsReady": True,
                              "fighterStatsReady": True, "gradingReady": True})
        self.assertEqual(r["publicLevel"], "grading-internal")
        self.assertFalse(r["projectionsReady"])
        self.assertFalse(r["parlayReady"])


if __name__ == "__main__":
    unittest.main()
