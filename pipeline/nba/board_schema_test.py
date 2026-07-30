"""Guards for the NBA board row schema — prerequisite zero (gate G3).

Two things must hold and neither is obvious from reading the code alone:
  · a NEW row carries the tip-off instant and derives eligibility from it, per row;
  · a HISTORICAL row can never acquire one, because that would fabricate the evidence the gate
    exists to demand.

The second is tested against the real committed boards, not a fixture.
"""
from __future__ import annotations

import json
import sys
import types
import unittest
from pathlib import Path

sys.modules.setdefault("requests", types.ModuleType("requests"))  # provider import is parser-only

from pipeline.nba.board_schema import (  # noqa: E402
    EMPTY_SLATE_NOT_EMPTY,
    EMPTY_SLATE_OFF_SEASON,
    EMPTY_SLATE_PROVIDER_FAILURE,
    TIPOFF_SCHEMA_EPOCH,
    assert_no_historical_backfill,
    classify_empty_slate,
    research_eligible,
    serialize_game_row,
    validate_new_board_row,
)
from pipeline.providers.base import Game  # noqa: E402

BOARDS_DIR = Path(__file__).resolve().parents[2] / "app" / "public" / "data" / "boards"


def game(**kw) -> Game:
    base = dict(
        game_id="401859967",
        date="2026-10-21",
        tipoff_et="8:30 PM ET",
        home_team_abbr="SA",
        home_team_full="San Antonio Spurs",
        away_team_abbr="NY",
        away_team_full="New York Knicks",
        status="Scheduled",
        tipoff_iso="2026-10-22T00:30Z",
    )
    base.update(kw)
    return Game(**base)


class ResearchEligibilityTests(unittest.TestCase):
    def test_captured_before_tipoff_is_eligible(self):
        self.assertTrue(research_eligible("2026-10-21T14:00:00Z", "2026-10-22T00:30Z"))

    def test_captured_after_tipoff_is_not(self):
        self.assertFalse(research_eligible("2026-10-22T01:00:00Z", "2026-10-22T00:30Z"))

    def test_captured_exactly_at_tipoff_is_not(self):
        # Strictly before. A line observed at the instant the ball goes up is not pregame evidence.
        self.assertFalse(research_eligible("2026-10-22T00:30:00Z", "2026-10-22T00:30:00Z"))

    def test_missing_or_unparseable_fails_closed(self):
        for captured, tipoff in [
            (None, "2026-10-22T00:30Z"),
            ("2026-10-21T14:00:00Z", None),
            ("2026-10-21T14:00:00Z", "8:30 PM ET"),
            ("not-a-time", "2026-10-22T00:30Z"),
            ("2026-10-21", "2026-10-22T00:30Z"),
        ]:
            self.assertFalse(research_eligible(captured, tipoff), f"{captured!r}/{tipoff!r}")

    def test_naive_timestamps_fail_closed(self):
        # A timestamp with no zone is a different instant depending on who reads it. Comparing two
        # of them and calling the answer leakage-safety is exactly the substitution G3 forbids.
        self.assertFalse(research_eligible("2026-10-21T14:00:00", "2026-10-22T00:30:00"))


class SerializeGameRowTests(unittest.TestCase):
    def test_row_carries_instant_alongside_display_string(self):
        row = serialize_game_row(game(), "2026-10-21", "2026-10-21T14:00:00Z")
        self.assertEqual(row["tipoff"], "8:30 PM ET")
        self.assertEqual(row["tipoffIso"], "2026-10-22T00:30Z")
        self.assertTrue(row["researchEligible"])
        self.assertEqual(validate_new_board_row(row), [])

    def test_display_only_tipoff_yields_null_instant_and_ineligible_row(self):
        row = serialize_game_row(game(tipoff_iso=None), "2026-10-21", "2026-10-21T14:00:00Z")
        self.assertIsNone(row["tipoffIso"])
        self.assertFalse(row["researchEligible"])
        self.assertEqual(validate_new_board_row(row), [])

    def test_display_string_is_never_promoted_to_an_instant(self):
        row = serialize_game_row(game(tipoff_iso="8:30 PM ET"), "2026-10-21", "2026-10-21T14:00:00Z")
        self.assertIsNone(row["tipoffIso"])
        self.assertFalse(row["researchEligible"])

    def test_capture_after_tipoff_is_recorded_not_hidden(self):
        row = serialize_game_row(game(), "2026-10-21", "2026-10-22T02:00:00Z")
        self.assertEqual(row["tipoffIso"], "2026-10-22T00:30Z")
        self.assertFalse(row["researchEligible"])
        self.assertEqual(validate_new_board_row(row), [])


class RowValidationTests(unittest.TestCase):
    def test_hand_asserted_eligibility_is_rejected(self):
        row = serialize_game_row(game(), "2026-10-21", "2026-10-22T02:00:00Z")
        row["researchEligible"] = True  # captured after tip-off; claim is not derivable
        violations = validate_new_board_row(row)
        self.assertTrue(any(v.startswith("ELIGIBILITY_NOT_DERIVED") for v in violations), violations)

    def test_missing_fields_are_rejected(self):
        row = serialize_game_row(game(), "2026-10-21", "2026-10-21T14:00:00Z")
        del row["tipoffIso"]
        self.assertTrue(
            any(v.startswith("MISSING_TIPOFF_FIELD") for v in validate_new_board_row(row))
        )


class BackfillProhibitionTests(unittest.TestCase):
    def test_historical_date_with_tipoff_iso_is_refused(self):
        rows = [{"gameId": "401859967", "tipoffIso": "2026-06-14T00:30Z"}]
        with self.assertRaises(ValueError) as ctx:
            assert_no_historical_backfill("2026-06-13", rows)
        self.assertIn("permanently research-ineligible", str(ctx.exception))

    def test_historical_date_without_tipoff_iso_is_allowed(self):
        assert_no_historical_backfill("2026-06-13", [{"gameId": "401859967", "tipoffIso": None}])

    def test_epoch_date_onward_may_carry_the_instant(self):
        assert_no_historical_backfill(
            TIPOFF_SCHEMA_EPOCH, [{"gameId": "1", "tipoffIso": "2026-07-31T00:30Z"}]
        )

    def test_committed_historical_boards_carry_no_tipoff_instant(self):
        """The 54-board corpus is permanently ineligible. Read-only: this test writes nothing."""
        checked = 0
        for path in sorted(BOARDS_DIR.glob("*.json")):
            date = path.stem
            if date >= TIPOFF_SCHEMA_EPOCH:
                continue
            board = json.loads(path.read_text())
            rows = board.get("games") or []
            assert_no_historical_backfill(date, rows)
            for row in rows:
                self.assertIsNone(
                    row.get("tipoffIso"),
                    f"{date} game {row.get('gameId')} acquired a tip-off instant it never captured",
                )
            checked += 1
        self.assertGreater(checked, 40, "expected the historical NBA board corpus to be present")


class EmptySlateClassificationTests(unittest.TestCase):
    def test_games_present(self):
        self.assertEqual(
            classify_empty_slate(game_count=6, schedule_available=True), EMPTY_SLATE_NOT_EMPTY
        )

    def test_confirmed_empty_is_an_off_day_not_a_failure(self):
        self.assertEqual(
            classify_empty_slate(game_count=0, schedule_available=True), EMPTY_SLATE_OFF_SEASON
        )

    def test_provider_failure_is_never_labelled_an_off_day(self):
        self.assertEqual(
            classify_empty_slate(game_count=0, schedule_available=False),
            EMPTY_SLATE_PROVIDER_FAILURE,
        )


if __name__ == "__main__":
    unittest.main()
