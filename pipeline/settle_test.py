"""
Phase 7C — deterministic tests for pipeline.settle_results.

Zero network. Zero file writes outside a temp scratch path. Verifies:
  - Over win / loss / push
  - Under win / loss / push
  - Missing line  → invalid
  - Missing stat  → stats_unavailable
  - Unsupported market → invalid
  - "No Play" / "Pass" rows are SKIPPED (not in output)
  - Manual override file parsing (well-formed, malformed, wrong date,
    missing fields, non-numeric values)
  - Override matching by (name, team) and fallback to (name, None)
  - Idempotent re-run: settling same date twice → exactly one set of
    rows in settled_leans.jsonl, other dates preserved
  - Comparison report aggregation: hit rate, push exclusion, by-market /
    by-confidence buckets, sample-size warning, projection-error stats

Run:  python -m pipeline.settle_test
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

# Color tags
GREEN = "\033[0;32m"
RED = "\033[0;31m"
DIM = "\033[2m"
BLUE = "\033[0;34m"
GOLD = "\033[0;33m"
RESET = "\033[0m"


# ---------------------------------------------------------------------------
# Import the pure functions from settle_results
# ---------------------------------------------------------------------------
from . import settle_results as SR


# ---------------------------------------------------------------------------
# Suite
# ---------------------------------------------------------------------------
class Suite:
    def __init__(self) -> None:
        self.passed = 0
        self.failed = 0
        self.failures: list[str] = []

    def assert_eq(self, actual, expected, name):
        if actual == expected:
            self.passed += 1
            print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            self.failures.append(f"{name}: expected {expected!r}, got {actual!r}")
            print(f"  {RED}✗{RESET} {name}")
            print(f"    expected: {expected!r}")
            print(f"    got:      {actual!r}")

    def assert_close(self, actual, expected, tol, name):
        if actual is None and expected is None:
            ok = True
        elif actual is None or expected is None:
            ok = False
        else:
            ok = abs(float(actual) - float(expected)) <= tol
        if ok:
            self.passed += 1
            print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            self.failures.append(f"{name}: |{actual!r} - {expected!r}| > {tol}")
            print(f"  {RED}✗{RESET} {name}: {actual!r} ≉ {expected!r}")

    def assert_in(self, key, container, name):
        if key in container:
            self.passed += 1
            print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            self.failures.append(f"{name}: {key!r} not in {sorted(container) if hasattr(container, '__iter__') else container}")
            print(f"  {RED}✗{RESET} {name}: {key!r} missing")


# ---------------------------------------------------------------------------
# Lean factory — minimal, deterministic
# ---------------------------------------------------------------------------
def L(
    *,
    side="Over",
    market="PTS",
    line=22.5,
    proj=24.0,
    edge=5.0,
    confidence="High",
    book="draftkings",
    player="Donovan Mitchell",
    pid=1628378,
    team="CLE",
    opp="DET",
    game_id="manual-2026-05-05-DET-CLE",
    date="2026-05-05",
):
    return {
        "date": date,
        "gameId": game_id,
        "playerId": pid,
        "playerName": player,
        "team": team,
        "opponent": opp,
        "homeAway": "Away",
        "tipoff": "7:00 PM ET",
        "market": market,
        "lean": side,
        "line": line,
        "oddsOver": -110,
        "oddsUnder": -110,
        "bookmaker": book,
        "modelProjection": proj,
        "edgePct": edge,
        "confidence": confidence,
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
def test_settlement_rules(s: Suite) -> None:
    print(f"\n  {BLUE}─── Settlement rules (Over/Under × win/loss/push) ───{RESET}")

    # Over wins (final > line)
    r = SR.settle_lean(L(side="Over", line=22.5), 25.0, "test")
    s.assert_eq(r["result"], "win", "Over with final > line → win")

    # Over loses (final < line)
    r = SR.settle_lean(L(side="Over", line=22.5), 20.0, "test")
    s.assert_eq(r["result"], "loss", "Over with final < line → loss")

    # Over push (final == line)
    r = SR.settle_lean(L(side="Over", line=22.5), 22.5, "test")
    s.assert_eq(r["result"], "push", "Over with final == line → push")

    # Under wins (final < line)
    r = SR.settle_lean(L(side="Under", line=22.5), 19.0, "test")
    s.assert_eq(r["result"], "win", "Under with final < line → win")

    # Under loses (final > line)
    r = SR.settle_lean(L(side="Under", line=22.5), 28.0, "test")
    s.assert_eq(r["result"], "loss", "Under with final > line → loss")

    # Under push
    r = SR.settle_lean(L(side="Under", line=22.5), 22.5, "test")
    s.assert_eq(r["result"], "push", "Under with final == line → push")


def test_invalid_and_unavailable(s: Suite) -> None:
    print(f"\n  {BLUE}─── Invalid + stats_unavailable paths ───{RESET}")

    # Missing line
    r = SR.settle_lean(L(line=None), 25.0, "test")
    s.assert_eq(r["result"], "invalid", "missing line → invalid")
    s.assert_in("failureReason", r, "  has failureReason")

    # Non-numeric line
    r = SR.settle_lean(L(line="22.5"), 25.0, "test")
    s.assert_eq(r["result"], "invalid", "string line → invalid")

    # Unsupported market
    r = SR.settle_lean(L(market="STL"), 5.0, "test")
    s.assert_eq(r["result"], "invalid", "market=STL → invalid")

    # Missing final stat
    r = SR.settle_lean(L(), None, "missing")
    s.assert_eq(r["result"], "stats_unavailable", "no final stat → stats_unavailable")

    # No Play side → skipped (None returned)
    r = SR.settle_lean(L(side="No Play"), 25.0, "test")
    s.assert_eq(r, None, "No Play side → row skipped (None)")

    # Pass side → skipped
    r = SR.settle_lean(L(side="Pass"), 25.0, "test")
    s.assert_eq(r, None, "Pass side → row skipped (None)")

    # Random other side → skipped
    r = SR.settle_lean(L(side="Maybe"), 25.0, "test")
    s.assert_eq(r, None, "unknown side → row skipped (None)")


def test_projection_error(s: Suite) -> None:
    print(f"\n  {BLUE}─── Projection error computation ───{RESET}")

    r = SR.settle_lean(L(proj=27.0), 25.0, "test")
    s.assert_close(r["projectionError"], 2.0, 0.001, "proj=27, final=25 → error +2.0")
    s.assert_close(r["absoluteProjectionError"], 2.0, 0.001, "  |error|=2.0")

    r = SR.settle_lean(L(proj=18.0), 25.0, "test")
    s.assert_close(r["projectionError"], -7.0, 0.001, "proj=18, final=25 → error -7.0")
    s.assert_close(r["absoluteProjectionError"], 7.0, 0.001, "  |error|=7.0")

    # No projection → no error fields
    lean = L()
    lean["modelProjection"] = None
    lean["projection"] = None
    r = SR.settle_lean(lean, 25.0, "test")
    s.assert_eq("projectionError" in r, False, "no proj → no projectionError field")


def test_override_loading(s: Suite, tmp_dir: Path) -> None:
    print(f"\n  {BLUE}─── Manual override file parsing ───{RESET}")

    SR.OVERRIDES_PATH = tmp_dir / "results_overrides.json"

    # Well-formed override
    SR.OVERRIDES_PATH.parent.mkdir(parents=True, exist_ok=True)
    SR.OVERRIDES_PATH.write_text(json.dumps({
        "date": "2026-05-05",
        "games": [{
            "gameId": "CLE@DET",
            "players": [
                {"playerName": "Donovan Mitchell", "team": "CLE",
                 "PTS": 27, "REB": 5, "AST": 8},
                {"playerName": "Cade Cunningham", "team": "DET",
                 "PTS": 24, "REB": 5, "AST": 8},
            ],
        }],
    }))

    overrides = SR.load_overrides("2026-05-05")
    s.assert_eq(
        overrides[("donovan mitchell", "CLE")],
        {"PTS": 27.0, "REB": 5.0, "AST": 8.0},
        "well-formed override loads (name, team)",
    )
    s.assert_in(
        ("donovan mitchell", None), overrides,
        "  also keyed by (name, None) fallback",
    )

    # Wrong date → empty
    overrides = SR.load_overrides("2026-05-06")
    s.assert_eq(overrides, {}, "wrong date in override → empty dict")

    # Malformed JSON → empty + no crash
    SR.OVERRIDES_PATH.write_text("{ this is not json")
    overrides = SR.load_overrides("2026-05-05")
    s.assert_eq(overrides, {}, "malformed JSON → empty dict (no crash)")

    # Non-numeric stat → silently skipped
    SR.OVERRIDES_PATH.write_text(json.dumps({
        "date": "2026-05-05",
        "games": [{
            "players": [
                {"playerName": "Test Player", "team": "CLE",
                 "PTS": "27", "REB": 5, "AST": None},
            ],
        }],
    }))
    overrides = SR.load_overrides("2026-05-05")
    s.assert_eq(
        overrides.get(("test player", "CLE")),
        {"REB": 5.0},
        "non-numeric PTS dropped, valid REB kept",
    )

    # File missing → empty
    SR.OVERRIDES_PATH.unlink()
    overrides = SR.load_overrides("2026-05-05")
    s.assert_eq(overrides, {}, "missing override file → empty dict")


def test_resolve_with_overrides(s: Suite, tmp_dir: Path) -> None:
    print(f"\n  {BLUE}─── resolve_final_stat — overrides win ───{RESET}")

    SR.OVERRIDES_PATH = tmp_dir / "results_overrides.json"
    SR.OVERRIDES_PATH.write_text(json.dumps({
        "date": "2026-05-05",
        "games": [{
            "players": [{"playerName": "Donovan Mitchell", "team": "CLE",
                         "PTS": 27, "REB": 5, "AST": 8}],
        }],
    }))
    overrides = SR.load_overrides("2026-05-05")

    # Override wins even when auto-stats also has a value
    auto = {"manual-2026-05-05-DET-CLE": {1628378: {"PTS": 99.0}}}
    val, src = SR.resolve_final_stat(L(market="PTS"), overrides, auto)
    s.assert_eq(val, 27.0, "override 27 beats auto 99")
    s.assert_eq(src, "manual_override", "  source=manual_override")

    # Auto when override is missing for that market
    val, src = SR.resolve_final_stat(L(market="REB"), overrides, auto)
    s.assert_eq(val, 5.0, "REB from override (auto has no REB)")
    s.assert_eq(src, "manual_override", "  source=manual_override")

    # Auto fallback when nothing in override
    auto2 = {"manual-2026-05-05-DET-CLE": {999: {"PTS": 42.0}}}
    val, src = SR.resolve_final_stat(L(player="Other Guy", pid=999), {}, auto2)
    s.assert_eq(val, 42.0, "auto fallback when no override")
    s.assert_eq(src, "nba_api", "  source=nba_api")

    # Nothing matches → missing
    val, src = SR.resolve_final_stat(L(player="Nobody", pid=12345), {}, {})
    s.assert_eq(val, None, "no match → None")
    s.assert_eq(src, "missing", "  source=missing")


def test_idempotent_writes(s: Suite, tmp_dir: Path) -> None:
    print(f"\n  {BLUE}─── Idempotent settled_leans.jsonl writes ───{RESET}")

    SR.SETTLED_PATH = tmp_dir / "settled_leans.jsonl"
    SR.REPORT_DIR = tmp_dir

    # First write: 3 rows for 2026-05-05
    rows_a = [
        {"date": "2026-05-05", "playerName": "A", "result": "win"},
        {"date": "2026-05-05", "playerName": "B", "result": "loss"},
        {"date": "2026-05-05", "playerName": "C", "result": "push"},
    ]
    SR.write_settled_jsonl("2026-05-05", rows_a)
    n = sum(1 for _ in SR.SETTLED_PATH.read_text().splitlines() if _.strip())
    s.assert_eq(n, 3, "first write — 3 rows")

    # Second write: rewrite same date → still 3 rows (no duplication)
    SR.write_settled_jsonl("2026-05-05", rows_a)
    n = sum(1 for _ in SR.SETTLED_PATH.read_text().splitlines() if _.strip())
    s.assert_eq(n, 3, "rewrite same date — still 3 rows (idempotent)")

    # Now add rows for 2026-05-06 — both dates present
    rows_b = [
        {"date": "2026-05-06", "playerName": "X", "result": "win"},
        {"date": "2026-05-06", "playerName": "Y", "result": "win"},
    ]
    SR.write_settled_jsonl("2026-05-06", rows_b)
    n = sum(1 for _ in SR.SETTLED_PATH.read_text().splitlines() if _.strip())
    s.assert_eq(n, 5, "after 05-06 write — 3 + 2 = 5 rows")

    # Re-write 2026-05-05 — 05-06 untouched
    rows_c = [{"date": "2026-05-05", "playerName": "D", "result": "win"}]
    SR.write_settled_jsonl("2026-05-05", rows_c)
    lines = [
        json.loads(l) for l in SR.SETTLED_PATH.read_text().splitlines() if l.strip()
    ]
    s.assert_eq(len(lines), 3, "after rewriting 05-05 — 1 (05-05) + 2 (05-06) = 3")
    dates_now = sorted({r["date"] for r in lines})
    s.assert_eq(dates_now, ["2026-05-05", "2026-05-06"], "  both dates preserved")
    s.assert_eq(
        sum(1 for r in lines if r["date"] == "2026-05-06"), 2,
        "  05-06 rows untouched",
    )


def test_comparison_report(s: Suite) -> None:
    print(f"\n  {BLUE}─── Comparison report aggregation ───{RESET}")

    rows = [
        # 6 wins
        *[{"date": "d", "result": "win", "market": "PTS",
           "confidence": "High", "gameId": "g1", "bookmaker": "dk",
           "playerName": "P", "edgePct": 5.0,
           "projectionError": 1.0, "absoluteProjectionError": 1.0,
           "modelProjection": 24, "finalStat": 23, "side": "Over"}
          for _ in range(6)],
        # 3 losses
        *[{"date": "d", "result": "loss", "market": "PTS",
           "confidence": "High", "gameId": "g1", "bookmaker": "dk",
           "playerName": "P", "edgePct": 4.0,
           "projectionError": -3.0, "absoluteProjectionError": 3.0,
           "modelProjection": 22, "finalStat": 25, "side": "Over"}
          for _ in range(3)],
        # 2 pushes
        *[{"date": "d", "result": "push", "market": "REB",
           "confidence": "Medium", "gameId": "g1", "bookmaker": "fd",
           "playerName": "P", "edgePct": 1.0,
           "projectionError": 0.0, "absoluteProjectionError": 0.0,
           "modelProjection": 5, "finalStat": 5, "side": "Over"}
          for _ in range(2)],
        # 1 stats_unavailable
        {"date": "d", "result": "stats_unavailable", "market": "AST"},
        # 1 invalid
        {"date": "d", "result": "invalid", "market": "STL"},
    ]

    rep = SR.build_comparison_report("d", rows)

    s.assert_eq(rep["totalRows"], 13, "totalRows = all rows including invalid")
    s.assert_eq(rep["totalSettled"], 11, "totalSettled = wins + losses + pushes")
    s.assert_eq(rep["wins"], 6, "wins=6")
    s.assert_eq(rep["losses"], 3, "losses=3")
    s.assert_eq(rep["pushes"], 2, "pushes=2")
    s.assert_eq(rep["decisive"], 9, "decisive = wins + losses (excludes pushes)")
    s.assert_close(rep["hitRate"], 6 / 9, 0.0001, "hit rate = 6/9 (pushes excluded)")

    s.assert_eq(rep["statsUnavailable"], 1, "stats_unavailable counted separately")
    s.assert_eq(rep["invalid"], 1, "invalid counted separately")

    s.assert_in("PTS", rep["byMarket"], "byMarket has PTS bucket")
    s.assert_eq(rep["byMarket"]["PTS"]["wins"], 6, "PTS bucket wins=6")
    s.assert_eq(rep["byMarket"]["PTS"]["losses"], 3, "PTS bucket losses=3")
    s.assert_close(rep["byMarket"]["PTS"]["hitRate"], 6 / 9, 0.0001, "PTS hit rate")

    s.assert_in("REB", rep["byMarket"], "byMarket has REB bucket")
    s.assert_eq(rep["byMarket"]["REB"]["pushes"], 2, "REB pushes=2")
    s.assert_eq(rep["byMarket"]["REB"]["hitRate"], None, "REB hitRate=None (all pushes)")

    s.assert_close(rep["averageProjectionError"], (6 * 1.0 + 3 * -3.0 + 2 * 0.0) / 11, 0.001,
                   "avg projection error")
    s.assert_close(rep["averageAbsoluteProjectionError"], (6 * 1.0 + 3 * 3.0 + 2 * 0.0) / 11, 0.001,
                   "avg |projection error|")

    s.assert_eq(
        rep["sampleSizeWarning"] is not None, True,
        "sample size warning fires below 25 decisive",
    )

    # 30 wins → no warning
    big_rows = [
        {"date": "d", "result": "win", "market": "PTS",
         "confidence": "High", "gameId": "g1", "bookmaker": "dk",
         "playerName": "P", "edgePct": 5.0}
        for _ in range(30)
    ]
    rep2 = SR.build_comparison_report("d", big_rows)
    s.assert_eq(rep2["sampleSizeWarning"], None, "no warning when ≥ 25 decisive")
    s.assert_eq(rep2["hitRate"], 1.0, "30 wins → 100% hit rate")


def test_espn_source(s: Suite, tmp_dir: Path) -> None:
    """ESPN summary box-score fallback — covers playoff days when nba_api
    can't accept the ESPN gameId."""
    print(f"\n  {BLUE}─── ESPN summary fallback ───{RESET}")

    # 1) fetch_final_stats_via_espn parses ESPN payload by name + market
    espn_payload = {
        "header": {
            "competitions": [{
                "status": {"type": {"completed": True, "state": "post"}}
            }]
        },
        "boxscore": {
            "players": [
                {
                    "team": {"abbreviation": "OKC"},
                    "statistics": [{
                        "keys": [
                            "minutes", "points", "fieldGoalsMade-fieldGoalsAttempted",
                            "threePointFieldGoalsMade-threePointFieldGoalsAttempted",
                            "freeThrowsMade-freeThrowsAttempted",
                            "rebounds", "assists", "turnovers", "steals", "blocks",
                            "offensiveRebounds", "defensiveRebounds", "fouls",
                            "plusMinus",
                        ],
                        "athletes": [
                            {
                                "athlete": {"displayName": "Shai Gilgeous-Alexander"},
                                "stats": ["38", "31", "10-22", "3-7", "8-9",
                                          "6", "8", "3", "2", "0",
                                          "0", "6", "2", "+5"],
                                "didNotPlay": False,
                            },
                            {
                                "athlete": {"displayName": "Inactive Guy"},
                                "stats": [],
                                "didNotPlay": True,
                            },
                        ],
                    }],
                },
            ]
        }
    }
    espn = SR.fetch_final_stats_via_espn(
        "401873197", fetch_json=lambda _url: espn_payload,
    )
    s.assert_eq(
        espn.get("shai gilgeous-alexander"),
        # Every family the box score answers, not just the three the old whitelist settled. "3-7"
        # is the combined three-point cell, so 3PM is the MADE side; PRA is the synthesized sum.
        {"PTS": 31.0, "REB": 6.0, "AST": 8.0, "STL": 2.0, "BLK": 0.0, "3PM": 3.0, "PRA": 45.0},
        "ESPN parser keys by lowercased name and extracts every settleable family",
    )
    s.assert_eq("inactive guy" not in espn, True, "DNP players are dropped")

    # 2) Non-final games return None so we never settle against an
    #    in-progress score.
    in_progress = {
        "header": {
            "competitions": [{
                "status": {"type": {"completed": False, "state": "in"}}
            }]
        },
        "boxscore": {"players": []},
    }
    s.assert_eq(
        SR.fetch_final_stats_via_espn(
            "401873197", fetch_json=lambda _u: in_progress,
        ),
        None,
        "non-final game → None (does not settle in-progress)",
    )

    # 3) NBA.com-format gameId (10-digit) is NOT routed to ESPN — that's
    #    the nba_api source's job. Avoids a wasted HTTP call.
    s.assert_eq(
        SR.fetch_final_stats_via_espn(
            "0042500207", fetch_json=lambda _u: espn_payload,
        ),
        None,
        "10-digit NBA.com id is skipped (only 9-digit ESPN ids accepted)",
    )

    # 4) resolve_final_stat reaches ESPN when nba_api auto map is empty
    espn_by_game = {
        "401873197": {"victor wembanyama": {"PTS": 41.0, "REB": 24.0, "AST": 3.0}},
    }
    val, src = SR.resolve_final_stat(
        L(player="Victor Wembanyama", pid=None,
          game_id="401873197", market="PTS"),
        overrides={},
        auto_stats_by_game={},
        espn_stats_by_game=espn_by_game,
    )
    s.assert_eq(val, 41.0, "ESPN PTS resolves by name + gameId")
    s.assert_eq(src, "espn", "  source=espn")

    # 5) Override still beats ESPN
    val, src = SR.resolve_final_stat(
        L(player="Victor Wembanyama", pid=None,
          game_id="401873197", market="PTS", team="SA"),
        overrides={("victor wembanyama", "SA"):
                   {"PTS": 99.0, "REB": 99.0, "AST": 99.0}},
        auto_stats_by_game={},
        espn_stats_by_game=espn_by_game,
    )
    s.assert_eq(val, 99.0, "manual override still wins over ESPN")
    s.assert_eq(src, "manual_override", "  source=manual_override")


def test_settle_for_date_end_to_end(s: Suite, tmp_dir: Path) -> None:
    print(f"\n  {BLUE}─── settle_for_date end-to-end (override-only) ───{RESET}")

    SR.OVERRIDES_PATH = tmp_dir / "results_overrides.json"
    SR.OVERRIDES_PATH.write_text(json.dumps({
        "date": "2026-05-05",
        "games": [{
            "players": [
                {"playerName": "Donovan Mitchell", "team": "CLE",
                 "PTS": 27, "REB": 5, "AST": 8},
                {"playerName": "Cade Cunningham", "team": "DET",
                 "PTS": 19, "REB": 5, "AST": 8},
            ],
        }],
    }))

    leans = [
        # Mitchell PTS Over 22.5 (line 22.5, final 27 → win)
        L(player="Donovan Mitchell", pid=1, team="CLE", opp="DET",
          market="PTS", side="Over", line=22.5, proj=24.0),
        # Cunningham PTS Over 21.5 (final 19 → loss)
        L(player="Cade Cunningham", pid=2, team="DET", opp="CLE",
          market="PTS", side="Over", line=21.5, proj=22.0),
        # Mitchell REB Under 6.5 (final 5 → win)
        L(player="Donovan Mitchell", pid=1, team="CLE", opp="DET",
          market="REB", side="Under", line=6.5, proj=4.5),
        # No Play row → skipped
        L(player="Donovan Mitchell", pid=1, side="No Play"),
        # Player not in override → stats_unavailable
        L(player="Ghost Player", pid=999, side="Over"),
    ]

    rows, summary = SR.settle_for_date("2026-05-05", leans, use_auto=False)

    s.assert_eq(summary["leansRead"], 5, "leansRead = 5")
    s.assert_eq(summary["skippedNoPick"], 1, "skipped 1 No Play")
    s.assert_eq(summary["wins"], 2, "2 wins")
    s.assert_eq(summary["losses"], 1, "1 loss")
    s.assert_eq(summary["statsUnavailable"], 1, "1 stats_unavailable")
    s.assert_eq(len(rows), 4, "4 rows in output (5 - 1 skipped)")


def test_espn_event_id_resolver(s: Suite) -> None:
    """Bridge NBA.com game ids → ESPN event ids by date + team abbrevs,
    so final games still settle when nba_api is unavailable (CI IP block)."""
    print(f"\n  {BLUE}─── ESPN event-id bridge (date + teams) ───{RESET}")

    # Tolerant abbreviation matcher collapses ESPN/board mismatches.
    s.assert_eq(SR._nba_abbr_match("SAS", "SA"), True, "SAS ↔ SA (Spurs)")
    s.assert_eq(SR._nba_abbr_match("GSW", "GS"), True, "GSW ↔ GS (Warriors)")
    s.assert_eq(SR._nba_abbr_match("OKC", "OKC"), True, "exact match")
    s.assert_eq(SR._nba_abbr_match("LAL", "LAC"), False, "LAL ≠ LAC (no false collapse)")
    s.assert_eq(SR._nba_abbr_match("", "OKC"), False, "empty → no match")

    scoreboard = {
        "events": [
            {
                "id": "401873203",
                "competitions": [{
                    "competitors": [
                        {"team": {"abbreviation": "OKC"}},
                        {"team": {"abbreviation": "SA"}},
                    ]
                }],
            },
            {
                "id": "401873299",
                "competitions": [{
                    "competitors": [
                        {"team": {"abbreviation": "BOS"}},
                        {"team": {"abbreviation": "NY"}},
                    ]
                }],
            },
        ]
    }
    fetch = lambda _url: scoreboard

    s.assert_eq(
        SR.resolve_espn_event_id_for_teams(
            "2026-05-30", "OKC", "SAS", fetch_json=fetch),
        "401873203",
        "resolves OKC/SAS → ESPN event id (SAS matches ESPN 'SA')",
    )
    s.assert_eq(
        SR.resolve_espn_event_id_for_teams(
            "2026-05-30", "SAS", "OKC", fetch_json=fetch),
        "401873203",
        "team order is irrelevant",
    )
    s.assert_eq(
        SR.resolve_espn_event_id_for_teams(
            "2026-05-30", "NYK", "BOS", fetch_json=fetch),
        "401873299",
        "resolves NYK/BOS → second event (NYK matches ESPN 'NY')",
    )
    s.assert_eq(
        SR.resolve_espn_event_id_for_teams(
            "2026-05-30", "MIA", "DEN", fetch_json=fetch),
        None,
        "no matching game on date → None (never guesses)",
    )
    s.assert_eq(
        SR.resolve_espn_event_id_for_teams(
            "not-a-date", "OKC", "SAS", fetch_json=fetch),
        None,
        "malformed date → None",
    )
    s.assert_eq(
        SR.resolve_espn_event_id_for_teams(
            "2026-05-30", "OKC", "SAS", fetch_json=lambda _u: None),
        None,
        "scoreboard fetch failure → None (no settle from missing data)",
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> int:
    print()
    print(f"  {GOLD}Phase 7C — settlement tests{RESET}")
    print(f"  {DIM}zero network · zero file writes outside temp scratch{RESET}")

    s = Suite()

    test_settlement_rules(s)
    test_invalid_and_unavailable(s)
    test_projection_error(s)
    test_comparison_report(s)
    test_espn_event_id_resolver(s)

    # Tests that need a temp scratch dir
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        # Save originals
        orig_overrides = SR.OVERRIDES_PATH
        orig_settled = SR.SETTLED_PATH
        orig_reportdir = SR.REPORT_DIR
        try:
            test_override_loading(s, tmp)
            test_resolve_with_overrides(s, tmp)
            test_idempotent_writes(s, tmp)
            test_espn_source(s, tmp)
            test_settle_for_date_end_to_end(s, tmp)
        finally:
            SR.OVERRIDES_PATH = orig_overrides
            SR.SETTLED_PATH = orig_settled
            SR.REPORT_DIR = orig_reportdir

    print()
    if s.failed == 0:
        print(f"  {GREEN}✓ all {s.passed} settlement assertions passed{RESET}")
        print()
        return 0
    print(f"  {RED}✗ {s.failed} of {s.passed + s.failed} settlement assertions FAILED{RESET}")
    for f in s.failures[:10]:
        print(f"  {RED}  {f}{RESET}")
    print()
    return 1


if __name__ == "__main__":
    sys.exit(main())
