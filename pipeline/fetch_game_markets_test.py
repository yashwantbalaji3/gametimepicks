"""Tests for pipeline.fetch_game_markets — pure parsing + cost math.

We never hit the real API in tests; every assertion runs on fixture
payloads shaped like a real Odds API /events/{id}/odds response.

Run: python -m pipeline.fetch_game_markets_test
"""
from __future__ import annotations

import json
import os
import sys
import tempfile

from . import fetch_game_markets as FGM


GREEN = "\033[0;32m"; RED = "\033[0;31m"; BLUE = "\033[0;34m"; RESET = "\033[0m"


class Suite:
    def __init__(self):
        self.passed = 0; self.failed = 0; self.failures = []

    def assert_eq(self, actual, expected, name):
        if actual == expected:
            self.passed += 1; print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            self.failures.append(f"{name}: expected {expected!r}, got {actual!r}")
            print(f"  {RED}✗{RESET} {name}")
            print(f"    expected: {expected!r}"); print(f"    got:      {actual!r}")

    def assert_true(self, cond, name):
        if cond:
            self.passed += 1; print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1; print(f"  {RED}✗{RESET} {name}")

    def assert_none(self, actual, name):
        self.assert_true(actual is None, name)


# ---------------------------------------------------------------------------
# Fixtures — modelled on real Odds API event-odds responses for NBA
# ---------------------------------------------------------------------------


def _full_event_payload() -> dict:
    """SA @ OKC fixture with all three markets posted by DraftKings."""
    return {
        "id": "evt-okc-sa",
        "sport_key": "basketball_nba",
        "home_team": "Oklahoma City Thunder",
        "away_team": "San Antonio Spurs",
        "commence_time": "2026-05-21T00:30:00Z",
        "last_update": "2026-05-20T20:00:00Z",
        "bookmakers": [
            {
                "key": "draftkings",
                "title": "DraftKings",
                "last_update": "2026-05-20T20:00:00Z",
                "markets": [
                    {
                        "key": "h2h",
                        "outcomes": [
                            {"name": "Oklahoma City Thunder", "price": -350},
                            {"name": "San Antonio Spurs", "price": 280},
                        ],
                    },
                    {
                        "key": "spreads",
                        "outcomes": [
                            {"name": "Oklahoma City Thunder", "point": -7.5, "price": -110},
                            {"name": "San Antonio Spurs", "point": 7.5, "price": -110},
                        ],
                    },
                    {
                        "key": "totals",
                        "outcomes": [
                            {"name": "Over", "point": 218.5, "price": -110},
                            {"name": "Under", "point": 218.5, "price": -110},
                        ],
                    },
                ],
            }
        ],
    }


def _partial_event_payload() -> dict:
    """Bookmaker has h2h but no spread + total yet."""
    payload = _full_event_payload()
    payload["bookmakers"][0]["markets"] = [
        m for m in payload["bookmakers"][0]["markets"] if m["key"] == "h2h"
    ]
    return payload


def _board_games() -> list:
    return [
        {
            "gameId": "401873198",
            "homeTeamFull": "Oklahoma City Thunder",
            "awayTeamFull": "San Antonio Spurs",
            "homeTeamAbbr": "OKC",
            "awayTeamAbbr": "SA",
        },
        {
            "gameId": "401873342",
            "homeTeamFull": "New York Knicks",
            "awayTeamFull": "Cleveland Cavaliers",
            "homeTeamAbbr": "NY",
            "awayTeamAbbr": "CLE",
        },
    ]


def _events_payload() -> list:
    return [
        {
            "id": "evt-okc-sa",
            "home_team": "Oklahoma City Thunder",
            "away_team": "San Antonio Spurs",
        },
        {
            "id": "evt-ny-cle",
            "home_team": "New York Knicks",
            "away_team": "Cleveland Cavaliers",
        },
        # An extra event that must NOT match the board.
        {
            "id": "evt-unrelated",
            "home_team": "Los Angeles Lakers",
            "away_team": "Boston Celtics",
        },
    ]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_parse_full_event(s: Suite):
    print(f"\n  {BLUE}─── parse_event_markets · full fixture ───{RESET}")
    parsed = FGM.parse_event_markets(_full_event_payload())
    s.assert_true(parsed is not None, "returns a GameMarketLines")
    if parsed is None:
        return
    s.assert_eq(parsed.bookmaker, "draftkings", "preferred bookmaker chosen")
    s.assert_eq(parsed.moneyline, {"home": -350, "away": 280},
                "moneyline parsed home + away")
    s.assert_eq(parsed.spread, {"home": -7.5, "away": 7.5},
                "spread parsed (home favored by 7.5)")
    s.assert_true(parsed.total is not None, "total parsed")
    if parsed.total:
        s.assert_eq(parsed.total["line"], 218.5, "total line carried")
        s.assert_eq(parsed.total.get("over"), -110, "over price carried")
        s.assert_eq(parsed.total.get("under"), -110, "under price carried")


def test_parse_partial_event(s: Suite):
    print(f"\n  {BLUE}─── parse_event_markets · partial fixture ───{RESET}")
    parsed = FGM.parse_event_markets(_partial_event_payload())
    s.assert_true(parsed is not None, "still returns when only h2h present")
    if parsed is None:
        return
    s.assert_eq(parsed.moneyline, {"home": -350, "away": 280},
                "moneyline parsed")
    s.assert_none(parsed.spread, "spread is None when not posted")
    s.assert_none(parsed.total, "total is None when not posted")


def test_parse_empty_event(s: Suite):
    print(f"\n  {BLUE}─── parse_event_markets · empty fixture ───{RESET}")
    s.assert_none(FGM.parse_event_markets({}), "empty dict → None")
    s.assert_none(FGM.parse_event_markets({"bookmakers": []}),
                  "no bookmakers → None")
    payload = _full_event_payload()
    payload["bookmakers"][0]["markets"] = []
    s.assert_none(FGM.parse_event_markets(payload),
                  "bookmaker with no markets → None")


def test_parse_picks_preferred_bookmaker(s: Suite):
    print(f"\n  {BLUE}─── parse_event_markets · bookmaker preference ───{RESET}")
    payload = _full_event_payload()
    # Insert a competing bookmaker before DraftKings.
    fd = dict(payload["bookmakers"][0])
    fd["key"] = "fanduel"
    payload["bookmakers"] = [fd, payload["bookmakers"][0]]
    parsed = FGM.parse_event_markets(
        payload, preferred_bookmakers=("draftkings", "fanduel"),
    )
    s.assert_true(parsed is not None, "parsed")
    if parsed is None:
        return
    s.assert_eq(parsed.bookmaker, "draftkings",
                "DraftKings preferred over FanDuel")
    parsed_fd = FGM.parse_event_markets(
        payload, preferred_bookmakers=("fanduel", "draftkings"),
    )
    if parsed_fd is None:
        s.assert_true(False, "fanduel-preferred parse not None")
        return
    s.assert_eq(parsed_fd.bookmaker, "fanduel",
                "FanDuel preferred when listed first")


def test_match_events_to_games(s: Suite):
    print(f"\n  {BLUE}─── match_events_to_games ───{RESET}")
    matched = FGM.match_events_to_games(
        events=_events_payload(),
        games=_board_games(),
    )
    s.assert_eq(set(matched.keys()), {"401873198", "401873342"},
                "both board games matched")
    s.assert_eq(matched["401873198"]["id"], "evt-okc-sa",
                "SA @ OKC matched correctly")
    s.assert_eq(matched["401873342"]["id"], "evt-ny-cle",
                "CLE @ NY matched correctly")


def test_match_events_handles_no_match(s: Suite):
    print(f"\n  {BLUE}─── match_events_to_games · no match ───{RESET}")
    matched = FGM.match_events_to_games(
        events=[{"id": "evt-x", "home_team": "Foo", "away_team": "Bar"}],
        games=_board_games(),
    )
    s.assert_eq(matched, {}, "unrelated event → empty match")


def test_estimate_cost(s: Suite):
    print(f"\n  {BLUE}─── estimate_cost ───{RESET}")
    s.assert_eq(FGM.estimate_cost(0), 0, "0 events → 0 credits")
    s.assert_eq(FGM.estimate_cost(1), 3, "1 event → 3 credits")
    s.assert_eq(FGM.estimate_cost(2), 6, "2 events → 6 credits (May 20+21 cost)")
    s.assert_eq(FGM.estimate_cost(15), 45, "15 games → 45 credits (full MLB shape)")


def test_load_game_markets_for_odds_lines_missing(s: Suite):
    print(f"\n  {BLUE}─── load_game_markets_for_odds_lines · missing file ───{RESET}")
    with tempfile.TemporaryDirectory() as tmp:
        result = FGM.load_game_markets_for_odds_lines("2999-01-01", root=tmp)
        s.assert_none(result, "no file → None (not empty dict)")


def test_load_game_markets_for_odds_lines_present(s: Suite):
    print(f"\n  {BLUE}─── load_game_markets_for_odds_lines · happy path ───{RESET}")
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "2026-05-20.json")
        with open(path, "w") as f:
            json.dump({
                "sport": "NBA",
                "date": "2026-05-20",
                "games": {
                    "401873198": {
                        "gameId": "401873198",
                        "moneyline": {"home": -350, "away": 280},
                        "spread": {"home": -7.5, "away": 7.5},
                        "total": {"line": 218.5, "over": -110, "under": -110},
                    }
                },
            }, f)
        result = FGM.load_game_markets_for_odds_lines("2026-05-20", root=tmp)
        s.assert_true(result is not None, "non-empty result")
        if result is None:
            return
        s.assert_true("401873198" in result, "gameId key present")
        per = result["401873198"]
        s.assert_eq(per["spread"], -7.5,
                    "spread converted to single home-spread float for team_projection")
        s.assert_eq(per["moneyline"], {"home": -350, "away": 280},
                    "moneyline shape preserved")
        s.assert_eq(per["total"], 218.5,
                    "total converted to single line float")


def test_load_game_markets_skips_partial(s: Suite):
    print(f"\n  {BLUE}─── load_game_markets_for_odds_lines · partial entry ───{RESET}")
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "2026-05-20.json")
        with open(path, "w") as f:
            json.dump({
                "games": {
                    "g1": {
                        "moneyline": None,
                        "spread": None,
                        "total": None,
                    }
                },
            }, f)
        result = FGM.load_game_markets_for_odds_lines("2026-05-20", root=tmp)
        s.assert_none(result, "all-null game → None (no fabricated entry)")


def test_h2h_requires_both_sides(s: Suite):
    print(f"\n  {BLUE}─── _parse_h2h · refuses one-sided h2h ───{RESET}")
    payload = _full_event_payload()
    # Drop the away side outcome.
    payload["bookmakers"][0]["markets"][0]["outcomes"] = [
        {"name": "Oklahoma City Thunder", "price": -350},
    ]
    parsed = FGM.parse_event_markets(payload)
    s.assert_true(parsed is not None, "still parses since other markets fill in")
    if parsed is None:
        return
    s.assert_none(parsed.moneyline, "moneyline dropped when only one side present")


def test_totals_requires_line(s: Suite):
    print(f"\n  {BLUE}─── _parse_totals · refuses missing line ───{RESET}")
    payload = _full_event_payload()
    for o in payload["bookmakers"][0]["markets"][2]["outcomes"]:
        o.pop("point", None)
    parsed = FGM.parse_event_markets(payload)
    s.assert_true(parsed is not None, "still parses")
    if parsed is None:
        return
    s.assert_none(parsed.total, "total dropped when line not posted")


def main():
    s = Suite()
    for t in (
        test_parse_full_event,
        test_parse_partial_event,
        test_parse_empty_event,
        test_parse_picks_preferred_bookmaker,
        test_match_events_to_games,
        test_match_events_handles_no_match,
        test_estimate_cost,
        test_load_game_markets_for_odds_lines_missing,
        test_load_game_markets_for_odds_lines_present,
        test_load_game_markets_skips_partial,
        test_h2h_requires_both_sides,
        test_totals_requires_line,
    ):
        t(s)
    print(
        f"\n{GREEN if s.failed == 0 else RED}"
        f"{'✓' if s.failed == 0 else '✗'} "
        f"{s.passed} assertions passed, {s.failed} failed{RESET}"
    )
    return 0 if s.failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
