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

import hashlib
import importlib
import pathlib

import pipeline.mlb.generate_mlb_board as gmb
from pipeline.mlb.generate_mlb_board import (
    _parse_iso,
    _club_identity,
    _resolve_team_ctx,
    _team_lookup_from_schedule,
)

# NOTE: the gate is referenced through `gmb.` rather than imported by name. The mutation test
# reloads the module, which rebinds IdentityGateError to a new class object — a stale `from`-import
# would stop matching in `except`, and the gate tests would pass for the wrong reason.

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


# ── the roster-lookup regression the list contract caused ──────────────────────

def test_club_identity_consumes_the_list_contract() -> None:
    """Roster lookup must survive `_team_lookup_from_schedule` returning lists.

    b8c68dee changed the lookup value from a single dict to a LIST so doubleheaders keep
    distinct gamePks. The roster loop kept calling `.get()` on that value, so from the very
    next run every board raised `AttributeError: 'list' object has no attribute 'get'` and no
    board was written — while the orchestrator still printed a success line. 2026-07-29 and
    2026-07-30 therefore had no board at all, and settlement failed with "board file not found".
    """
    games = [
        {**game(824490, "2026-07-28T17:40:00Z", "Cincinnati Reds", "Cleveland Guardians"),
         "homeTeamId": 113, "awayTeamId": 114},
        {**game(824489, "2026-07-28T23:10:00Z", "Cincinnati Reds", "Cleveland Guardians"),
         "homeTeamId": 113, "awayTeamId": 114},
    ]
    ctx = _team_lookup_from_schedule(games)

    # The exact call the roster loop makes, over the exact structure the lookup returns.
    for team_name, ctxs in ctx.items():
        check(isinstance(ctxs, list), f"{team_name} must index a LIST, not a dict")
        club = _club_identity(ctxs)
        check(club is not None, f"{team_name} must resolve to a club identity")

    # A doubleheader team names ONE club, not one per game.
    check(_club_identity(ctx["Cincinnati Reds"]) == (113, "CIN"),
          f"doubleheader must resolve one club, got {_club_identity(ctx['Cincinnati Reds'])}")

    # Fail closed rather than crash when no entry carries an id.
    check(_club_identity([]) is None, "an empty list must return None, not raise")
    check(_club_identity([{"abbr": "CIN"}]) is None, "an entry with no id must not identify a club")
    check(_club_identity([{"abbr": "X"}, {"id": 113, "abbr": "CIN"}]) == (113, "CIN"),
          "the first entry carrying an id identifies the club")


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


# ── SPRINT 043 · publication safety gate ───────────────────────────────────────

def test_gate_passes_a_clean_board() -> None:
    """A correctly resolved doubleheader must publish without complaint."""
    leans = [
        {"gameId": "prov-early", "gamePk": 824490},
        {"gameId": "prov-early", "gamePk": 824490},  # multiple leans per game is normal
        {"gameId": "prov-late", "gamePk": 824489},
    ]
    check(gmb.validate_board_identity(leans) == [], "a clean board must produce no violations")
    try:
        gmb.assert_board_publishable(leans, date="2026-07-28")
    except gmb.IdentityGateError as exc:  # pragma: no cover - failure path
        check(False, f"clean board must publish, raised: {exc}")


def test_gate_catches_the_july28_collision() -> None:
    """The exact defect: two provider events collapsed onto one gamePk."""
    leans = [
        {"gameId": "prov-early", "gamePk": 824489},
        {"gameId": "prov-late", "gamePk": 824489},
    ]
    violations = gmb.validate_board_identity(leans)
    check(len(violations) == 1, f"expected exactly 1 violation, got {violations}")
    check("PROVIDER_ID_COLLISION" in violations[0], f"wrong code: {violations[0]}")
    check("824489" in violations[0], "the message must name the colliding gamePk")

    raised = False
    try:
        gmb.assert_board_publishable(leans, date="2026-07-28")
    except gmb.IdentityGateError as exc:
        raised = True
        check("824489" in str(exc), "the raised error must be actionable")
    check(raised, "the gate MUST refuse to publish a collision, not warn")


def test_gate_catches_ambiguous_provider_event() -> None:
    """The inverse failure: one provider event claiming two games."""
    leans = [
        {"gameId": "prov-early", "gamePk": 824489},
        {"gameId": "prov-early", "gamePk": 824490},
    ]
    violations = gmb.validate_board_identity(leans)
    check(any("AMBIGUOUS_EVENT" in v for v in violations), f"expected AMBIGUOUS_EVENT, got {violations}")


def test_gate_ignores_incomplete_rows_rather_than_inventing_violations() -> None:
    """Leans without identity fields are someone else's problem — the gate must not fabricate."""
    leans = [
        {"gameId": None, "gamePk": 824489},
        {"gameId": "prov-late", "gamePk": None},
        {"gameId": "prov-late", "gamePk": 824490},
    ]
    check(gmb.validate_board_identity(leans) == [], "rows missing identity must be skipped, not flagged")


def test_MUTATION_reverting_the_resolver_trips_the_gate() -> None:
    """Mutate the REAL source back to last-write-wins, prove the gate catches it, restore byte-exactly.

    A guard that has never been observed failing is not a guard. This mutates the shipped file on
    disk rather than a copy, so the test proves the gate protects the code that actually runs.
    """
    src = pathlib.Path(__file__).with_name("generate_mlb_board.py")
    original = src.read_bytes()
    original_digest = hashlib.sha256(original).hexdigest()

    mutated = original.decode().replace(
        'lookup.setdefault(home["name"], []).append(home)',
        'lookup[home["name"]] = [home]  # MUTATION: last write wins',
        1,
    )
    check(mutated != original.decode(), "mutation did not apply — the resolver source has changed shape")

    try:
        src.write_text(mutated)
        importlib.reload(gmb)

        games = [
            game(824490, "2026-07-28T17:40:00Z", "Cincinnati Reds", "Cleveland Guardians"),
            game(824489, "2026-07-28T23:10:00Z", "Cincinnati Reds", "Cleveland Guardians"),
        ]
        ctx = gmb._team_lookup_from_schedule(games)
        leans = [
            {
                "gameId": f"prov-{label}",
                "gamePk": gmb._resolve_team_ctx(ctx, "Cincinnati Reds", t).get("gamePk"),
            }
            for label, t in (("early", "2026-07-28T17:41:00Z"), ("late", "2026-07-28T23:10:00Z"))
        ]

        pks = [l["gamePk"] for l in leans]
        check(len(set(pks)) == 1, f"the mutation must reproduce the collapse, got {pks}")

        raised = False
        try:
            gmb.assert_board_publishable(leans, date="2026-07-28")
        except gmb.IdentityGateError:
            raised = True
        check(raised, "THE GATE FAILED TO CATCH THE REGRESSION IT EXISTS TO CATCH")
    finally:
        src.write_bytes(original)
        importlib.reload(gmb)

    restored = src.read_bytes()
    check(hashlib.sha256(restored).hexdigest() == original_digest,
          "the mutated source was NOT restored byte-for-byte")
    check(gmb.validate_board_identity([{"gameId": "a", "gamePk": 1}]) == [],
          "the restored module must behave normally")


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
