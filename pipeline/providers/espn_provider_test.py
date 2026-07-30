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
    _parse_roster_athletes, _parse_gamelog, _espn_team_id, _stat_indices, _made_of,
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



class EspnExtendedBoxScoreTests(unittest.TestCase):
    def setUp(self):
        self.data = json.loads((FIX / "espn_gamelog_brunson.json").read_text())

    def test_made_of_parses_made_attempted(self):
        self.assertEqual(_made_of("3-5"), 3)
        self.assertEqual(_made_of("0-2"), 0)
        self.assertEqual(_made_of("11-25"), 11)
        self.assertEqual(_made_of(None), 0)
        self.assertEqual(_made_of("x"), 0)

    def test_stat_indices_extended_labels(self):
        idx = _stat_indices(["MIN", "FG", "FG%", "3PT", "3P%", "FT", "FT%", "REB",
                             "AST", "BLK", "STL", "PF", "TO", "PTS"])
        self.assertEqual(idx["fg3"], 3)
        self.assertEqual(idx["blk"], 9)
        self.assertEqual(idx["stl"], 10)
        self.assertEqual(idx["tov"], 12)

    def test_gamelog_populates_extended_fields(self):
        logs = _parse_gamelog(self.data, 3934672, last_n=10)
        g = logs[0]  # 2026-06-09 Game 3
        # PTS/REB/AST unchanged
        self.assertEqual(g.pts, 32)
        self.assertEqual(g.reb, 5)
        self.assertEqual(g.ast, 5)
        # extended fields populated from the real box score
        self.assertEqual(g.fg3m, 3)   # "3-5" -> 3 made
        self.assertEqual(g.tov, 5)
        self.assertEqual(g.blk, 0)
        self.assertIsInstance(g.stl, int)

    def test_extended_fields_default_zero_when_absent(self):
        # a labels set without BLK/STL/TO still parses (fields default 0)
        data = {"labels": ["MIN", "REB", "AST", "PTS"],
                "events": {"1": {"atVs": "vs", "gameDate": "2026-06-01", "opponent": {"abbreviation": "X"}}},
                "seasonTypes": [{"displayName": "2025-26 Regular Season",
                                 "categories": [{"events": [{"eventId": "1", "stats": ["30", "5", "5", "20"]}]}]}]}
        logs = _parse_gamelog(data, 1, 10)
        self.assertEqual(logs[0].pts, 20)
        self.assertEqual(logs[0].fg3m, 0)
        self.assertEqual(logs[0].blk, 0)


class EspnScheduleTipoffTests(unittest.TestCase):
    """The scoreboard parser must carry the tip-off INSTANT, not only its display form.

    `_format_tipoff_et` reduces ESPN's ISO instant to "8:30 PM ET". That string has no date and no
    zone offset, so `capturedAt < eventStart` is unevaluable against it — which is why every NBA
    board through 2026-06-13 reports zero research-eligible rows (gate G3). The instant is what the
    provider must hand on.
    """

    @staticmethod
    def _scoreboard(tipoff: str | None) -> dict:
        event: dict = {
            "id": "401859967",
            "competitions": [{
                "status": {"type": {"name": "STATUS_SCHEDULED"}},
                "competitors": [
                    {"homeAway": "home", "team": {"abbreviation": "SA", "displayName": "San Antonio Spurs"}},
                    {"homeAway": "away", "team": {"abbreviation": "NY", "displayName": "New York Knicks"}},
                ],
            }],
        }
        if tipoff is not None:
            event["date"] = tipoff
        return {"events": [event]}

    def _parse(self, payload: dict):
        from pipeline.providers.espn_provider import EspnProvider
        return EspnProvider()._parse(payload, "2026-10-21")

    def test_iso_tipoff_is_carried_through(self):
        games = self._parse(self._scoreboard("2026-10-22T00:30Z"))
        self.assertEqual(len(games), 1)
        self.assertEqual(games[0].tipoff_iso, "2026-10-22T00:30Z")
        self.assertEqual(games[0].tipoff_et, "8:30 PM ET")

    def test_absent_tipoff_stays_none_rather_than_a_placeholder(self):
        games = self._parse(self._scoreboard(None))
        self.assertEqual(len(games), 1)
        self.assertIsNone(games[0].tipoff_iso)
        self.assertEqual(games[0].tipoff_et, "TBD")


if __name__ == "__main__":
    unittest.main()
