"""Guards for the preseason rehearsal runner.

The interesting assertions are the NO_GO paths. A rehearsal that reports GO whenever it cannot check
something is worse than no rehearsal — it manufactures the evidence a promotion decision would rest
on. So every stage is exercised in its failing form, and an unrunnable check blocks.
"""
from __future__ import annotations

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from pipeline.nba.rehearsal import (
    devig_two_way,
    implied_probability,
    run_rehearsal,
)

DATE = "2026-10-14"
TIPOFF = "2026-10-15T00:30:00Z"
CAPTURED = "2026-10-14T14:00:00Z"

GAME_ROW = {
    "gameId": "401900001",
    "date": DATE,
    "tipoff": "8:30 PM ET",
    "tipoffIso": TIPOFF,
    "capturedAt": CAPTURED,
    "researchEligible": True,
    "homeTeamAbbr": "SA",
    "awayTeamAbbr": "NY",
    "status": "Scheduled",
}

MARKETS = {
    "date": DATE,
    "games": {
        "401900001": {
            "gameId": "401900001",
            "moneyline": {"home": -135, "away": 114},
            "spread": {"home": -2.5, "away": 2.5},
            "total": {"line": 216.5, "over": -112, "under": -108},
        }
    },
}

SETTLED = {
    "date": DATE,
    "gameId": "401900001",
    "playerId": 3147657,
    "market": "3PM",
    "line": 2.5,
    "bookmaker": "fanduel",
    "team": "NY",
    "opponent": "SA",
    "result": "win",
    "settlementSource": "espn",
    "settledAt": "2026-10-15T06:00:00Z",
    "tipoffIso": TIPOFF,
}


def ok_identity(_command):
    return True, ""


def failing_identity(_command):
    return False, "AMBIGUOUS_MATCHUP"


def unavailable_identity(_command):
    raise FileNotFoundError("npx")


class Fixture:
    """A minimal on-disk slate. Written to a temp dir — the real artifacts are never touched."""

    def __init__(self, root: Path, *, games=None, markets=MARKETS, settled=(SETTLED,)):
        self.root = root
        board_dir = root / "app" / "public" / "data" / "boards"
        board_dir.mkdir(parents=True)
        board = {"generatedFor": DATE, "games": [GAME_ROW] if games is None else games}
        (board_dir / f"{DATE}.json").write_text(json.dumps(board))

        if markets is not None:
            market_dir = root / "app" / "public" / "data" / "nba" / "game-markets"
            market_dir.mkdir(parents=True)
            (market_dir / f"{DATE}.json").write_text(json.dumps(markets))

        val = root / "pipeline" / "validation"
        val.mkdir(parents=True)
        (val / "settled_leans.jsonl").write_text(
            "\n".join(json.dumps(r) for r in settled) + ("\n" if settled else "")
        )


def status_of(report: dict, stage: str) -> str:
    return next(s["status"] for s in report["stages"] if s["stage"] == stage)


class DevigTests(unittest.TestCase):
    def test_implied_probability(self):
        self.assertAlmostEqual(implied_probability(-135), 135 / 235, places=6)
        self.assertAlmostEqual(implied_probability(114), 100 / 214, places=6)

    def test_zero_is_not_a_price(self):
        self.assertIsNone(implied_probability(0))
        self.assertIsNone(implied_probability(None))
        self.assertIsNone(implied_probability("even"))

    def test_devig_normalizes_to_one(self):
        home, away = devig_two_way(-135, 114)
        self.assertAlmostEqual(home + away, 1.0, places=9)
        self.assertGreater(home, away)
        # The raw implieds overround; de-vigging must move both, not just rescale one.
        self.assertLess(home, implied_probability(-135))

    def test_one_sided_market_has_no_measurable_vig(self):
        self.assertIsNone(devig_two_way(-135, None))
        self.assertIsNone(devig_two_way(None, None))


class RehearsalTests(unittest.TestCase):
    def _run(self, *, identity=ok_identity, **fixture_kwargs) -> dict:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            Fixture(root, **fixture_kwargs)
            return run_rehearsal(DATE, root=root, identity_runner=identity)

    def test_a_complete_slate_reports_go(self):
        report = self._run()
        self.assertEqual(report["verdict"], "GO", report["blockingStages"])
        self.assertEqual(report["blockingStages"], [])
        self.assertIn("founder sign-off", report["note"])

    def test_a_go_verdict_is_not_a_promotion(self):
        # The artifact must say so itself: a downstream reader sees the verdict, not this test.
        self.assertIn("not a promotion", self._run()["note"])

    def test_missing_tipoff_instant_blocks(self):
        rows = [{**GAME_ROW, "tipoffIso": None, "researchEligible": False}]
        report = self._run(games=rows)
        self.assertEqual(status_of(report, "tipoff"), "FAIL")
        self.assertEqual(report["verdict"], "NO_GO")

    def test_capture_after_tipoff_blocks(self):
        rows = [{**GAME_ROW, "capturedAt": "2026-10-15T02:00:00Z", "researchEligible": False}]
        report = self._run(games=rows)
        self.assertEqual(status_of(report, "eligibility"), "FAIL")
        self.assertIn("eligibility", report["blockingStages"])

    def test_hand_asserted_eligibility_blocks(self):
        rows = [{**GAME_ROW, "capturedAt": "2026-10-15T02:00:00Z", "researchEligible": True}]
        report = self._run(games=rows)
        self.assertEqual(status_of(report, "eligibility"), "FAIL")

    def test_identity_refusal_blocks(self):
        report = self._run(identity=failing_identity)
        self.assertEqual(status_of(report, "identity"), "FAIL")
        self.assertEqual(report["verdict"], "NO_GO")

    def test_an_identity_check_that_cannot_run_blocks(self):
        # A check that did not run is not a check that passed.
        report = self._run(identity=unavailable_identity)
        self.assertEqual(status_of(report, "identity"), "UNAVAILABLE")
        self.assertEqual(report["verdict"], "NO_GO")

    def test_one_sided_moneyline_blocks_devig(self):
        markets = {"date": DATE, "games": {"401900001": {"moneyline": {"home": -135}}}}
        report = self._run(markets=markets)
        self.assertEqual(status_of(report, "devig"), "FAIL")

    def test_population_gap_blocks(self):
        markets = {"date": DATE, "games": {"999999999": MARKETS["games"]["401900001"]}}
        report = self._run(markets=markets)
        self.assertEqual(status_of(report, "population"), "FAIL")

    def test_lineage_refusal_blocks_settlement(self):
        report = self._run(settled=({**SETTLED, "settlementSource": "web_snippet"},))
        self.assertEqual(status_of(report, "settlement"), "FAIL")

    def test_movement_is_informational_and_never_claimed_from_one_capture(self):
        report = self._run()
        movement = next(s for s in report["stages"] if s["stage"] == "movement")
        self.assertEqual(movement["status"], "INFORMATIONAL")
        self.assertEqual(movement["evidence"]["eventsWithMultipleCaptures"], 0)
        self.assertNotIn("movement", report["blockingStages"])

    def test_an_empty_slate_blocks_and_reports_why(self):
        report = self._run(games=[])
        self.assertEqual(status_of(report, "schedule"), "FAIL")
        self.assertEqual(report["verdict"], "NO_GO")

    def test_the_rehearsal_writes_nothing(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            Fixture(root)
            before = {p: p.read_bytes() for p in root.rglob("*") if p.is_file()}
            run_rehearsal(DATE, root=root, identity_runner=ok_identity)
            after = {p: p.read_bytes() for p in root.rglob("*") if p.is_file()}
            self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
