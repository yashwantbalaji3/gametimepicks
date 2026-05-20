"""Tests for pipeline.game_context.

Pure unit tests. No filesystem reads. Verifies the schema is stable
and the date-derived fields fire correctly across the calendar
boundaries the module cares about.

Run:  python -m pipeline.game_context_test
"""
from __future__ import annotations

import sys

from . import game_context as GC


GREEN = "\033[0;32m"
RED = "\033[0;31m"
BLUE = "\033[0;34m"
RESET = "\033[0m"


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
            self.failures.append(
                f"{name}: expected {expected!r}, got {actual!r}"
            )
            print(f"  {RED}✗{RESET} {name}")

    def assert_true(self, cond, name):
        if cond:
            self.passed += 1
            print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            self.failures.append(f"{name}: condition was false")
            print(f"  {RED}✗{RESET} {name}")


def test_basic_context_date_parsing(s: Suite) -> None:
    print(f"\n  {BLUE}─── basic context parses YYYY-MM-DD ───{RESET}")
    ctx = GC.derive_basic_context("2026-05-19")
    s.assert_eq(ctx.dateIso, "2026-05-19", "dateIso round-trips")
    s.assert_eq(ctx.month, 5, "month = 5")
    # 2026-05-19 is a Tuesday → weekday() == 1
    s.assert_eq(ctx.dayOfWeek, 1, "Tuesday → dayOfWeek = 1")


def test_basic_context_playoff_boundary(s: Suite) -> None:
    print(f"\n  {BLUE}─── playoff boundary is 2026-04-18 ───{RESET}")
    pre = GC.derive_basic_context("2026-04-17")
    on = GC.derive_basic_context("2026-04-18")
    post = GC.derive_basic_context("2026-05-19")
    s.assert_eq(pre.isPlayoff, False, "2026-04-17 → regular season")
    s.assert_eq(pre.seasonPhase, "regular_season", "regular_season label")
    s.assert_eq(on.isPlayoff, True, "2026-04-18 → playoff (boundary)")
    s.assert_eq(on.seasonPhase, "playoff", "playoff label")
    s.assert_eq(post.isPlayoff, True, "later May still playoff")


def test_placeholder_fields_are_none(s: Suite) -> None:
    print(f"\n  {BLUE}─── series/elimination/pace/park stay None ───{RESET}")
    ctx = GC.derive_basic_context("2026-05-19")
    s.assert_eq(ctx.seriesState, None, "seriesState placeholder")
    s.assert_eq(ctx.eliminationFlag, None, "eliminationFlag placeholder")
    s.assert_eq(ctx.paceProjection, None, "paceProjection placeholder")
    s.assert_eq(ctx.parkFactor, None, "parkFactor placeholder")


def test_to_dict_shape_is_stable(s: Suite) -> None:
    print(f"\n  {BLUE}─── to_dict shape is stable ───{RESET}")
    keys = set(GC.derive_basic_context("2026-05-19").to_dict().keys())
    expected = {
        "dateIso",
        "month",
        "dayOfWeek",
        "isPlayoff",
        "seasonPhase",
        "seriesState",
        "eliminationFlag",
        "paceProjection",
        "parkFactor",
    }
    s.assert_eq(keys, expected, "all 9 schema keys present")


def test_mlb_forces_regular_season(s: Suite) -> None:
    print(f"\n  {BLUE}─── MLB context never inherits NBA playoff flag ───{RESET}")
    ctx = GC.derive_mlb_context("2026-05-19")
    s.assert_eq(ctx.isPlayoff, False, "MLB May → regular season")
    s.assert_eq(ctx.seasonPhase, "regular_season", "MLB seasonPhase")
    # Base date fields still derived correctly
    s.assert_eq(ctx.month, 5, "MLB month still derived")
    s.assert_eq(ctx.dayOfWeek, 1, "MLB dayOfWeek still derived")


def test_nba_matches_basic_for_now(s: Suite) -> None:
    print(f"\n  {BLUE}─── NBA context matches basic context (no upstream wiring yet) ───{RESET}")
    n = GC.derive_nba_context("2026-05-19")
    b = GC.derive_basic_context("2026-05-19")
    s.assert_eq(n.to_dict(), b.to_dict(), "NBA == basic until upstream wiring lands")


def test_bad_date_raises(s: Suite) -> None:
    print(f"\n  {BLUE}─── bad date raises rather than silently defaulting ───{RESET}")
    raised = False
    try:
        GC.derive_basic_context("not-a-date")
    except ValueError:
        raised = True
    s.assert_true(raised, "ValueError on garbage input")


def main() -> int:
    s = Suite()
    for t in (
        test_basic_context_date_parsing,
        test_basic_context_playoff_boundary,
        test_placeholder_fields_are_none,
        test_to_dict_shape_is_stable,
        test_mlb_forces_regular_season,
        test_nba_matches_basic_for_now,
        test_bad_date_raises,
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
