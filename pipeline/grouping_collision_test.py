"""
Phase 12 — pipeline.grouping_collision_test

Regression test for the playerId=0 cardKey collision bug fixed in
`app/src/lib/grouping.ts`. This file is a Python port of the same key-
building logic so we can lock the rule into the existing test suite,
even though the production grouping function is in TypeScript.

The TypeScript fix and the Python port below MUST stay in sync. The
function signature is small enough that a divergence would be obvious
in code review.

Hard rules being enforced by these tests:
1. Different players with playerId=0 in the same (date, gameId) MUST
   produce different cardKeys (no merge).
2. Valid playerId behavior MUST be unchanged.
3. Same player by name across different bookmakers MUST share one card.
4. Name normalization is case-insensitive and diacritic-insensitive.
5. PTS / REB / AST under different player names with playerId=0 MUST
   stay attributed to the correct player.

Zero network. Zero filesystem mutation. ~150 lines including tests.
"""
from __future__ import annotations

import re
import unicodedata


# ---------------------------------------------------------------------------
# Python port of buildCardKey (must mirror app/src/lib/grouping.ts)
# ---------------------------------------------------------------------------

_NON_ALNUM = re.compile(r"[^a-z0-9]+")
_LEADING_TRAILING_UNDERSCORES = re.compile(r"^_+|_+$")


def normalize_player_name(name: str | None) -> str:
    """Mirror of `normalizePlayerName` in grouping.ts."""
    if not name:
        return "_unknown_"
    # NFD normalize + strip combining diacritics
    decomposed = unicodedata.normalize("NFD", name)
    stripped = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    lowered = stripped.lower()
    underscored = _NON_ALNUM.sub("_", lowered)
    trimmed = _LEADING_TRAILING_UNDERSCORES.sub("", underscored)
    return trimmed or "_unknown_"


def build_card_key(lean: dict) -> str:
    """Mirror of `buildCardKey` in grouping.ts."""
    date_part = lean.get("date") or ""
    game_part = lean.get("gameId") or ""
    pid = lean.get("playerId")
    id_is_valid = (
        isinstance(pid, int)
        and not isinstance(pid, bool)
        and pid > 0
    )
    if id_is_valid:
        player_part = f"pid:{pid}"
    else:
        player_part = f"name:{normalize_player_name(lean.get('playerName'))}"
    return f"{date_part}-{game_part}-{player_part}"


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def main() -> int:
    asserts = 0

    # ── Test 1: name normalization basics ─────────────────────────────────
    assert normalize_player_name("LeBron James") == "lebron_james"
    assert normalize_player_name("lebron james") == "lebron_james"
    assert normalize_player_name("LEBRON JAMES") == "lebron_james"
    assert normalize_player_name("LeBron  James") == "lebron_james"  # double space
    assert normalize_player_name("Nikola Jokić") == "nikola_jokic"  # diacritic
    assert normalize_player_name("Luka Dončić") == "luka_doncic"
    assert normalize_player_name("Shai Gilgeous-Alexander") == "shai_gilgeous_alexander"
    assert normalize_player_name("Kelly Oubre Jr.") == "kelly_oubre_jr"
    assert normalize_player_name("") == "_unknown_"
    assert normalize_player_name(None) == "_unknown_"
    assert normalize_player_name("   ") == "_unknown_"
    asserts += 11

    # ── Test 2: valid playerId behavior is unchanged ──────────────────────
    a = build_card_key({
        "date": "2026-05-05",
        "gameId": "DET-CLE",
        "playerId": 1628378,
        "playerName": "Donovan Mitchell",
    })
    b = build_card_key({
        "date": "2026-05-05",
        "gameId": "DET-CLE",
        "playerId": 1628378,
        "playerName": "Donovan Mitchell",
    })
    assert a == b, "Same player, same game, same playerId → must collapse"
    assert "pid:1628378" in a, "Valid pid should use pid: prefix"
    asserts += 2

    # ── Test 3: SAME player across bookmakers shares ONE card ─────────────
    leg1 = {"date": "2026-05-05", "gameId": "DET-CLE", "playerId": 1628378,
            "playerName": "Donovan Mitchell", "bookmaker": "DraftKings"}
    leg2 = {"date": "2026-05-05", "gameId": "DET-CLE", "playerId": 1628378,
            "playerName": "Donovan Mitchell", "bookmaker": "FanDuel"}
    assert build_card_key(leg1) == build_card_key(leg2)
    asserts += 1

    # ── Test 4: THE BUG — different playerId=0 players DO NOT collide ─────
    cade = build_card_key({
        "date": "2026-05-05", "gameId": "DET-CLE",
        "playerId": 0, "playerName": "Cade Cunningham"})
    evan = build_card_key({
        "date": "2026-05-05", "gameId": "DET-CLE",
        "playerId": 0, "playerName": "Evan Mobley"})
    jaden = build_card_key({
        "date": "2026-05-05", "gameId": "DET-CLE",
        "playerId": 0, "playerName": "Jaden Ivey"})
    assert cade != evan, "Cade and Evan must NOT share cardKey"
    assert cade != jaden
    assert evan != jaden
    assert "name:cade_cunningham" in cade
    assert "name:evan_mobley" in evan
    assert "name:jaden_ivey" in jaden
    asserts += 6

    # ── Test 5: same name across markets stays in one card (PTS/REB/AST) ──
    pts = build_card_key({"date": "2026-05-05", "gameId": "OKC-LAL",
                          "playerId": 0, "playerName": "LeBron James", "market": "PTS"})
    reb = build_card_key({"date": "2026-05-05", "gameId": "OKC-LAL",
                          "playerId": 0, "playerName": "LeBron James", "market": "REB"})
    ast = build_card_key({"date": "2026-05-05", "gameId": "OKC-LAL",
                          "playerId": 0, "playerName": "LeBron James", "market": "AST"})
    assert pts == reb == ast, "Same player different markets must share ONE card"
    asserts += 1

    # ── Test 6: different games separate same-named players ───────────────
    detroit_lebron = build_card_key({
        "date": "2026-05-05", "gameId": "DET-CLE",
        "playerId": 0, "playerName": "LeBron James"})
    laker_lebron = build_card_key({
        "date": "2026-05-05", "gameId": "OKC-LAL",
        "playerId": 0, "playerName": "LeBron James"})
    assert detroit_lebron != laker_lebron, "Different games must NOT collapse"
    asserts += 1

    # ── Test 7: invalid pid edge cases ────────────────────────────────────
    for bad_pid in (0, -1, None, "0", "1628378", float("nan")):
        k = build_card_key({"date": "2026-05-05", "gameId": "X",
                           "playerId": bad_pid, "playerName": "Test Player"})
        assert "name:test_player" in k, f"playerId={bad_pid!r} must fall back to name"
    asserts += 6

    # ── Test 8: missing playerName falls back to _unknown_ ────────────────
    k = build_card_key({"date": "2026-05-05", "gameId": "X",
                       "playerId": 0, "playerName": None})
    assert "_unknown_" in k
    # Two players with no name in same game → both _unknown_, but still
    # not catastrophic; at least PTS/REB/AST stay together for *one* card
    asserts += 1

    # ── Test 9: pid 0 vs valid pid same name → DIFFERENT keys ─────────────
    bad = build_card_key({"date": "2026-05-05", "gameId": "X",
                         "playerId": 0, "playerName": "Donovan Mitchell"})
    good = build_card_key({"date": "2026-05-05", "gameId": "X",
                          "playerId": 1628378, "playerName": "Donovan Mitchell"})
    assert bad != good, "Same name but one valid pid + one zero must NOT collapse"
    # Reason: we don't know if the playerId=0 row is actually Donovan or
    # someone else; better to keep them separate so the user can investigate.
    asserts += 1

    # ── Test 10: realistic full bug scenario from sandbox board ───────────
    # Reproduces the exact collision shown in the audit:
    #   cardKey=2026-05-05-manual-2026-05-05-DET-CLE-0
    #     · Cade Cunningham  · Evan Mobley  · Jaden Ivey
    leans = [
        {"date": "2026-05-05", "gameId": "manual-2026-05-05-DET-CLE",
         "playerId": 0, "playerName": "Cade Cunningham", "market": "PTS"},
        {"date": "2026-05-05", "gameId": "manual-2026-05-05-DET-CLE",
         "playerId": 0, "playerName": "Cade Cunningham", "market": "REB"},
        {"date": "2026-05-05", "gameId": "manual-2026-05-05-DET-CLE",
         "playerId": 0, "playerName": "Cade Cunningham", "market": "AST"},
        {"date": "2026-05-05", "gameId": "manual-2026-05-05-DET-CLE",
         "playerId": 0, "playerName": "Evan Mobley", "market": "PTS"},
        {"date": "2026-05-05", "gameId": "manual-2026-05-05-DET-CLE",
         "playerId": 0, "playerName": "Evan Mobley", "market": "REB"},
        {"date": "2026-05-05", "gameId": "manual-2026-05-05-DET-CLE",
         "playerId": 0, "playerName": "Evan Mobley", "market": "AST"},
        {"date": "2026-05-05", "gameId": "manual-2026-05-05-DET-CLE",
         "playerId": 0, "playerName": "Jaden Ivey", "market": "PTS"},
        {"date": "2026-05-05", "gameId": "manual-2026-05-05-DET-CLE",
         "playerId": 0, "playerName": "Jaden Ivey", "market": "REB"},
        {"date": "2026-05-05", "gameId": "manual-2026-05-05-DET-CLE",
         "playerId": 0, "playerName": "Jaden Ivey", "market": "AST"},
    ]
    keys = {build_card_key(l) for l in leans}
    # Should produce exactly THREE unique cardKeys (one per player), not 1
    assert len(keys) == 3, f"Expected 3 distinct cards, got {len(keys)}: {keys}"
    asserts += 1

    print(f"\n  ✓ all {asserts} collision assertions passed\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
