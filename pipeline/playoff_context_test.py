"""Tests for pipeline.playoff_context.

Pure unit tests. Every assertion exercises a real boundary the rest of
the system depends on:

  * `is_playoff` flips on the same cutoff date as `game_context.py`
  * Missing override entry → all override-only fields are `None`
  * Override entry populates round / gameNumber / homeTeam / etc.
  * `priorGameInSeries` resolves Game 2 → Game 1 of the same series
  * `priorGameInSeries` returns `None` for Game 1
  * `is_home_for(team)` works for known + unknown teams
  * Malformed override file → graceful fallback
  * Bad date input → ValueError

Run: python -m pipeline.playoff_context_test
"""
from __future__ import annotations

import json
import os
import sys
import tempfile

from . import playoff_context as PC


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
            self.failed += 1; self.failures.append(f"{name}: condition false")
            print(f"  {RED}✗{RESET} {name}")


def _temp_overrides(games: dict) -> str:
    """Write an override JSON to a tempfile and return its path."""
    fd, path = tempfile.mkstemp(prefix="playoff_overrides_", suffix=".json")
    os.close(fd)
    with open(path, "w") as f:
        json.dump({"_disclaimer": "test fixture", "games": games}, f)
    return path


def test_is_playoff_cutoff(s: Suite):
    print(f"\n  {BLUE}─── is_playoff cutoff matches game_context.py ───{RESET}")
    pre = PC.derive_playoff_context(game_id="x", date_iso="2026-04-17")
    on  = PC.derive_playoff_context(game_id="x", date_iso="2026-04-18")
    post = PC.derive_playoff_context(game_id="x", date_iso="2026-05-20")
    s.assert_eq(pre.isPlayoff, False, "2026-04-17 → regular season")
    s.assert_eq(pre.seasonPhase, "regular_season", "pre seasonPhase")
    s.assert_eq(on.isPlayoff, True, "2026-04-18 → playoff (boundary)")
    s.assert_eq(post.isPlayoff, True, "later May still playoff")


def test_missing_override_keeps_fields_none(s: Suite):
    print(f"\n  {BLUE}─── unknown gameId → override fields stay None ───{RESET}")
    path = _temp_overrides({})  # empty override map
    ctx = PC.derive_playoff_context(
        game_id="999999",
        date_iso="2026-05-20",
        overrides_path=path,
    )
    s.assert_eq(ctx.round, None, "round None")
    s.assert_eq(ctx.gameNumber, None, "gameNumber None")
    s.assert_eq(ctx.seriesShort, None, "seriesShort None")
    s.assert_eq(ctx.homeTeam, None, "homeTeam None")
    s.assert_eq(ctx.awayTeam, None, "awayTeam None")
    s.assert_eq(ctx.priorGameInSeries, None, "priorGameInSeries None")
    s.assert_eq(ctx.eliminationFlag, None, "eliminationFlag None")
    # but the date-derived fields are always populated
    s.assert_eq(ctx.isPlayoff, True, "isPlayoff still True")
    os.unlink(path)


def test_known_game_populates_fields(s: Suite):
    print(f"\n  {BLUE}─── known gameId → fields populated from override ───{RESET}")
    path = _temp_overrides({
        "401873198": {
            "round": "WCF", "gameNumber": 2, "seriesShort": "SA-OKC",
            "eliminationFlag": False,
            "homeTeam": "OKC", "awayTeam": "SA",
            "notes": "Game 2 of best-of-7",
        },
    })
    ctx = PC.derive_playoff_context(
        game_id="401873198",
        date_iso="2026-05-20",
        overrides_path=path,
    )
    s.assert_eq(ctx.round, "WCF", "round WCF")
    s.assert_eq(ctx.gameNumber, 2, "gameNumber 2")
    s.assert_eq(ctx.seriesShort, "SA-OKC", "seriesShort")
    s.assert_eq(ctx.homeTeam, "OKC", "homeTeam OKC")
    s.assert_eq(ctx.awayTeam, "SA", "awayTeam SA")
    s.assert_eq(ctx.eliminationFlag, False, "eliminationFlag False")
    s.assert_eq(ctx.notes, "Game 2 of best-of-7", "notes")
    # Game 1 not in override → priorGameInSeries None
    s.assert_eq(ctx.priorGameInSeries, None, "no prior game (single-game override)")
    os.unlink(path)


def test_prior_game_resolution(s: Suite):
    print(f"\n  {BLUE}─── priorGameInSeries resolves Game 2 → Game 1 ───{RESET}")
    path = _temp_overrides({
        "g1": {
            "round": "ECF", "gameNumber": 1, "seriesShort": "CLE-NY",
            "homeTeam": "NY", "awayTeam": "CLE",
        },
        "g2": {
            "round": "ECF", "gameNumber": 2, "seriesShort": "CLE-NY",
            "homeTeam": "NY", "awayTeam": "CLE",
        },
        # different series — must NOT match
        "x1": {
            "round": "WCF", "gameNumber": 1, "seriesShort": "SA-OKC",
            "homeTeam": "OKC", "awayTeam": "SA",
        },
    })
    g2 = PC.derive_playoff_context(
        game_id="g2", date_iso="2026-05-21", overrides_path=path
    )
    s.assert_eq(g2.priorGameInSeries, "g1", "Game 2 → prior g1")

    g1 = PC.derive_playoff_context(
        game_id="g1", date_iso="2026-05-19", overrides_path=path
    )
    s.assert_eq(g1.priorGameInSeries, None, "Game 1 → no prior")

    x1 = PC.derive_playoff_context(
        game_id="x1", date_iso="2026-05-18", overrides_path=path
    )
    s.assert_eq(x1.priorGameInSeries, None, "different series, Game 1 → no prior")
    os.unlink(path)


def test_is_home_for(s: Suite):
    print(f"\n  {BLUE}─── is_home_for() works for known teams ───{RESET}")
    path = _temp_overrides({
        "401873342": {
            "round": "ECF", "gameNumber": 2, "seriesShort": "CLE-NY",
            "homeTeam": "NY", "awayTeam": "CLE",
        },
    })
    ctx = PC.derive_playoff_context(
        game_id="401873342", date_iso="2026-05-21", overrides_path=path
    )
    s.assert_eq(ctx.is_home_for("NY"), True, "NY → home")
    s.assert_eq(ctx.is_home_for("CLE"), False, "CLE → away")
    s.assert_eq(ctx.is_home_for("BOS"), None, "unknown team → None")
    s.assert_eq(ctx.is_home_for(""), None, "empty team → None")
    s.assert_eq(ctx.is_home_for(None), None, "None team → None")
    os.unlink(path)


def test_is_home_for_unknown_game(s: Suite):
    print(f"\n  {BLUE}─── is_home_for() with unknown gameId → always None ───{RESET}")
    ctx = PC.derive_playoff_context(
        game_id="unmapped", date_iso="2026-05-20",
        overrides_path=_temp_overrides({}),
    )
    s.assert_eq(ctx.is_home_for("OKC"), None, "no homeTeam → None for any team")


def test_malformed_override(s: Suite):
    print(f"\n  {BLUE}─── malformed override file → graceful fallback ───{RESET}")
    # Path that doesn't exist
    ctx = PC.derive_playoff_context(
        game_id="x", date_iso="2026-05-20",
        overrides_path="/tmp/__does_not_exist_for_test.json",
    )
    s.assert_eq(ctx.round, None, "missing file → round None")
    s.assert_eq(ctx.isPlayoff, True, "missing file → date fields still populated")

    # Path that exists but is not JSON
    fd, bad = tempfile.mkstemp(suffix=".json"); os.close(fd)
    with open(bad, "w") as f:
        f.write("this is not json {")
    ctx2 = PC.derive_playoff_context(
        game_id="x", date_iso="2026-05-20", overrides_path=bad
    )
    s.assert_eq(ctx2.round, None, "malformed JSON → round None")
    os.unlink(bad)


def test_to_dict_shape(s: Suite):
    print(f"\n  {BLUE}─── to_dict shape is stable ───{RESET}")
    ctx = PC.derive_playoff_context(
        game_id="x", date_iso="2026-05-20",
        overrides_path=_temp_overrides({}),
    )
    keys = set(ctx.to_dict().keys())
    expected = {
        "gameId","dateIso","isPlayoff","seasonPhase",
        "round","gameNumber","seriesShort","eliminationFlag",
        "homeTeam","awayTeam","priorGameInSeries","notes",
    }
    s.assert_eq(keys, expected, "all 12 schema keys present")


def test_bad_date_raises(s: Suite):
    print(f"\n  {BLUE}─── bad date raises rather than silently defaulting ───{RESET}")
    raised = False
    try:
        PC.derive_playoff_context(game_id="x", date_iso="not-a-date")
    except ValueError:
        raised = True
    s.assert_true(raised, "ValueError on garbage input")


def test_real_override_file_loads(s: Suite):
    """Sanity: the canonical override file ships valid JSON and at
    least the four documented games we mapped today."""
    print(f"\n  {BLUE}─── canonical pipeline/overrides/playoff_series.json loads ───{RESET}")
    if not os.path.exists(PC.OVERRIDE_PATH):
        print(f"  (skipped — canonical file not present at {PC.OVERRIDE_PATH})")
        return
    ctx_sa = PC.derive_playoff_context(
        game_id="401873198", date_iso="2026-05-20"
    )
    s.assert_eq(ctx_sa.round, "WCF", "SA @ OKC May 20 → WCF")
    s.assert_eq(ctx_sa.gameNumber, 2, "→ Game 2")
    s.assert_eq(ctx_sa.homeTeam, "OKC", "OKC is home")
    s.assert_eq(ctx_sa.awayTeam, "SA", "SA is away")

    ctx_ny = PC.derive_playoff_context(
        game_id="401873342", date_iso="2026-05-21"
    )
    s.assert_eq(ctx_ny.round, "ECF", "CLE @ NY May 21 → ECF")
    s.assert_eq(ctx_ny.gameNumber, 2, "→ Game 2")
    s.assert_eq(ctx_ny.priorGameInSeries, "401873341",
                "Game 2 → prior is May 19 gameId")


def main():
    s = Suite()
    for t in (
        test_is_playoff_cutoff,
        test_missing_override_keeps_fields_none,
        test_known_game_populates_fields,
        test_prior_game_resolution,
        test_is_home_for,
        test_is_home_for_unknown_game,
        test_malformed_override,
        test_to_dict_shape,
        test_bad_date_raises,
        test_real_override_file_loads,
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
