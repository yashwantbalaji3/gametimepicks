"""Sprint 041 — event identity tests for pipeline.mlb.generate_mlb_board.

No network calls. Every case feeds synthetic schedule + market rows through the pure
helpers, plus one case reproducing the exact 2026-07-28 CLE @ CIN doubleheader that
exposed the defect.

THE DEFECT
`_team_lookup_from_schedule` indexed team-name -> single context and assigned with
`lookup[name] = ctx`, silently assuming a team plays at most one game per date. For a
doubleheader the second game overwrote the first, so every market row for that team
inherited ONE gamePk. Measured on 2026-07-28: both provider events mapped to gamePk
824489, gamePk 824490 was simulated but orphaned, and the early game's markets were
joined to the late game's simulation.

Run:
    python3 -m pipeline.mlb.generate_mlb_board_identity_test
"""
from __future__ import annotations

import sys

from pipeline.mlb.generate_mlb_board import (
    _parse_iso,
    _resolve_team_ctx,
    _team_lookup_from_schedule,
)

FAILURES: list[str] = []


def check(cond: bool, msg: str) -> None:
    if not cond:
        FAILURES.append(msg)


def game(pk: int, date: str, home: str, away: str) -> dict:
    return {
        "gamePk": pk,
        "gameDate": date,
        "homeTeamName": home,
        "awayTeamName": away,
        "homeTeamAbbr": home[:3].upper(),
        "awayTeamAbbr": away[:3].upper(),
        "homeTeamId": None,
        "awayTeamId": None,
        "venue": None,
    }


# ── the regression case ────────────────────────────────────────────────────────

def test_doubleheader_keeps_games_separate() -> None:
    """The exact 2026-07-28 CLE @ CIN case, including the 1-minute source skew."""
    games = [
        game(824490, "2026-07-28T17:40:00Z", "Cincinnati Reds", "Cleveland Guardians"),
        game(824489, "2026-07-28T23:10:00Z", "Cincinnati Reds", "Cleveland Guardians"),
    ]
    ctx = _team_lookup_from_schedule(games)

    check(len(ctx["Cincinnati Reds"]) == 2, "both games must be indexed, not overwritten")
    check(len(ctx["Cleveland Guardians"]) == 2, "the away team must index both games too")

    # StatsAPI says 17:40:00Z; the provider says 17:41:00Z. An equality join would fail
    # on exactly the game it most needs to resolve.
    early = _resolve_team_ctx(ctx, "Cincinnati Reds", "2026-07-28T17:41:00Z")
    late = _resolve_team_ctx(ctx, "Cincinnati Reds", "2026-07-28T23:10:00Z")

    check(early.get("gamePk") == 824490, f"early market must resolve to 824490, got {early.get('gamePk')}")
    check(late.get("gamePk") == 824489, f"late market must resolve to 824489, got {late.get('gamePk')}")
    check(early.get("gamePk") != late.get("gamePk"), "Game 1 and Game 2 must not collapse")


def test_injectivity_no_gamepk_claimed_twice() -> None:
    """No two market events may resolve to the same gamePk — the defect's signature."""
    games = [
        game(824490, "2026-07-28T17:40:00Z", "Cincinnati Reds", "Cleveland Guardians"),
        game(824489, "2026-07-28T23:10:00Z", "Cincinnati Reds", "Cleveland Guardians"),
    ]
    ctx = _team_lookup_from_schedule(games)
    resolved = [
        _resolve_team_ctx(ctx, "Cincinnati Reds", "2026-07-28T17:41:00Z").get("gamePk"),
        _resolve_team_ctx(ctx, "Cincinnati Reds", "2026-07-28T23:10:00Z").get("gamePk"),
    ]
    check(len(set(resolved)) == len(resolved), f"gamePk claimed more than once: {resolved}")


def test_no_orphaned_games() -> None:
    """Every scheduled game must be reachable from some market row."""
    games = [
        game(824490, "2026-07-28T17:40:00Z", "Cincinnati Reds", "Cleveland Guardians"),
        game(824489, "2026-07-28T23:10:00Z", "Cincinnati Reds", "Cleveland Guardians"),
    ]
    ctx = _team_lookup_from_schedule(games)
    reached = {
        _resolve_team_ctx(ctx, "Cincinnati Reds", t).get("gamePk")
        for t in ("2026-07-28T17:41:00Z", "2026-07-28T23:10:00Z")
    }
    orphans = {g["gamePk"] for g in games} - reached
    check(not orphans, f"scheduled games unreachable from any market row: {sorted(orphans)}")


# ── behaviour preservation ─────────────────────────────────────────────────────

def test_single_game_behaviour_is_unchanged() -> None:
    """The overwhelmingly common case must behave exactly as the old lookup did."""
    games = [game(824500, "2026-07-28T22:41:00Z", "Detroit Tigers", "Baltimore Orioles")]
    ctx = _team_lookup_from_schedule(games)
    for commence in ("2026-07-28T22:41:00Z", "2026-07-28T22:40:00Z", None):
        r = _resolve_team_ctx(ctx, "Detroit Tigers", commence)
        check(r.get("gamePk") == 824500, f"single game must resolve regardless of time skew ({commence})")
    check(_resolve_team_ctx(ctx, "Detroit Tigers", "2026-07-28T22:41:00Z").get("homeOrAway") == "Home",
          "team context fields must survive")
    check(_resolve_team_ctx(ctx, "Baltimore Orioles", "2026-07-28T22:41:00Z").get("opponentAbbr") == "DET",
          "opponent resolution must survive")


def test_unknown_team_returns_empty_not_crash() -> None:
    ctx = _team_lookup_from_schedule([game(1, "2026-07-28T22:41:00Z", "A Team", "B Team")])
    check(_resolve_team_ctx(ctx, "Nonexistent Club", "2026-07-28T22:41:00Z") == {}, "unknown team -> {}")
    check(_resolve_team_ctx(ctx, None, None) == {}, "None team -> {}")
    check(_resolve_team_ctx({}, "A Team", None) == {}, "empty index -> {}")


def test_missing_commence_time_is_deterministic() -> None:
    """Without a time to match on, the choice must not vary run to run."""
    games = [
        game(2, "2026-07-28T23:10:00Z", "Cincinnati Reds", "Cleveland Guardians"),
        game(1, "2026-07-28T17:40:00Z", "Cincinnati Reds", "Cleveland Guardians"),
    ]
    ctx = _team_lookup_from_schedule(games)
    picks = {_resolve_team_ctx(ctx, "Cincinnati Reds", None).get("gamePk") for _ in range(5)}
    check(picks == {1}, f"must deterministically pick the earliest game, got {picks}")


def test_malformed_timestamps_do_not_crash() -> None:
    games = [
        game(1, "not-a-date", "Cincinnati Reds", "Cleveland Guardians"),
        game(2, "2026-07-28T23:10:00Z", "Cincinnati Reds", "Cleveland Guardians"),
    ]
    ctx = _team_lookup_from_schedule(games)
    r = _resolve_team_ctx(ctx, "Cincinnati Reds", "2026-07-28T23:10:00Z")
    check(r.get("gamePk") == 2, "a parseable candidate must win over an unparseable one")
    check(_parse_iso("garbage") is None, "bad timestamp -> None, never an exception")
    check(_parse_iso(None) is None, "None -> None")


def test_triple_header_would_also_resolve() -> None:
    """Nothing in the resolver assumes exactly two games."""
    games = [
        game(1, "2026-07-28T13:00:00Z", "Cincinnati Reds", "Cleveland Guardians"),
        game(2, "2026-07-28T17:40:00Z", "Cincinnati Reds", "Cleveland Guardians"),
        game(3, "2026-07-28T23:10:00Z", "Cincinnati Reds", "Cleveland Guardians"),
    ]
    ctx = _team_lookup_from_schedule(games)
    got = [
        _resolve_team_ctx(ctx, "Cincinnati Reds", t).get("gamePk")
        for t in ("2026-07-28T13:01:00Z", "2026-07-28T17:41:00Z", "2026-07-28T23:11:00Z")
    ]
    check(got == [1, 2, 3], f"three games must resolve distinctly, got {got}")


# ── mutation: prove the tests catch the original bug ───────────────────────────

def test_MUTATION_old_lastwritewins_behaviour_is_caught() -> None:
    """Reproduce the old index and confirm these assertions would have failed on it."""
    games = [
        game(824490, "2026-07-28T17:40:00Z", "Cincinnati Reds", "Cleveland Guardians"),
        game(824489, "2026-07-28T23:10:00Z", "Cincinnati Reds", "Cleveland Guardians"),
    ]
    # The old implementation, verbatim in spirit: last write wins.
    old: dict[str, dict] = {}
    for g in games:
        old[g["homeTeamName"]] = {"gamePk": g["gamePk"]}
        old[g["awayTeamName"]] = {"gamePk": g["gamePk"]}

    early = old.get("Cincinnati Reds", {}).get("gamePk")
    late = old.get("Cincinnati Reds", {}).get("gamePk")
    check(early == late == 824489, "the old lookup collapses both games onto the LAST gamePk")
    orphaned = {g["gamePk"] for g in games} - {early}
    check(orphaned == {824490}, f"the old lookup orphans 824490, got {orphaned}")


def main() -> int:
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
    if FAILURES:
        print(f"FAIL — {len(FAILURES)} assertion(s):")
        for f in FAILURES:
            print(f"  - {f}")
        return 1
    print(f"ok — {len(tests)} identity tests passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
