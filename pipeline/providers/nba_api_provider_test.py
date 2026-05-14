"""Regression tests for NbaApiProvider.fetch_schedule_with_diagnostics.

Background: on a cache-MISS schedule fetch, the per-endpoint helper methods
return raw Game dataclass instances in their `games` field. Those dicts are
then appended into diag["endpoint_history"], which flows verbatim into the
board JSON. json.dumps does not know how to serialize a Game dataclass, so
the whole board write fails with:

    TypeError: Object of type Game is not JSON serializable

This blocked the May 15 paid odds run on 2026-05-14: paid /odds succeeded
and 163 props came back, but the subsequent board write crashed and zero
data landed on disk.

The fix strips the `games` key from each entry before appending it to
endpoint_history (top-level diag["games"] still holds the Game instances
for the caller; _try_nba_api_schedule converts those via _serialize_games).
"""
from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from pipeline.providers.base import Game
from pipeline.providers import nba_api_provider as nap


def _make_game(game_id: str, away: str, home: str) -> Game:
    return Game(
        game_id=game_id,
        date="2026-05-15",
        tipoff_et="8:00 PM ET",
        home_team_abbr=home,
        home_team_full=f"{home} Team",
        away_team_abbr=away,
        away_team_full=f"{away} Team",
        status="Scheduled",
    )


class EndpointHistorySerializationTests(unittest.TestCase):
    """The cache-miss path must produce a JSON-serializable diag."""

    def setUp(self) -> None:
        self.provider = nap.NbaApiProvider()
        # Pretend nba_api is importable so _ensure_available passes.
        self.provider._available = True

    def _fetch_with_sv2_success(self, games: list[Game]) -> dict:
        """Force a cache-miss and stub ScoreboardV2 to return `games`."""
        sv2_payload = {
            "endpoint": "scoreboardv2",
            "status": "ok",
            "raw_count": len(games),
            "games": games,
            "error": None,
        }
        with patch.object(nap, "_cache_get", return_value=None), \
             patch.object(self.provider, "_try_scoreboardv2",
                          return_value=sv2_payload), \
             patch.object(self.provider, "_cache_diag"):
            return self.provider.fetch_schedule_with_diagnostics("2026-05-15")

    def test_endpoint_history_has_no_game_dataclass_instances(self) -> None:
        """endpoint_history must not contain raw Game dataclass instances."""
        games = [_make_game("g1", "SA", "MIN"), _make_game("g2", "DET", "CLE")]
        diag = self._fetch_with_sv2_success(games)

        self.assertTrue(diag["fetch_succeeded"])
        self.assertEqual(len(diag["endpoint_history"]), 1)
        entry = diag["endpoint_history"][0]
        # The fix drops the games field entirely. raw_count still reports
        # how many games the endpoint returned.
        self.assertNotIn("games", entry)
        self.assertEqual(entry["raw_count"], 2)
        self.assertEqual(entry["status"], "ok")

    def test_full_diag_is_json_serializable_after_dropping_top_level_games(self) -> None:
        """
        The board JSON write does json.dumps on payloads that embed
        diag["endpoint_history"] verbatim. After top-level diag["games"]
        is converted to dicts by the caller (via _serialize_games), the
        rest of diag must JSON-serialize cleanly.
        """
        games = [_make_game("g1", "SA", "MIN")]
        diag = self._fetch_with_sv2_success(games)
        # Caller normally converts top-level games separately — simulate that.
        diag_for_board = {**diag, "games": [vars(g) for g in diag["games"]]}
        # Should not raise.
        json.dumps(diag_for_board)

    def test_lgf_fallback_path_also_clean(self) -> None:
        """LeagueGameFinder fallback must also strip games from history."""
        sv2_empty = {
            "endpoint": "scoreboardv2",
            "status": "ok",
            "raw_count": 0,
            "games": [],
            "error": None,
        }
        lgf_payload = {
            "endpoint": "leaguegamefinder",
            "status": "ok",
            "raw_count": 1,
            "games": [_make_game("g1", "SA", "MIN")],
            "error": None,
        }
        with patch.object(nap, "_cache_get", return_value=None), \
             patch.object(self.provider, "_try_scoreboardv2",
                          return_value=sv2_empty), \
             patch.object(self.provider, "_try_leaguegamefinder",
                          return_value=lgf_payload), \
             patch.object(self.provider, "_cache_diag"):
            diag = self.provider.fetch_schedule_with_diagnostics("2026-05-15")

        self.assertTrue(diag["fetch_succeeded"])
        self.assertEqual(len(diag["endpoint_history"]), 2)
        for entry in diag["endpoint_history"]:
            self.assertNotIn("games", entry)


if __name__ == "__main__":
    unittest.main()
