"""Tests for `pipeline.recent10_extractor` — PR #116 recentGames support.

Locks the contract that:
  - `extract_recent10` keeps emitting numeric arrays unchanged.
  - `extract_recent_games` emits per-game DICTS with the same row
    count and chronological order.
  - Both functions reject entries with missing dates or non-numeric
    stat values (we never invent rows).
  - The `value` in `extract_recent_games[i]` equals
    `extract_recent10[i]` for every i.
"""
from __future__ import annotations

import unittest

from pipeline.recent10_extractor import (
    extract_recent10,
    extract_recent_games,
    extract_recent_games_all_markets,
)


def _log(*, game_date, opponent_abbr, home_away, pts=0, reb=0, ast=0):
    """Build a dict shaped like `pipeline.providers.base.GameLog`."""
    return {
        "game_date": game_date,
        "opponent_abbr": opponent_abbr,
        "home_away": home_away,
        "pts": pts,
        "reb": reb,
        "ast": ast,
    }


class ExtractRecentGamesTests(unittest.TestCase):

    def test_emits_one_dict_per_log(self):
        logs = [
            _log(game_date="2026-05-20", opponent_abbr="SAS", home_away="Home", reb=8),
            _log(game_date="2026-05-22", opponent_abbr="DAL", home_away="Away", reb=10),
        ]
        out = extract_recent_games(logs, "REB")
        self.assertEqual(len(out), 2)
        # Oldest first ordering preserved (matches `extract_recent10`).
        self.assertEqual(out[0]["date"], "2026-05-20")
        self.assertEqual(out[1]["date"], "2026-05-22")

    def test_per_row_shape(self):
        logs = [_log(game_date="2026-05-20", opponent_abbr="SAS", home_away="Home", pts=22)]
        out = extract_recent_games(logs, "PTS")
        self.assertEqual(out, [{
            "date": "2026-05-20",
            "opponent": "SAS",
            "isHome": True,
            "value": 22.0,
        }])

    def test_away_flag(self):
        logs = [_log(game_date="2026-05-20", opponent_abbr="LAL", home_away="Away", pts=15)]
        self.assertFalse(extract_recent_games(logs, "PTS")[0]["isHome"])

    def test_unknown_home_away_becomes_none(self):
        logs = [_log(game_date="2026-05-20", opponent_abbr="LAL", home_away="?", pts=15)]
        self.assertIsNone(extract_recent_games(logs, "PTS")[0]["isHome"])

    def test_missing_opponent_becomes_none_not_fabricated(self):
        log = {
            "game_date": "2026-05-20",
            "home_away": "Home",
            "pts": 21,
        }
        out = extract_recent_games([log], "PTS")
        self.assertEqual(out[0]["opponent"], None)
        self.assertEqual(out[0]["value"], 21.0)

    def test_rows_drop_when_date_missing(self):
        logs = [
            _log(game_date="2026-05-20", opponent_abbr="SAS", home_away="Home", pts=10),
            {"opponent_abbr": "DAL", "home_away": "Home", "pts": 12},
            _log(game_date="2026-05-22", opponent_abbr="DAL", home_away="Away", pts=14),
        ]
        out = extract_recent_games(logs, "PTS")
        self.assertEqual(len(out), 2,
                         msg="entry with missing game_date must be dropped")

    def test_rows_drop_when_stat_missing(self):
        logs = [
            _log(game_date="2026-05-20", opponent_abbr="SAS", home_away="Home", pts=10),
            {"game_date": "2026-05-21", "opponent_abbr": "DAL", "home_away": "Home"},
            _log(game_date="2026-05-22", opponent_abbr="DAL", home_away="Away", pts=14),
        ]
        out = extract_recent_games(logs, "PTS")
        # Three input logs but middle one has no PTS — drops to 2.
        self.assertEqual(len(out), 2)

    def test_caps_at_last_n(self):
        logs = [
            _log(game_date=f"2026-05-{20+i}", opponent_abbr="X", home_away="Home", reb=i)
            for i in range(15)
        ]
        out = extract_recent_games(logs, "REB", last_n=10)
        self.assertEqual(len(out), 10)
        # last_n truncates from the head (oldest), keeps the tail.
        self.assertEqual(out[0]["value"], 5.0)
        self.assertEqual(out[-1]["value"], 14.0)

    def test_unsupported_market_returns_empty(self):
        logs = [_log(game_date="2026-05-20", opponent_abbr="X", home_away="Home", pts=10)]
        self.assertEqual(extract_recent_games(logs, "THREES"), [])

    def test_parallel_to_recent10(self):
        """The i-th value of `extract_recent_games` must equal the i-th
        value of `extract_recent10` so the drawer can cross-check without
        re-sorting."""
        logs = [
            _log(game_date="2026-05-15", opponent_abbr="SAS", home_away="Home", reb=5),
            _log(game_date="2026-05-17", opponent_abbr="DAL", home_away="Away", reb=8),
            _log(game_date="2026-05-19", opponent_abbr="LAL", home_away="Home", reb=11),
            _log(game_date="2026-05-22", opponent_abbr="NYK", home_away="Away", reb=7),
        ]
        nums = extract_recent10(logs, "REB")
        games = extract_recent_games(logs, "REB")
        self.assertEqual(len(nums), len(games))
        for i, n in enumerate(nums):
            self.assertEqual(n, games[i]["value"],
                             msg=f"row {i} mismatch: num={n} game={games[i]}")

    def test_all_markets_returns_three_keys(self):
        logs = [_log(game_date="2026-05-20", opponent_abbr="X", home_away="Home",
                     pts=20, reb=8, ast=5)]
        out = extract_recent_games_all_markets(logs)
        self.assertEqual(set(out.keys()), {"PTS", "REB", "AST"})
        self.assertEqual(out["PTS"][0]["value"], 20.0)
        self.assertEqual(out["REB"][0]["value"], 8.0)
        self.assertEqual(out["AST"][0]["value"], 5.0)


if __name__ == "__main__":
    unittest.main()
