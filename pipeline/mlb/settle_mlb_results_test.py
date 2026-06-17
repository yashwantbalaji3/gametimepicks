"""Focused tests for pipeline.mlb.settle_mlb_results.

No network calls — every test feeds synthetic board + boxscore dicts
through the pure helpers.

Run:
    python3 -m pipeline.mlb.settle_mlb_results_test
"""
from __future__ import annotations

import sys

from .settle_mlb_results import (
    _grade,
    _find_player_in_box,
    _stat_for_market,
    _is_suspended,
    GRADABLE_MARKETS,
)


def test_suspended_game_detection():
    print("\n─── suspended / rescheduled no-action detection ───")
    assert _is_suspended({"abstractState": "Live", "detailedState": "Suspended: Rain"}), "suspended → True"
    assert _is_suspended({"abstractState": "Preview", "detailedState": "Postponed"}), "postponed → True"
    assert not _is_suspended({"abstractState": "Final", "detailedState": "Final"}), "final → False (graded normally)"
    assert not _is_suspended({"abstractState": "Final", "detailedState": "Suspended: Rain"}), "final overrides suspended"
    assert not _is_suspended({"abstractState": "Live", "detailedState": "In Progress"}), "live in-progress → not no-action"
    _ok("suspended/postponed non-final detected; final games never voided")


def _ok(msg: str) -> None:
    print(f"  \033[0;32m✓\033[0m {msg}")


def _fail(msg: str) -> None:
    print(f"  \033[0;31m✗\033[0m {msg}", file=sys.stderr)
    raise AssertionError(msg)


def assert_eq(a, b, label: str) -> None:
    if a == b:
        _ok(f"{label} = {a!r}")
    else:
        _fail(f"{label}: expected {b!r}, got {a!r}")


def test_grade_rule():
    print("\n─── grade rule (Over/Under/Push) ───")
    assert_eq(_grade("Over", 4.5, 5), "Win", "Over wins when actual > line")
    assert_eq(_grade("Over", 4.5, 4), "Loss", "Over loses when actual < line")
    assert_eq(_grade("Over", 4.5, 4.5), "Push", "Push when actual == line")
    assert_eq(_grade("Under", 1.5, 1), "Win", "Under wins when actual < line")
    assert_eq(_grade("Under", 1.5, 2), "Loss", "Under loses when actual > line")
    assert_eq(_grade("Under", 0.5, 0.5), "Push", "Under push at equal")
    # Integer-line edge case (rare in MLB; sportsbooks usually use half-lines)
    assert_eq(_grade("Over", 5, 6), "Win", "integer line — Over wins above")
    assert_eq(_grade("Over", 5, 5), "Push", "integer line — exact push")


def test_total_bases_computation_from_components():
    print("\n─── total bases derivation when totalBases missing ───")
    rec = {
        "stats": {
            "batting": {
                "atBats": 4,
                "hits": 3,
                "doubles": 1,
                "triples": 0,
                "homeRuns": 1,
            }
        }
    }
    # singles = 3 - 1 - 0 - 1 = 1; TB = 1 + 2*1 + 3*0 + 4*1 = 7
    assert_eq(_stat_for_market(rec, "batter_total_bases"), 7, "TB computed from H/2B/3B/HR")


def test_total_bases_uses_api_field_when_present():
    print("\n─── total bases uses API field when present ───")
    rec = {
        "stats": {
            "batting": {
                "atBats": 4,
                "hits": 3,
                "doubles": 1,
                "triples": 0,
                "homeRuns": 1,
                "totalBases": 99,  # nonsense, just to prove we trust the API value
            }
        }
    }
    assert_eq(_stat_for_market(rec, "batter_total_bases"), 99, "TB from API field")


def test_batter_did_not_appear_is_unavailable():
    print("\n─── batter did not appear → actual unavailable ───")
    rec = {"stats": {"batting": {"atBats": 0, "plateAppearances": 0}}}
    assert _stat_for_market(rec, "batter_hits") is None, "no AB+PA → unavailable"
    _ok("batter no-AB unavailable")


def test_zero_ab_void_rule():
    """0-AB / no-PA hitter prop → stat is None (settler emits Void, never a loss);
    a batter who actually batted grades normally from the box score."""
    print("\n─── 0-AB / no-PA void rule ───")
    # no plate appearance (DNP / defensive sub / pinch runner) → None → VOID upstream
    no_pa = {"stats": {"batting": {"atBats": 0, "plateAppearances": 0, "hits": 0}}}
    empty = {"stats": {"batting": {}}}
    for market in ("batter_hits", "batter_total_bases", "batter_hits_runs_rbis"):
        assert _stat_for_market(no_pa, market) is None, f"{market} no-PA → None (void)"
        assert _stat_for_market(empty, market) is None, f"{market} empty line → None (void)"
    _ok("no-PA / empty batting line → None (settler voids it)")
    # a batter who actually batted grades normally
    played_0 = {"stats": {"batting": {"atBats": 4, "plateAppearances": 4, "hits": 0}}}
    played_1 = {"stats": {"batting": {"atBats": 4, "plateAppearances": 4, "hits": 1}}}
    played_2 = {"stats": {"batting": {"atBats": 4, "plateAppearances": 4, "hits": 2}}}
    assert_eq(_grade("Over", 0.5, _stat_for_market(played_0, "batter_hits")), "Loss", "AB>0 H=0 Over 0.5 → loss")
    assert_eq(_grade("Under", 1.5, _stat_for_market(played_1, "batter_hits")), "Win", "AB>0 H=1 Under 1.5 → win")
    assert_eq(_grade("Under", 1.5, _stat_for_market(played_2, "batter_hits")), "Loss", "AB>0 H=2 Under 1.5 → loss")


def test_pitcher_did_not_pitch_is_unavailable():
    print("\n─── pitcher did not pitch → actual unavailable ───")
    rec = {
        "position": {"type": "Pitcher", "abbreviation": "P"},
        "stats": {"pitching": {}},
    }
    assert _stat_for_market(rec, "pitcher_strikeouts") is None, "empty pitching dict → unavailable"
    _ok("pitcher empty-stats unavailable")


def test_batter_hits_runs_rbis_sums_three_components():
    # PR `fix/public-risk-pending-audit` (2026-05-29) — H+R+RBI now
    # graded. Sums hits + runs + rbi from the box-score `batting`
    # record. Requires the batter to have actually appeared.
    print("\n─── H+R+RBI = hits + runs + rbi ───")
    rec = {
        "stats": {
            "batting": {
                "atBats": 4,
                "plateAppearances": 4,
                "hits": 2,
                "runs": 1,
                "rbi": 3,
            }
        }
    }
    assert_eq(_stat_for_market(rec, "batter_hits_runs_rbis"), 6, "2+1+3=6")
    _ok("H+R+RBI summed correctly")


def test_batter_hits_runs_rbis_no_appearance_is_unavailable():
    print("\n─── H+R+RBI honors did-not-appear gate ───")
    rec = {"stats": {"batting": {"atBats": 0, "plateAppearances": 0, "hits": 0, "runs": 0, "rbi": 0}}}
    assert _stat_for_market(rec, "batter_hits_runs_rbis") is None, "no AB+PA → unavailable"
    _ok("H+R+RBI batter no-AB unavailable")


def test_batter_hits_runs_rbis_missing_component_is_unavailable():
    print("\n─── H+R+RBI bails when a component is missing ───")
    rec = {
        "stats": {
            "batting": {
                "atBats": 4,
                "plateAppearances": 4,
                "hits": 2,
                # runs intentionally omitted
                "rbi": 1,
            }
        }
    }
    assert _stat_for_market(rec, "batter_hits_runs_rbis") is None, "missing runs → None"
    _ok("H+R+RBI missing-component handled honestly")


def test_batter_hits_runs_rbis_zero_zero_zero_is_valid():
    # An 0-AB-walk who scored 0 runs and drove in 0 RBI still
    # counts: PA>0 and all three stats present and zero.
    print("\n─── H+R+RBI 0/0/0 with PA>0 returns 0 ───")
    rec = {
        "stats": {
            "batting": {
                "atBats": 0,
                "plateAppearances": 1,
                "hits": 0,
                "runs": 0,
                "rbi": 0,
            }
        }
    }
    assert_eq(_stat_for_market(rec, "batter_hits_runs_rbis"), 0, "0+0+0=0 when PA>0")
    _ok("H+R+RBI 0 with PA>0 is valid")


def test_batter_hits_runs_rbis_in_gradable_markets():
    # PR `fix/public-risk-pending-audit` — the market MUST be in
    # GRADABLE_MARKETS or the orchestrator falls back to
    # "stats_unavailable" for every leg before _stat_for_market is
    # even called.
    assert "batter_hits_runs_rbis" in GRADABLE_MARKETS, (
        "H+R+RBI must be a gradable market"
    )


def test_pitcher_with_innings_returns_k():
    print("\n─── pitcher K reads stats.pitching.strikeOuts ───")
    rec = {
        "position": {"type": "Pitcher", "abbreviation": "P"},
        "stats": {"pitching": {"strikeOuts": 7, "inningsPitched": "6.0"}},
    }
    assert_eq(_stat_for_market(rec, "pitcher_strikeouts"), 7, "K=7")


def test_find_player_prefers_id():
    print("\n─── _find_player_in_box prefers playerId match ───")
    box = {
        "teams": {
            "away": {
                "players": {
                    "ID111": {"person": {"fullName": "Alice"}, "stats": {"batting": {"atBats": 4, "hits": 2}}},
                    "ID222": {"person": {"fullName": "Bob"}, "stats": {"batting": {"atBats": 3, "hits": 1}}},
                }
            },
            "home": {"players": {}},
        }
    }
    rec, method = _find_player_in_box(box, 222, "Bob")
    assert_eq(rec["person"]["fullName"], "Bob", "matched by id")
    assert_eq(method, "id", "match method")


def test_find_player_name_fallback_used_when_id_missing():
    print("\n─── _find_player_in_box falls back to name ───")
    box = {
        "teams": {
            "away": {
                "players": {
                    "ID111": {"person": {"fullName": "Alice"}, "stats": {}},
                }
            },
            "home": {"players": {}},
        }
    }
    rec, method = _find_player_in_box(box, None, "Alice")
    assert_eq(rec["person"]["fullName"], "Alice", "matched by name fallback")
    assert_eq(method, "name", "match method")


def test_find_player_returns_none_when_missing():
    box = {"teams": {"away": {"players": {}}, "home": {"players": {}}}}
    rec, method = _find_player_in_box(box, 999, "Ghost")
    assert rec is None and method is None, "no player → None"
    _ok("missing player returns None")


def test_gradable_markets_locked():
    print("\n─── gradable market set is locked ───")
    assert _stat_for_market({}, "batter_home_runs") is None, "HR not gradable on main board"
    _ok("HR market intentionally not handled on main board")
    # PR `fix/public-risk-pending-audit` (2026-05-29) — added
    # batter_hits_runs_rbis. Keep the set in alpha order.
    assert_eq(
        sorted(GRADABLE_MARKETS),
        ["batter_hits", "batter_hits_runs_rbis", "batter_total_bases", "pitcher_strikeouts"],
        "gradable markets",
    )


def main() -> int:
    print("\n=== pipeline.mlb.settle_mlb_results tests ===")
    test_grade_rule()
    test_total_bases_computation_from_components()
    test_total_bases_uses_api_field_when_present()
    test_batter_did_not_appear_is_unavailable()
    test_zero_ab_void_rule()
    test_suspended_game_detection()
    test_pitcher_did_not_pitch_is_unavailable()
    test_pitcher_with_innings_returns_k()
    test_find_player_prefers_id()
    test_find_player_name_fallback_used_when_id_missing()
    test_find_player_returns_none_when_missing()
    test_gradable_markets_locked()
    print("\n\033[0;32m✓ all settle_mlb_results assertions passed\033[0m")
    return 0


if __name__ == "__main__":
    sys.exit(main())
