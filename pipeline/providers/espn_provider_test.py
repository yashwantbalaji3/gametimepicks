"""Tests for the ESPN free NBA provider (roster + player game logs). Pure parsers are
exercised against REAL (trimmed) ESPN JSON fixtures — proving recent-form recovery
without stats.nba.com. Never invents rows; malformed input fails closed.

A `requests` stub is injected so the test runs with or without requests installed
(the parsers are pure; only live HTTP needs requests)."""
from __future__ import annotations

import json
import sys
import types
import unittest
from pathlib import Path

sys.modules.setdefault("requests", types.ModuleType("requests"))  # parsers don't use it

from pipeline.providers.espn_provider import (  # noqa: E402
    _parse_roster_athletes, _parse_gamelog, _espn_team_id, _stat_indices,
)

FIX = Path(__file__).parent / "testdata"


class EspnTeamMapTests(unittest.TestCase):
    def test_standard_abbrs_resolve(self):
        self.assertEqual(_espn_team_id("NYK"), "18")   # standard -> ESPN id
        self.assertEqual(_espn_team_id("SAS"), "24")
        self.assertEqual(_espn_team_id("GSW"), "9")
        self.assertEqual(_espn_team_id("BOS"), "2")

    def test_espn_native_abbrs_resolve(self):
        self.assertEqual(_espn_team_id("NY"), "18")
        self.assertEqual(_espn_team_id("SA"), "24")

    def test_unknown_is_none(self):
        self.assertIsNone(_espn_team_id("ZZZ"))


class EspnRosterParseTests(unittest.TestCase):
    def test_parses_real_roster(self):
        data = json.loads((FIX / "espn_roster_sa.json").read_text())
        players = _parse_roster_athletes(data, "SAS")
        self.assertGreaterEqual(len(players), 3)
        p = players[0]
        self.assertGreater(p.player_id, 0)
        self.assertTrue(p.player_name)
        self.assertEqual(p.team_abbr, "SAS")

    def test_empty_fails_closed(self):
        self.assertEqual(_parse_roster_athletes({}, "SAS"), [])
        self.assertEqual(_parse_roster_athletes({"athletes": [{}]}, "SAS"), [])


class EspnGameLogParseTests(unittest.TestCase):
    def setUp(self):
        self.data = json.loads((FIX / "espn_gamelog_brunson.json").read_text())

    def test_parses_real_gamelog(self):
        logs = _parse_gamelog(self.data, 3934672, last_n=10)
        self.assertGreaterEqual(len(logs), 6)
        g = logs[0]
        self.assertEqual(g.player_id, 3934672)
        self.assertGreater(g.pts, 0)
        self.assertIn(g.home_away, ("Home", "Away"))
        self.assertTrue(g.opponent_abbr)

    def test_newest_first_ordering(self):
        logs = _parse_gamelog(self.data, 3934672, last_n=10)
        dates = [g.game_date for g in logs]
        self.assertEqual(dates, sorted(dates, reverse=True))
        self.assertEqual(logs[0].game_date, "2026-06-09")  # most recent Finals game

    def test_last_n_caps(self):
        self.assertLessEqual(len(_parse_gamelog(self.data, 3934672, last_n=3)), 3)

    def test_stat_indices_by_label(self):
        idx = _stat_indices(["MIN", "FG", "FG%", "3PT", "3P%", "FT", "FT%", "REB",
                             "AST", "BLK", "STL", "PF", "TO", "PTS"])
        self.assertEqual(idx["pts"], 13)
        self.assertEqual(idx["reb"], 7)
        self.assertEqual(idx["ast"], 8)
        self.assertEqual(idx["minutes"], 0)

    def test_missing_pts_label_fails_closed(self):
        self.assertEqual(_parse_gamelog({"labels": ["MIN"], "seasonTypes": []}, 1), [])
        self.assertEqual(_parse_gamelog({}, 1), [])
        self.assertEqual(_parse_gamelog(None, 1), [])


if __name__ == "__main__":
    unittest.main()
