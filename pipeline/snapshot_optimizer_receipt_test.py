"""The optimizer snapshot's generation receipt — the producer evidence an empty day rests on.

An empty optimizer snapshot used to be indistinguishable from a broken one. These lock the receipt's
classification (one closed `outcome` per run, one `emptyReason` per empty public section), that the
diagnostics never change a slip, that a run that raises leaves a failure record and NO snapshot, and
that a later completed run supersedes the failure record.

Run: python -m pipeline.snapshot_optimizer_receipt_test
"""
from __future__ import annotations

import json
import os
import tempfile
import unittest
from unittest import mock

import pipeline.snapshot_optimizer as so
from pipeline.parlay_optimizer import PUBLIC_RISK_SECTION_ORDER, generate_public_risk_sections


def _ev(*, present=True, parsed=True, games=1, leans=10, loaded=None):
    return {
        "board": "x", "present": present, "parsed": parsed, "date": "2026-10-10", "generatedAt": "t",
        "scheduleAvailable": games > 0, "propsAvailable": leans > 0, "pendingReason": None if games else "no_events",
        "games": games if parsed else None, "leans": leans if parsed else None,
        "leansLoaded": leans if loaded is None else loaded,
    }


def _diag(min_legs, eligible, candidates=0):
    return {"minLegs": min_legs, "maxLegs": min_legs + 1, "maxLegsPerGame": 2,
            "eligibleLegs": {"all": eligible, "nba": 0, "mlb": eligible},
            "candidates": {"all": candidates, "nba": 0, "mlb": candidates}}


MIN_LEGS = {"low": 2, "medium": 3, "high": 4, "longshot": 5}
EMPTY_SECTIONS = {k: {"all": [], "nba": [], "mlb": [], "multi": []} for k in PUBLIC_RISK_SECTION_ORDER}


def _legs(n, games):
    return [{"gameId": f"g{i % games}"} for i in range(n)] if games else []


def _receipt(*, inputs, legs, sections=EMPTY_SECTIONS, diagnostics=None):
    return so.build_generation_receipt(
        date="2026-10-10", generated_at="2026-10-10T09:27:47+00:00", inputs=inputs,
        leg_pool=legs, public_sections=sections,
        diagnostics=diagnostics if diagnostics is not None else {k: _diag(MIN_LEGS[k], 0) for k in MIN_LEGS},
    )


class ReceiptClassification(unittest.TestCase):
    def test_single_game_slate_is_no_eligible_slips_with_structural_reasons(self):
        # The 2026-10-08 / 2026-10-10 shape: one MLB game, 35-37 legs, 0-1 low-eligible legs.
        diag = {"low": _diag(2, 1), "medium": _diag(3, 1), "high": _diag(4, 1), "longshot": _diag(5, 1)}
        r = _receipt(inputs={"nba": _ev(present=False, parsed=False, games=0, leans=0), "mlb": _ev(games=1, leans=41)},
                     legs=_legs(37, 1), diagnostics=diag)
        self.assertEqual(r["status"], "completed")
        self.assertEqual((r["receiptKind"], r["producer"]), ("PRODUCER", "pipeline.snapshot_optimizer"))
        self.assertEqual(r["outcome"], "NO_ELIGIBLE_SLIPS")
        self.assertEqual(r["legPool"], {"totalLegs": 37, "distinctGames": 1})
        self.assertEqual(r["publicSections"]["low"]["emptyReason"], "insufficient_eligible_legs")
        for k in ("medium", "high", "longshot"):  # min 3+ legs, at most 2 per game, 1 game
            self.assertEqual(r["publicSections"][k]["emptyReason"], "structurally_infeasible")

    def test_off_day_is_no_qualifying_games(self):
        r = _receipt(inputs={"nba": _ev(present=False, parsed=False, games=0, leans=0), "mlb": _ev(games=0, leans=0)}, legs=[])
        self.assertEqual(r["outcome"], "NO_QUALIFYING_GAMES")
        self.assertTrue(all(s["emptyReason"] == "no_leg_pool" for s in r["publicSections"].values()))

    def test_no_board_at_all_is_inputs_missing_not_an_empty_day(self):
        absent = _ev(present=False, parsed=False, games=0, leans=0)
        r = _receipt(inputs={"nba": absent, "mlb": absent}, legs=[])
        self.assertEqual(r["outcome"], "INPUTS_MISSING")

    def test_unparseable_board_is_inputs_unreadable(self):
        r = _receipt(inputs={"nba": _ev(present=False, parsed=False, games=0, leans=0),
                             "mlb": _ev(parsed=False, games=0, leans=0)}, legs=[])
        self.assertEqual(r["outcome"], "INPUTS_UNREADABLE")

    def test_games_without_props_is_an_input_gap_not_a_product_decision(self):
        r = _receipt(inputs={"nba": _ev(present=False, parsed=False, games=0, leans=0), "mlb": _ev(games=3, leans=0)}, legs=[])
        self.assertEqual(r["outcome"], "INPUTS_WITHOUT_PROPS")

    def test_feasible_section_with_enough_legs_but_no_slip_is_not_called_structural(self):
        diag = {k: _diag(MIN_LEGS[k], 30, candidates=0) for k in MIN_LEGS}
        diag["low"] = _diag(2, 30, candidates=12)
        r = _receipt(inputs={"mlb": _ev(games=4, leans=120)}, legs=_legs(120, 4), diagnostics=diag)
        self.assertEqual(r["outcome"], "NO_ELIGIBLE_SLIPS")
        self.assertEqual(r["publicSections"]["low"]["emptyReason"], "selector_dropped_all")
        self.assertEqual(r["publicSections"]["medium"]["emptyReason"], "no_priced_compatible_combination")

    def test_slips_built_counts_sport_cuts_not_the_all_view(self):
        sections = {k: {"all": [], "nba": [], "mlb": [], "multi": []} for k in PUBLIC_RISK_SECTION_ORDER}
        sections["low"] = {"all": [object()], "nba": [], "mlb": [object()], "multi": []}
        r = _receipt(inputs={"mlb": _ev(games=2, leans=60)}, legs=_legs(60, 2), sections=sections)
        self.assertEqual(r["outcome"], "SLIPS_BUILT")
        self.assertEqual(r["publicSlips"], 1)
        self.assertIsNone(r["publicSections"]["low"]["emptyReason"])
        self.assertIsNotNone(r["publicSections"]["medium"]["emptyReason"])

    def test_every_outcome_and_reason_is_in_the_closed_vocabulary(self):
        for args in (
            dict(inputs={"mlb": _ev(games=0, leans=0)}, legs=[]),
            dict(inputs={"mlb": _ev(present=False, parsed=False, games=0, leans=0)}, legs=[]),
            dict(inputs={"mlb": _ev(games=1, leans=41)}, legs=_legs(37, 1)),
        ):
            r = _receipt(**args)
            self.assertIn(r["outcome"], so.OUTCOMES)
            for s in r["publicSections"].values():
                self.assertIn(s["emptyReason"], so.SECTION_EMPTY_REASONS)


class BoardEvidence(unittest.TestCase):
    def test_reads_the_board_the_loader_reads_and_reports_unreadable(self):
        with tempfile.TemporaryDirectory() as tmp:
            good, bad = os.path.join(tmp, "good.json"), os.path.join(tmp, "bad.json")
            with open(good, "w") as f:
                json.dump({"generatedFor": "2026-10-09", "generatedAt": "g", "scheduleAvailable": False,
                           "propsAvailable": False, "pendingReason": "no_events", "games": [], "leans": []}, f)
            with open(bad, "w") as f:
                f.write("{ truncated")
            with mock.patch.dict(so.BOARD_PATHS, {"mlb": lambda d: good, "nba": lambda d: bad}):
                ev = so._board_evidence("mlb", "2026-10-09", 0)
                self.assertEqual((ev["present"], ev["parsed"], ev["games"], ev["pendingReason"]), (True, True, 0, "no_events"))
                ev = so._board_evidence("nba", "2026-10-09", 0)
                self.assertEqual((ev["present"], ev["parsed"]), (True, False))


class DiagnosticsAreObservabilityOnly(unittest.TestCase):
    def test_diagnostics_do_not_change_the_slips(self):
        legs = []
        for g in range(3):
            for p in range(6):
                legs.append({
                    "sport": "mlb", "leanId": f"l{g}{p}", "gameId": f"g{g}", "playerId": g * 10 + p,
                    "playerName": f"P{g}{p}", "team": "AAA", "opponent": "BBB", "market": "batter_hits",
                    "marketLabel": "Hits", "side": "Over", "line": 0.5, "projection": 1.1, "edgePct": 8.0,
                    "confidence": "High", "bookmaker": "dk", "oddsForSide": -160 + p * 40,
                    "recent10Count": 10, "recentSeries": [1] * 10, "recentGames": [],
                })
        plain = generate_public_risk_sections(legs, date="2026-05-28")
        diag: dict = {}
        with_diag = generate_public_risk_sections(legs, date="2026-05-28", diagnostics=diag)
        ids = lambda out: {k: {s: [x.slipId for x in v] for s, v in b.items()} for k, b in out.items()}
        self.assertEqual(ids(plain), ids(with_diag))
        self.assertGreater(sum(len(v) for b in plain.values() for v in b.values()), 0, "the fixture must build slips, or equality is vacuous")
        self.assertEqual(sorted(diag), sorted(PUBLIC_RISK_SECTION_ORDER))
        for k, d in diag.items():
            self.assertEqual(d["maxLegsPerGame"], 2)
            self.assertGreaterEqual(d["eligibleLegs"]["all"], d["eligibleLegs"]["mlb"])


class FailedRunLeavesAFailureRecordAndNoSnapshot(unittest.TestCase):
    def test_raise_then_recover(self):
        with tempfile.TemporaryDirectory() as tmp:
            out, fail = os.path.join(tmp, "optimizer"), os.path.join(tmp, "optimizer", "run-failures")
            with mock.patch.object(so, "OUT_DIR", out), mock.patch.object(so, "FAILURE_DIR", fail):
                with mock.patch.object(so, "build_optimizer_snapshot", side_effect=RuntimeError("boom")):
                    with self.assertRaises(RuntimeError):
                        so.main(["--date", "2026-10-11"])
                self.assertFalse(os.path.exists(os.path.join(out, "2026-10-11.json")), "a failed run must not write a snapshot")
                with open(os.path.join(fail, "2026-10-11.json"), encoding="utf-8") as f:
                    rec = json.load(f)
                self.assertEqual((rec["status"], rec["date"], rec["errorType"]), ("failed", "2026-10-11", "RuntimeError"))

                ok = {"date": "2026-10-11", "generatedAt": "t", "totalSlips": 0,
                      "generationReceipt": {"outcome": "NO_QUALIFYING_GAMES"}}
                with mock.patch.object(so, "build_optimizer_snapshot", return_value=ok):
                    self.assertEqual(so.main(["--date", "2026-10-11"]), 0)
                self.assertTrue(os.path.exists(os.path.join(out, "2026-10-11.json")))
                self.assertFalse(os.path.exists(os.path.join(fail, "2026-10-11.json")), "a completed run supersedes the failure record")
                self.assertEqual([f for f in os.listdir(out) if f.endswith(".tmp")], [], "the atomic write leaves no temp file")


if __name__ == "__main__":
    unittest.main()
