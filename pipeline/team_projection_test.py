"""Tests for pipeline.team_projection.

Pure unit tests. Every assertion exercises a real boundary downstream
consumers (UI card + future audit) depend on:

  * One game, two teams → margin + winner correct
  * Duplicate (player, market) leans count only once
  * `homeAway` fallback resolves the team field when `team` is empty
  * Market spread / moneyline stay None when caller passes None odds
  * Market lines populate when caller passes real odds
  * Confidence is conservative: low when N < 6 per team
  * Confidence stays low when no playoff override exists
  * Projection direction (winner) matches sign of margin
  * Empty leans → zero margin, no winner
  * `project_board` runs every game

Run: python -m pipeline.team_projection_test
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from datetime import datetime, timezone

from . import team_projection as TP


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

    def assert_close(self, actual, expected, tol, name):
        if actual is None:
            self.failed += 1
            print(f"  {RED}✗{RESET} {name} (got None)")
            return
        if abs(actual - expected) <= tol:
            self.passed += 1; print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            print(f"  {RED}✗{RESET} {name} (expected {expected} ± {tol}, got {actual})")

    def assert_true(self, cond, name):
        if cond:
            self.passed += 1; print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1; print(f"  {RED}✗{RESET} {name}")


def _temp_overrides(games: dict) -> str:
    fd, path = tempfile.mkstemp(prefix="po_", suffix=".json"); os.close(fd)
    with open(path, "w") as f:
        json.dump({"games": games}, f)
    return path


def _lean(player_id, name, market, side, line, proj, edge, conf, team, ha, gid):
    return {
        "playerId": player_id, "playerName": name,
        "market": market, "lean": side, "line": line,
        "projection": proj, "edgePct": edge, "confidence": conf,
        "team": team, "homeAway": ha, "gameId": gid,
    }


FROZEN_NOW = datetime(2026, 5, 20, 18, 0, 0, tzinfo=timezone.utc)


def test_basic_margin_and_winner(s: Suite):
    print(f"\n  {BLUE}─── basic margin + winner ───{RESET}")
    overrides = _temp_overrides({
        "g1": {"round":"WCF","gameNumber":2,"seriesShort":"SA-OKC",
               "homeTeam":"OKC","awayTeam":"SA"},
    })
    game = {"gameId":"g1","homeTeamAbbr":"OKC","awayTeamAbbr":"SA"}
    leans = [
        _lean(1,"Shai","PTS","Over",27.5,30.0,5,"High","OKC","Home","g1"),
        _lean(2,"Holmgren","PTS","Over",17.5,20.0,5,"High","OKC","Home","g1"),
        _lean(3,"Wembanyama","PTS","Over",25.5,28.0,5,"High","SA","Away","g1"),
        _lean(4,"Castle","PTS","Over",14.5,16.0,5,"High","SA","Away","g1"),
    ]
    g = TP.project_game(sport="NBA", date="2026-05-20", game=game,
                        leans=leans, overrides_path=overrides, now=FROZEN_NOW)
    s.assert_close(g.home.projectedPts, 50.0, 1e-6, "OKC projected PTS 30+20=50")
    s.assert_close(g.away.projectedPts, 44.0, 1e-6, "SA projected PTS 28+16=44")
    s.assert_close(g.projectedMargin, 6.0, 1e-6, "margin = home - away = 6")
    s.assert_eq(g.projectedWinner, "OKC", "OKC wins")
    s.assert_eq(g.home.contributingPlayerCount, 2, "OKC 2 players")
    s.assert_eq(g.away.contributingPlayerCount, 2, "SA 2 players")
    s.assert_eq(g.home.isHome, True, "OKC isHome True")
    s.assert_eq(g.away.isHome, False, "SA isHome False")
    s.assert_eq(g.playoffContext["round"], "WCF", "WCF round attached")
    os.unlink(overrides)


def test_duplicate_player_market_dedupes(s: Suite):
    print(f"\n  {BLUE}─── duplicate (player, market) leans counted once ───{RESET}")
    overrides = _temp_overrides({})
    game = {"gameId":"g","homeTeamAbbr":"A","awayTeamAbbr":"B"}
    leans = [
        # Same player + market on two books — only one should count.
        _lean(1,"Star","PTS","Over",20.5,25.0,5,"High","A","Home","g"),
        _lean(1,"Star","PTS","Over",20.5,25.0,4,"High","A","Home","g"),
        _lean(2,"B1","PTS","Over",10.5,12.0,5,"High","B","Away","g"),
    ]
    g = TP.project_game(sport="NBA", date="2026-05-20", game=game,
                        leans=leans, overrides_path=overrides, now=FROZEN_NOW)
    s.assert_close(g.home.projectedPts, 25.0, 1e-6, "Star counted once, not twice")
    s.assert_eq(g.home.contributingPlayerCount, 1, "1 contributor on A")
    os.unlink(overrides)


def test_unattributed_lean_dropped_no_homeaway_fallback(s: Suite):
    """The legacy homeAway-only fallback was removed: an empty `team`
    field plus a fake-name player (not in the static roster, no roster
    map) must be dropped, NOT routed by `homeAway` (which itself is
    unreliable when the upstream lookup failed)."""
    print(f"\n  {BLUE}─── unattributed leans dropped — no homeAway fallback ───{RESET}")
    overrides = _temp_overrides({
        "g": {"round":"WCF","gameNumber":2,"seriesShort":"SA-OKC",
              "homeTeam":"OKC","awayTeam":"SA"},
    })
    game = {"gameId":"g","homeTeamAbbr":"OKC","awayTeamAbbr":"SA"}
    leans = [
        # Fake names — not in static roster, no team field. Pipeline's
        # broken default would have stamped homeAway="Home" on both;
        # the old code routed them to OKC. New code drops them.
        _lean(99001,"Fake McFakeface","PTS","Over",27.5,30.0,5,"High","","Home","g"),
        _lean(99002,"Phantom Player","PTS","Over",25.5,28.0,5,"High","","Home","g"),
    ]
    g = TP.project_game(sport="NBA", date="2026-05-20", game=game,
                        leans=leans, overrides_path=overrides, now=FROZEN_NOW)
    s.assert_eq(g.home.contributingPlayerCount, 0,
                "no fake-name attribution to OKC")
    s.assert_eq(g.away.contributingPlayerCount, 0,
                "no fake-name attribution to SA")
    os.unlink(overrides)


def test_only_PTS_market_counts(s: Suite):
    print(f"\n  {BLUE}─── only PTS market contributes to team total ───{RESET}")
    overrides = _temp_overrides({})
    game = {"gameId":"g","homeTeamAbbr":"A","awayTeamAbbr":"B"}
    leans = [
        _lean(1,"Star","PTS","Over",20.5,25.0,5,"High","A","Home","g"),
        _lean(1,"Star","REB","Over",8.5,11.0,5,"High","A","Home","g"),
        _lean(1,"Star","AST","Over",6.5,9.0,5,"High","A","Home","g"),
    ]
    g = TP.project_game(sport="NBA", date="2026-05-20", game=game,
                        leans=leans, overrides_path=overrides, now=FROZEN_NOW)
    s.assert_close(g.home.projectedPts, 25.0, 1e-6, "Only PTS counted (25, not 45)")
    s.assert_eq(g.home.contributingPlayerCount, 1, "1 player, 1 row")
    os.unlink(overrides)


def test_no_play_excluded(s: Suite):
    print(f"\n  {BLUE}─── No Play / insufficient leans excluded ───{RESET}")
    overrides = _temp_overrides({})
    game = {"gameId":"g","homeTeamAbbr":"A","awayTeamAbbr":"B"}
    leans = [
        # Valid contribution
        _lean(1,"S","PTS","Over",20,25,5,"High","A","Home","g"),
        # No Play row — should be excluded
        {"playerId":2,"playerName":"X","market":"PTS","lean":"No Play",
         "line":15,"projection":12,"edgePct":-3,"confidence":"insufficient_data",
         "team":"A","homeAway":"Home","gameId":"g"},
        # Pass row — excluded
        {"playerId":3,"playerName":"Y","market":"PTS","lean":"Pass",
         "line":10,"projection":10,"edgePct":0,"confidence":"Low",
         "team":"A","homeAway":"Home","gameId":"g"},
    ]
    g = TP.project_game(sport="NBA", date="2026-05-20", game=game,
                        leans=leans, overrides_path=overrides, now=FROZEN_NOW)
    s.assert_close(g.home.projectedPts, 25.0, 1e-6, "only the valid Over counts")
    s.assert_eq(g.home.contributingPlayerCount, 1, "1 contributor")
    os.unlink(overrides)


def test_market_lines_never_fabricated(s: Suite):
    print(f"\n  {BLUE}─── market spread / moneyline stay None when caller passes None ───{RESET}")
    overrides = _temp_overrides({})
    game = {"gameId":"g","homeTeamAbbr":"A","awayTeamAbbr":"B"}
    leans = [_lean(1,"S","PTS","Over",20,25,5,"High","A","Home","g")]
    g = TP.project_game(sport="NBA", date="2026-05-20", game=game,
                        leans=leans, overrides_path=overrides, now=FROZEN_NOW)
    s.assert_eq(g.marketSpread, None, "marketSpread None")
    s.assert_eq(g.marketMoneyline, None, "marketMoneyline None")
    s.assert_true(any("Market" in r for r in g.reasons), "reason mentions market pending")
    os.unlink(overrides)


def test_market_lines_populated_when_present(s: Suite):
    print(f"\n  {BLUE}─── market spread / moneyline populate when caller passes real odds ───{RESET}")
    overrides = _temp_overrides({
        "g": {"round":"WCF","gameNumber":2,"seriesShort":"X-Y",
              "homeTeam":"OKC","awayTeam":"SA"},
    })
    game = {"gameId":"g","homeTeamAbbr":"OKC","awayTeamAbbr":"SA"}
    # 10 contributors per team so we can test the "high" confidence path.
    leans = []
    for i in range(10):
        leans.append(_lean(100+i,f"O{i}","PTS","Over",20,22,5,"High","OKC","Home","g"))
        leans.append(_lean(200+i,f"S{i}","PTS","Over",18,20,5,"High","SA","Away","g"))
    odds = {"g": {"spread": -4.5, "moneyline": {"home": -180, "away": +160}}}
    g = TP.project_game(sport="NBA", date="2026-05-20", game=game,
                        leans=leans, odds_lines=odds,
                        overrides_path=overrides, now=FROZEN_NOW)
    s.assert_close(g.marketSpread, -4.5, 1e-9, "spread populated")
    s.assert_eq(g.marketMoneyline, {"home": -180, "away": 160}, "moneyline populated")
    # High confidence requires: 10+ per team + playoff override + market line
    s.assert_eq(g.confidence, "high", "confidence high path reached")
    os.unlink(overrides)


def test_confidence_low_with_thin_sample(s: Suite):
    print(f"\n  {BLUE}─── confidence stays 'low' when fewer than 6 per team ───{RESET}")
    overrides = _temp_overrides({
        "g": {"round":"WCF","gameNumber":2,"seriesShort":"S",
              "homeTeam":"A","awayTeam":"B"},
    })
    game = {"gameId":"g","homeTeamAbbr":"A","awayTeamAbbr":"B"}
    leans = [_lean(1,"Star","PTS","Over",20,25,5,"High","A","Home","g")]
    g = TP.project_game(sport="NBA", date="2026-05-20", game=game,
                        leans=leans, overrides_path=overrides, now=FROZEN_NOW)
    s.assert_eq(g.confidence, "low", "tiny sample → low")
    os.unlink(overrides)


def test_confidence_low_without_playoff_override(s: Suite):
    print(f"\n  {BLUE}─── confidence 'low' when no playoff override exists ───{RESET}")
    overrides = _temp_overrides({})  # empty
    game = {"gameId":"g","homeTeamAbbr":"A","awayTeamAbbr":"B"}
    leans = []
    for i in range(8):
        leans.append(_lean(100+i,f"O{i}","PTS","Over",20,22,5,"High","A","Home","g"))
        leans.append(_lean(200+i,f"S{i}","PTS","Over",18,20,5,"High","B","Away","g"))
    g = TP.project_game(sport="NBA", date="2026-05-20", game=game,
                        leans=leans, overrides_path=overrides, now=FROZEN_NOW)
    s.assert_eq(g.confidence, "low", "no override → low even with 8 contributors")
    os.unlink(overrides)


def test_empty_leans_zero_margin_no_winner(s: Suite):
    print(f"\n  {BLUE}─── empty leans → zero margin, no winner ───{RESET}")
    overrides = _temp_overrides({})
    game = {"gameId":"g","homeTeamAbbr":"A","awayTeamAbbr":"B"}
    g = TP.project_game(sport="NBA", date="2026-05-20", game=game,
                        leans=[], overrides_path=overrides, now=FROZEN_NOW)
    s.assert_close(g.projectedMargin, 0.0, 1e-9, "margin 0")
    s.assert_eq(g.projectedWinner, None, "no winner")
    s.assert_eq(g.home.projectedPts, 0.0, "home 0 PTS")
    s.assert_eq(g.away.projectedPts, 0.0, "away 0 PTS")
    os.unlink(overrides)


def test_project_board_iterates_games(s: Suite):
    print(f"\n  {BLUE}─── project_board iterates every game ───{RESET}")
    overrides = _temp_overrides({})
    board = {
        "games": [
            {"gameId":"g1","homeTeamAbbr":"A","awayTeamAbbr":"B"},
            {"gameId":"g2","homeTeamAbbr":"C","awayTeamAbbr":"D"},
        ],
        "leans": [
            _lean(1,"X","PTS","Over",20,25,5,"High","A","Home","g1"),
            _lean(2,"Y","PTS","Over",18,20,5,"High","B","Away","g1"),
            _lean(3,"Z","PTS","Over",15,17,5,"High","C","Home","g2"),
        ],
    }
    projs = TP.project_board(sport="NBA", date="2026-05-20", board=board,
                             overrides_path=overrides, now=FROZEN_NOW)
    s.assert_eq(len(projs), 2, "2 games projected")
    s.assert_eq(projs[0].gameId, "g1", "first game id")
    s.assert_eq(projs[1].gameId, "g2", "second game id")
    os.unlink(overrides)


def test_artifact_round_trip(s: Suite):
    print(f"\n  {BLUE}─── write_team_projection_artifact JSON round-trips ───{RESET}")
    overrides = _temp_overrides({})
    game = {"gameId":"g","homeTeamAbbr":"A","awayTeamAbbr":"B"}
    leans = [_lean(1,"X","PTS","Over",20,25,5,"High","A","Home","g")]
    proj = TP.project_game(sport="NBA", date="2026-05-20", game=game,
                           leans=leans, overrides_path=overrides, now=FROZEN_NOW)
    with tempfile.TemporaryDirectory() as tmp:
        path = TP.write_team_projection_artifact(
            date="2026-05-20", projections=[proj], out_dir=tmp,
        )
        s.assert_true(os.path.exists(path), "artifact file exists")
        with open(path) as f:
            payload = json.load(f)
        s.assert_eq(payload["sport"], "NBA", "sport echoed")
        s.assert_eq(payload["date"], "2026-05-20", "date echoed")
        s.assert_eq(len(payload["games"]), 1, "1 game")
        s.assert_eq(payload["games"][0]["matchup"], "B @ A", "matchup string")
        s.assert_true("_disclaimer" in payload, "disclaimer present")
    os.unlink(overrides)


def test_static_roster_rescues_when_players_json_also_empty(s: Suite):
    """The May 20 production reality: lean.team='' AND
    players.json.team=''. The static team_rosters map must rescue
    SAS players by name."""
    print(f"\n  {BLUE}─── static roster rescues when players.json also empty ───{RESET}")
    overrides = _temp_overrides({
        "g": {"round":"WCF","gameNumber":2,"seriesShort":"SA-OKC",
              "homeTeam":"OKC","awayTeam":"SA"},
    })
    game = {"gameId":"g","homeTeamAbbr":"OKC","awayTeamAbbr":"SA"}
    # Real player names — present in pipeline/team_rosters.py.
    # ≥3 per side so the dataQualityFlag is cleared.
    def real(pid, name, proj):
        return {"playerId":pid,"playerName":name,"market":"PTS",
                "lean":"Over","line":10,"projection":proj,"edgePct":5,
                "confidence":"High","team":"","homeAway":"Home","gameId":"g"}
    leans = [
        real(1001, "Shai Gilgeous-Alexander", 30.0),
        real(1002, "Chet Holmgren",            20.0),
        real(1003, "Jalen Williams",           16.0),
        real(2001, "Victor Wembanyama",        28.0),
        real(2002, "Stephon Castle",           16.0),
        real(2003, "Devin Vassell",            12.0),
    ]
    # No player_team_map (simulates the players.json bug)
    g = TP.project_game(sport="NBA", date="2026-05-20", game=game,
                        leans=leans, overrides_path=overrides, now=FROZEN_NOW)
    s.assert_close(g.home.projectedPts, 66.0, 1e-6,
                   "OKC rescued: Shai 30 + Chet 20 + Williams 16 = 66")
    s.assert_close(g.away.projectedPts, 56.0, 1e-6,
                   "SA rescued: Wemby 28 + Castle 16 + Vassell 12 = 56")
    s.assert_eq(g.home.contributingPlayerCount, 3, "3 OKC contributors")
    s.assert_eq(g.away.contributingPlayerCount, 3, "3 SA contributors")
    s.assert_eq(g.dataQualityFlag, None, "no data-quality flag — full coverage")
    s.assert_eq(g.publicDisplayMode, "full",
                "full display mode now that both sides resolved")
    os.unlink(overrides)


def test_static_roster_does_not_misattribute_unknown(s: Suite):
    print(f"\n  {BLUE}─── static roster returns None for unknown players ───{RESET}")
    overrides = _temp_overrides({
        "g": {"round":"WCF","gameNumber":2,"seriesShort":"SA-OKC",
              "homeTeam":"OKC","awayTeam":"SA"},
    })
    game = {"gameId":"g","homeTeamAbbr":"OKC","awayTeamAbbr":"SA"}
    # Player not in any roster — must NOT be assigned a team
    leans = [
        {"playerId":9999,"playerName":"Unknown Mystery Player",
         "market":"PTS","lean":"Over","line":10,"projection":12,
         "edgePct":5,"confidence":"High","team":"","homeAway":"Home","gameId":"g"},
    ]
    g = TP.project_game(sport="NBA", date="2026-05-20", game=game,
                        leans=leans, overrides_path=overrides, now=FROZEN_NOW)
    # Player gets dropped — no contributors on either side
    s.assert_eq(g.home.contributingPlayerCount, 0,
                "unknown player NOT misattributed to home")
    s.assert_eq(g.away.contributingPlayerCount, 0,
                "unknown player NOT misattributed to away")
    os.unlink(overrides)


def test_player_team_map_rescues_empty_team_field(s: Suite):
    """The May 19/20 production bug: every NY-side / SA-side lean
    arrived with team="" AND homeAway misdirected. The roster map
    must rescue them."""
    print(f"\n  {BLUE}─── player_team_map rescues empty team + bad homeAway ───{RESET}")
    overrides = _temp_overrides({
        "g": {"round":"WCF","gameNumber":2,"seriesShort":"SA-OKC",
              "homeTeam":"OKC","awayTeam":"SA"},
    })
    game = {"gameId":"g","homeTeamAbbr":"OKC","awayTeamAbbr":"SA"}
    # Simulates the bug: every lean has empty team, and homeAway is
    # wrongly stamped "Home" for SA players too (pipeline default).
    leans = [
        _lean(1001,"Shai","PTS","Over",27.5,30.0,5,"High","","Home","g"),
        _lean(1002,"Holmgren","PTS","Over",17.5,20.0,5,"High","","Home","g"),
        _lean(2001,"Wemby","PTS","Over",25.5,28.0,5,"High","","Home","g"),
        _lean(2002,"Castle","PTS","Over",14.5,16.0,5,"High","","Home","g"),
    ]
    # Roster map carries the real team attribution.
    roster = {1001: "OKC", 1002: "OKC", 2001: "SA", 2002: "SA"}
    g = TP.project_game(sport="NBA", date="2026-05-20", game=game,
                        leans=leans, player_team_map=roster,
                        overrides_path=overrides, now=FROZEN_NOW)
    s.assert_close(g.home.projectedPts, 50.0, 1e-6, "OKC rescued via roster (30+20=50)")
    s.assert_close(g.away.projectedPts, 44.0, 1e-6, "SA rescued via roster (28+16=44)")
    s.assert_eq(g.home.contributingPlayerCount, 2, "OKC 2 contributors")
    s.assert_eq(g.away.contributingPlayerCount, 2, "SA 2 contributors")
    s.assert_eq(g.projectedWinner, "OKC", "OKC wins by 6")
    os.unlink(overrides)


def test_data_quality_flag_fires_when_one_side_is_thin(s: Suite):
    print(f"\n  {BLUE}─── dataQualityFlag fires when one side has <3 contributors ───{RESET}")
    overrides = _temp_overrides({
        "g": {"round":"WCF","gameNumber":2,"seriesShort":"SA-OKC",
              "homeTeam":"OKC","awayTeam":"SA"},
    })
    game = {"gameId":"g","homeTeamAbbr":"OKC","awayTeamAbbr":"SA"}
    # 5 OKC players, 0 SA — simulates the May 20 production bug
    leans = [
        _lean(i,f"O{i}","PTS","Over",20,22,5,"High","OKC","Home","g")
        for i in range(1, 6)
    ]
    g = TP.project_game(sport="NBA", date="2026-05-20", game=game,
                        leans=leans, overrides_path=overrides, now=FROZEN_NOW)
    s.assert_eq(g.dataQualityFlag, "team_attribution_partial",
                "flag set when SA side has 0 contributors")
    s.assert_eq(g.confidence, "low", "data-quality flag forces low confidence")
    s.assert_true(
        any("Data-quality flag" in r for r in g.reasons),
        "reason mentions data-quality flag",
    )
    os.unlink(overrides)


def test_data_quality_flag_not_set_when_both_sides_ok(s: Suite):
    print(f"\n  {BLUE}─── dataQualityFlag stays None when both sides have ≥3 ───{RESET}")
    overrides = _temp_overrides({
        "g": {"round":"WCF","gameNumber":2,"seriesShort":"X",
              "homeTeam":"A","awayTeam":"B"},
    })
    game = {"gameId":"g","homeTeamAbbr":"A","awayTeamAbbr":"B"}
    leans = []
    for i in range(4):
        leans.append(_lean(100+i,f"H{i}","PTS","Over",20,22,5,"High","A","Home","g"))
        leans.append(_lean(200+i,f"V{i}","PTS","Over",18,20,5,"High","B","Away","g"))
    g = TP.project_game(sport="NBA", date="2026-05-20", game=game,
                        leans=leans, overrides_path=overrides, now=FROZEN_NOW)
    s.assert_eq(g.dataQualityFlag, None, "no flag when both sides ≥3")
    os.unlink(overrides)


def test_load_player_team_map_round_trip(s: Suite):
    print(f"\n  {BLUE}─── load_player_team_map reads players.json shape ───{RESET}")
    fd, path = tempfile.mkstemp(suffix=".json"); os.close(fd)
    payload = {
        "generatedAt": "2026-05-20",
        "players": [
            {"playerId": 1001, "playerName": "Shai", "team": "OKC"},
            {"playerId": 2001, "playerName": "Wemby", "team": "SA"},
            # malformed row — must be skipped, not crash
            {"playerName": "no id"},
            "not a dict",
        ],
    }
    with open(path, "w") as f:
        json.dump(payload, f)
    m = TP.load_player_team_map(path=path)
    s.assert_eq(m, {1001: "OKC", 2001: "SA"}, "2 valid rows extracted, malformed dropped")
    os.unlink(path)

    # missing file → empty map, no crash
    m2 = TP.load_player_team_map(path="/tmp/__nope_for_test.json")
    s.assert_eq(m2, {}, "missing file → empty map")


def test_public_display_mode_withheld_on_partial(s: Suite):
    """May 20 SA-side bug pattern: 0 SA contributors → must withhold
    public score / margin / winner."""
    print(f"\n  {BLUE}─── publicDisplayMode='withheld' when data-quality flag fires ───{RESET}")
    overrides = _temp_overrides({
        "g": {"round":"WCF","gameNumber":2,"seriesShort":"SA-OKC",
              "homeTeam":"OKC","awayTeam":"SA"},
    })
    game = {"gameId":"g","homeTeamAbbr":"OKC","awayTeamAbbr":"SA"}
    leans = [
        _lean(i,f"O{i}","PTS","Over",20,22,5,"High","OKC","Home","g")
        for i in range(1, 6)  # 5 OKC, 0 SA
    ]
    g = TP.project_game(sport="NBA", date="2026-05-20", game=game,
                        leans=leans, overrides_path=overrides, now=FROZEN_NOW)
    s.assert_eq(g.publicDisplayMode, "withheld",
                "data-quality flag → withheld")
    s.assert_eq(g.dataQualityFlag, "team_attribution_partial",
                "flag still set on artifact")
    # The artifact still carries raw diagnostics — the UI is what
    # suppresses them. Verify diagnostics are present so future audits
    # can reconstruct the situation.
    s.assert_true(g.home.projectedPts > 0,
                  "raw home PTS still in artifact for audit")
    s.assert_eq(g.away.projectedPts, 0.0,
                "raw away PTS still in artifact for audit")
    os.unlink(overrides)


def test_public_display_mode_full_when_clean(s: Suite):
    print(f"\n  {BLUE}─── publicDisplayMode='full' when both sides clean ───{RESET}")
    overrides = _temp_overrides({
        "g": {"round":"ECF","gameNumber":2,"seriesShort":"CLE-NY",
              "homeTeam":"NY","awayTeam":"CLE"},
    })
    game = {"gameId":"g","homeTeamAbbr":"NY","awayTeamAbbr":"CLE"}
    leans = []
    for i in range(4):
        leans.append(_lean(100+i,f"N{i}","PTS","Over",20,22,5,"High","NY","Home","g"))
        leans.append(_lean(200+i,f"C{i}","PTS","Over",18,20,5,"High","CLE","Away","g"))
    g = TP.project_game(sport="NBA", date="2026-05-21", game=game,
                        leans=leans, overrides_path=overrides, now=FROZEN_NOW)
    s.assert_eq(g.publicDisplayMode, "full",
                "both sides have >=4 contributors → full display")
    s.assert_eq(g.dataQualityFlag, None, "no quality flag")
    s.assert_true(g.projectedMargin != 0, "raw margin available for full display")
    os.unlink(overrides)


def test_public_display_mode_helper_function(s: Suite):
    print(f"\n  {BLUE}─── derive_public_display_mode helper covers all cases ───{RESET}")
    # explicit flag → withheld
    s.assert_eq(
        TP.derive_public_display_mode(
            home_contributors=8, away_contributors=8,
            data_quality_flag="team_attribution_partial",
        ),
        "withheld",
        "explicit flag forces withheld",
    )
    # zero on either side → withheld
    s.assert_eq(
        TP.derive_public_display_mode(
            home_contributors=8, away_contributors=0,
            data_quality_flag=None,
        ),
        "withheld",
        "zero away → withheld",
    )
    s.assert_eq(
        TP.derive_public_display_mode(
            home_contributors=0, away_contributors=5,
            data_quality_flag=None,
        ),
        "withheld",
        "zero home → withheld",
    )
    # clean case → full
    s.assert_eq(
        TP.derive_public_display_mode(
            home_contributors=5, away_contributors=5,
            data_quality_flag=None,
        ),
        "full",
        "both sides positive + no flag → full",
    )


def test_market_lines_remain_pending_when_unavailable(s: Suite):
    """A clean-coverage game with no market odds on disk still
    reports market lines as None."""
    print(f"\n  {BLUE}─── market lines stay pending when odds absent ───{RESET}")
    overrides = _temp_overrides({
        "g": {"round":"ECF","gameNumber":2,"seriesShort":"CLE-NY",
              "homeTeam":"NY","awayTeam":"CLE"},
    })
    game = {"gameId":"g","homeTeamAbbr":"NY","awayTeamAbbr":"CLE"}
    leans = []
    for i in range(4):
        leans.append(_lean(100+i,f"N{i}","PTS","Over",20,22,5,"High","NY","Home","g"))
        leans.append(_lean(200+i,f"C{i}","PTS","Over",18,20,5,"High","CLE","Away","g"))
    g = TP.project_game(sport="NBA", date="2026-05-21", game=game,
                        leans=leans, odds_lines=None,
                        overrides_path=overrides, now=FROZEN_NOW)
    s.assert_eq(g.marketSpread, None, "spread None")
    s.assert_eq(g.marketMoneyline, None, "moneyline None")
    s.assert_eq(g.publicDisplayMode, "full", "clean game stays full-display")
    s.assert_true(
        any("Market spread" in r for r in g.reasons),
        "reason still mentions market pending",
    )
    os.unlink(overrides)


def test_does_not_mutate_player_leans(s: Suite):
    """The team-projection module must NEVER write back to the player
    leans — it's a pure read aggregator. Verify the input leans match
    after projection."""
    print(f"\n  {BLUE}─── team_projection does not mutate player leans ───{RESET}")
    overrides = _temp_overrides({})
    game = {"gameId":"g","homeTeamAbbr":"A","awayTeamAbbr":"B"}
    original = _lean(1,"X","PTS","Over",20,25,5,"High","A","Home","g")
    snapshot = dict(original)
    TP.project_game(sport="NBA", date="2026-05-20", game=game,
                    leans=[original], overrides_path=overrides, now=FROZEN_NOW)
    s.assert_eq(original, snapshot, "lean dict unchanged after projection")
    os.unlink(overrides)


def main():
    s = Suite()
    for t in (
        test_basic_margin_and_winner,
        test_duplicate_player_market_dedupes,
        test_unattributed_lean_dropped_no_homeaway_fallback,
        test_only_PTS_market_counts,
        test_no_play_excluded,
        test_market_lines_never_fabricated,
        test_market_lines_populated_when_present,
        test_confidence_low_with_thin_sample,
        test_confidence_low_without_playoff_override,
        test_empty_leans_zero_margin_no_winner,
        test_project_board_iterates_games,
        test_artifact_round_trip,
        test_player_team_map_rescues_empty_team_field,
        test_static_roster_rescues_when_players_json_also_empty,
        test_static_roster_does_not_misattribute_unknown,
        test_data_quality_flag_fires_when_one_side_is_thin,
        test_data_quality_flag_not_set_when_both_sides_ok,
        test_public_display_mode_withheld_on_partial,
        test_public_display_mode_full_when_clean,
        test_public_display_mode_helper_function,
        test_market_lines_remain_pending_when_unavailable,
        test_load_player_team_map_round_trip,
        test_does_not_mutate_player_leans,
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
