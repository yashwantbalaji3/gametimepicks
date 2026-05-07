"""
Phase 8.1 — deterministic tests for recent10_extractor.

Zero network. Zero file I/O. Validates:
  - PTS / REB / AST extraction
  - Fewer than 10 games available
  - Missing stat key (entry dropped, others kept)
  - Empty logs (returns [])
  - Deterministic ordering (oldest → newest)
  - Multiple games on the same date (stable tiebreak by input index)
  - Unsupported market returns []
  - Non-numeric / NaN values dropped
  - Works with both dict logs AND dataclass-like attribute logs
"""
from __future__ import annotations

import math
import sys
from dataclasses import dataclass

GREEN = "\033[0;32m"
RED = "\033[0;31m"
DIM = "\033[2m"
BLUE = "\033[0;34m"
GOLD = "\033[0;33m"
RESET = "\033[0m"

from .recent10_extractor import (
    extract_recent10,
    extract_recent10_all_markets,
    SUPPORTED_MARKETS,
)


@dataclass
class FakeLog:
    """Mirror of pipeline.providers.base.GameLog (minimal)."""
    game_date: str
    pts: int = 0
    reb: int = 0
    ast: int = 0


class Suite:
    def __init__(self):
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


# ---------------------------------------------------------------------------
# Test data — 12 games for one player, deliberately out of order
# ---------------------------------------------------------------------------
def make_logs() -> list[FakeLog]:
    """12 games — chronologically: 04-15 → 04-26."""
    return [
        FakeLog("2026-04-20", pts=20, reb=4, ast=3),  # in middle
        FakeLog("2026-04-15", pts=10, reb=2, ast=1),  # oldest
        FakeLog("2026-04-26", pts=30, reb=8, ast=10), # newest
        FakeLog("2026-04-22", pts=22, reb=5, ast=4),
        FakeLog("2026-04-25", pts=28, reb=7, ast=9),
        FakeLog("2026-04-23", pts=24, reb=6, ast=5),
        FakeLog("2026-04-21", pts=21, reb=4, ast=3),
        FakeLog("2026-04-19", pts=18, reb=3, ast=2),
        FakeLog("2026-04-18", pts=16, reb=3, ast=2),
        FakeLog("2026-04-17", pts=14, reb=2, ast=1),
        FakeLog("2026-04-16", pts=12, reb=2, ast=1),
        FakeLog("2026-04-24", pts=26, reb=7, ast=8),
    ]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
def test_pts_extraction(s: Suite):
    print(f"\n  {BLUE}─── PTS extraction ───{RESET}")
    logs = make_logs()
    result = extract_recent10(logs, "PTS")
    # Most-recent 10 in oldest→newest order: 16,18,20,21,22,24,26,28,30
    # Wait: we have 12 games. Most-recent 10 starts from 04-17 (drops 04-15, 04-16).
    expected = [16.0, 18.0, 20.0, 21.0, 22.0, 24.0, 26.0, 28.0, 30.0]
    # Hmm, let me recount: 12 games, drop oldest 2 (04-15, 04-16), keep 10.
    # Sorted asc: 04-17(14), 04-18(16), 04-19(18), 04-20(20), 04-21(21),
    #             04-22(22), 04-23(24), 04-24(26), 04-25(28), 04-26(30)
    expected = [14.0, 16.0, 18.0, 20.0, 21.0, 22.0, 24.0, 26.0, 28.0, 30.0]
    s.assert_eq(result, expected, "PTS oldest→newest, 10 most recent")


def test_reb_extraction(s: Suite):
    print(f"\n  {BLUE}─── REB extraction ───{RESET}")
    logs = make_logs()
    result = extract_recent10(logs, "REB")
    expected = [2.0, 3.0, 3.0, 4.0, 4.0, 5.0, 6.0, 7.0, 7.0, 8.0]
    s.assert_eq(result, expected, "REB last 10 sorted oldest→newest")


def test_ast_extraction(s: Suite):
    print(f"\n  {BLUE}─── AST extraction ───{RESET}")
    logs = make_logs()
    result = extract_recent10(logs, "AST")
    expected = [1.0, 2.0, 2.0, 3.0, 3.0, 4.0, 5.0, 8.0, 9.0, 10.0]
    s.assert_eq(result, expected, "AST last 10 sorted oldest→newest")


def test_fewer_than_10_games(s: Suite):
    print(f"\n  {BLUE}─── Fewer than 10 games ───{RESET}")
    logs = [
        FakeLog("2026-04-20", pts=20),
        FakeLog("2026-04-22", pts=24),
        FakeLog("2026-04-21", pts=22),
    ]
    result = extract_recent10(logs, "PTS")
    s.assert_eq(result, [20.0, 22.0, 24.0], "3 games → 3 values, sorted oldest→newest")


def test_empty_logs(s: Suite):
    print(f"\n  {BLUE}─── Empty / None logs ───{RESET}")
    s.assert_eq(extract_recent10([], "PTS"), [], "empty list → []")
    s.assert_eq(extract_recent10(None, "PTS"), [], "None → []")
    s.assert_eq(extract_recent10([], "PTS", last_n=10), [], "empty + last_n explicit → []")


def test_missing_stat_key(s: Suite):
    print(f"\n  {BLUE}─── Missing stat values ───{RESET}")
    logs = [
        {"game_date": "2026-04-20", "pts": 20, "reb": 4, "ast": 3},
        {"game_date": "2026-04-21", "reb": 5, "ast": 2},                # missing pts
        {"game_date": "2026-04-22", "pts": 22, "reb": 5, "ast": 3},
        {"game_date": "2026-04-23", "pts": None, "reb": 6, "ast": 4},   # null pts
        {"game_date": "2026-04-24", "pts": "26", "reb": 7, "ast": 5},   # string pts
        {"game_date": "2026-04-25", "pts": float("nan"), "reb": 8, "ast": 6},  # NaN
    ]
    result = extract_recent10(logs, "PTS")
    s.assert_eq(result, [20.0, 22.0],
                "PTS extraction drops missing/null/string/NaN")
    # REB has all 6 values
    rebs = extract_recent10(logs, "REB")
    s.assert_eq(rebs, [4.0, 5.0, 5.0, 6.0, 7.0, 8.0],
                "REB extraction keeps all 6 valid entries")


def test_unsupported_market(s: Suite):
    print(f"\n  {BLUE}─── Unsupported market ───{RESET}")
    logs = make_logs()
    s.assert_eq(extract_recent10(logs, "STL"), [], "STL → []")
    s.assert_eq(extract_recent10(logs, ""), [], "empty string → []")
    s.assert_eq(extract_recent10(logs, "pts"), [], "lowercase 'pts' → [] (case sensitive)")


def test_dict_inputs(s: Suite):
    print(f"\n  {BLUE}─── Dict inputs (JSON-deserialized logs) ───{RESET}")
    logs = [
        {"game_date": "2026-04-20", "pts": 20, "reb": 4, "ast": 3},
        {"game_date": "2026-04-22", "pts": 22, "reb": 5, "ast": 4},
        {"game_date": "2026-04-21", "pts": 21, "reb": 4, "ast": 3},
    ]
    s.assert_eq(extract_recent10(logs, "PTS"), [20.0, 21.0, 22.0],
                "dict logs work the same as dataclass")


def test_deterministic_ordering(s: Suite):
    print(f"\n  {BLUE}─── Deterministic ordering ───{RESET}")
    logs = make_logs()
    a = extract_recent10(logs, "PTS")
    # Reverse the input — same logs, different input order
    b = extract_recent10(list(reversed(logs)), "PTS")
    s.assert_eq(a, b, "input order does not affect output")

    # Tie on date — input index breaks the tie deterministically
    tied = [
        FakeLog("2026-04-20", pts=20),
        FakeLog("2026-04-20", pts=22),
    ]
    out = extract_recent10(tied, "PTS")
    s.assert_eq(out, [20.0, 22.0],
                "ties broken by input index (first encountered wins)")


def test_invalid_last_n(s: Suite):
    print(f"\n  {BLUE}─── Invalid last_n ───{RESET}")
    logs = make_logs()
    s.assert_eq(extract_recent10(logs, "PTS", last_n=0), [], "last_n=0 → []")
    s.assert_eq(extract_recent10(logs, "PTS", last_n=-5), [], "last_n=-5 → []")
    s.assert_eq(extract_recent10(logs, "PTS", last_n=1.5), [], "non-int last_n → []")
    # Tiny last_n
    out2 = extract_recent10(logs, "PTS", last_n=2)
    s.assert_eq(out2, [28.0, 30.0], "last_n=2 → 2 most-recent values, oldest→newest")


def test_all_markets_helper(s: Suite):
    print(f"\n  {BLUE}─── extract_recent10_all_markets convenience ───{RESET}")
    logs = make_logs()
    result = extract_recent10_all_markets(logs)
    s.assert_eq(set(result.keys()), set(SUPPORTED_MARKETS), "all three markets keyed")
    s.assert_eq(len(result["PTS"]), 10, "PTS has 10 values")
    s.assert_eq(len(result["REB"]), 10, "REB has 10 values")
    s.assert_eq(len(result["AST"]), 10, "AST has 10 values")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> int:
    print()
    print(f"  {GOLD}Phase 8.1 — recent10 extractor tests{RESET}")
    print(f"  {DIM}zero network · zero file I/O{RESET}")

    s = Suite()
    test_pts_extraction(s)
    test_reb_extraction(s)
    test_ast_extraction(s)
    test_fewer_than_10_games(s)
    test_empty_logs(s)
    test_missing_stat_key(s)
    test_unsupported_market(s)
    test_dict_inputs(s)
    test_deterministic_ordering(s)
    test_invalid_last_n(s)
    test_all_markets_helper(s)

    print()
    if s.failed == 0:
        print(f"  {GREEN}✓ all {s.passed} recent10 assertions passed{RESET}\n")
        return 0
    print(f"  {RED}✗ {s.failed} of {s.passed + s.failed} recent10 assertions FAILED{RESET}")
    for f in s.failures[:10]:
        print(f"  {RED}  {f}{RESET}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
