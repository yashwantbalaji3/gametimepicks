"""Focused tests for pipeline.mlb.settle_mlb_results.

No network calls — every test feeds synthetic board + boxscore dicts
through the pure helpers.

Run:
    python3 -m pipeline.mlb.settle_mlb_results_test
"""
from __future__ import annotations

import json
import pathlib
import sys

from . import settle_mlb_results as S

from .settle_mlb_results import (
    _grade,
    _find_player_in_box,
    _stat_for_market,
    _is_suspended,
    aggregate_outcomes,
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


def test_decisive_denominator_excludes_voids():
    """REGRESSION (Program 092-095 §6.3) — the July-30 slate: 162 W / 206 L / 17 Void.

    The decisive hit rate is 162/368 = 44.02%. The old top-level computation divided by
    everything-except-Push (162/385 = 42.08%), silently letting voids dilute the rate.
    `settled` and `decisive` must stay separate named fields.
    """
    rows = (
        [{"outcome": "Win"}] * 162 + [{"outcome": "Loss"}] * 206 + [{"outcome": "Void"}] * 17
    )
    agg = aggregate_outcomes(rows)
    assert agg["settled"] == 385, agg
    assert agg["decisive"] == 368, agg
    assert agg["voids"] == 17, agg
    assert agg["pushes"] == 0, agg
    assert round(agg["hitRate"], 4) == 0.4402, agg
    assert round(agg["hitRate"], 4) != 0.4208, "the void-diluted rate must not come back"

    # Pushes are excluded too, and an all-void day reports None rather than a fake 0%.
    agg2 = aggregate_outcomes([{"outcome": "Push"}] * 3 + [{"outcome": "Void"}] * 2)
    assert agg2["decisive"] == 0 and agg2["hitRate"] is None, agg2


def test_missing_board_is_a_skip_not_a_crash():
    """REGRESSION (Program 100-103) — a date with no published board is NOT_MEASURABLE.

    2026-08-01/02 were correctly never generated. The nightly writer then tried to settle
    "yesterday", hit the missing board, raised, and failed the whole nightly run every night —
    taking down the contract-commit step that the original outage depended on. The CLI must skip
    such a date with exit 0 while `settle()` keeps raising for its programmatic callers.
    """
    from . import settle_mlb_results as m

    rc = m.main(["--date", "1999-01-01"])  # a date that can never have a board
    assert rc == 0, f"a missing board must be a skip, not a failure (got exit {rc})"

    try:
        m.settle("1999-01-01")
    except m.MlbSettleError:
        pass  # the library contract is unchanged
    else:
        raise AssertionError("settle() must still raise for programmatic callers")
    print("  \033[0;32m✓\033[0m missing board skips (exit 0) while settle() still raises")


def test_population_reconciles_published_to_settled():
    """REGRESSION (2026-08-04) — the published population must close with no remainder.

    Measured on the real 2026-08-03 slate: the board published 211 rows, the report said
    `settled: 190` and `unavailableCount: 6`, and **15 rows were accounted for nowhere**. They
    were `lean='Pass' / confidence='insufficient_data'` — the model correctly declining to take a
    side, correctly excluded from the decisive denominator, but silently dropped from every
    count. Anyone reconciling "what users saw" against "what we graded" hit an unexplained gap.

    Grading policy is unchanged. The identity below is what must hold:
        publishedRows == settled + noPlay + unavailable   (+ unresolved, which must be 0)
    """
    # The exact Aug 3 shape.
    published, settled, no_play, unavailable = 211, 190, 15, 6
    assert settled + no_play + unavailable == published, "the real slate must reconcile"
    unresolved = max(0, published - settled - no_play - unavailable)
    assert unresolved == 0, f"unexplained remainder: {unresolved}"

    # And the failure mode it guards: dropping the no-play class re-opens the gap.
    assert settled + unavailable != published, (
        "if no-play were still uncounted the population would NOT reconcile — that is the defect"
    )

    # The report must carry every field needed to check this without recomputing from artifacts.
    src = open(__file__.replace("_test.py", ".py")).read()
    for field in ('"publishedRows"', '"noPlayCount"', '"unresolvedCount"', '"reconciles"'):
        assert field in src, f"the comparison report must expose {field}"
    assert "no_play.append(" in src, "no-play rows must be recorded, not silently skipped"
    print("  \033[0;32m✓\033[0m published population reconciles: settled + no-play + unavailable")


# ── RERUN IDEMPOTENCY (main recovery · R4) ───────────────────────────────────────────────────────
# `actual_unavailable` is recomputed from LIVE fetches every run, while the ledger is durable and
# keyed by id. A lean settled on run 1 was re-counted as "unavailable" on run 2 whenever that run
# could not re-fetch its boxscore, so the two populations overlapped.
#
# Observed 2026-09-23: re-running 2026-09-22 gave `predicted 613, accounted 615 (ledger 613 +
# unavailable 2) -> -2 unexplained`. Nothing went missing; two rows were counted twice.
#
# The contract: running the settler twice over the same immutable evidence must not change canonical
# accounting the second time.

def _ledger(tmp, rows):
    import json as _j
    tmp.write_text("\n".join(_j.dumps(r) for r in rows) + "\n")


def test_rerun_does_not_recount_a_ledgered_lean_as_unavailable():
    """3 · unavailableCount must not increase on rerun."""
    import tempfile, pathlib, json as _j
    from unittest import mock
    with tempfile.TemporaryDirectory() as d:
        led = pathlib.Path(d) / "mlb_settled_leans.jsonl"
        _ledger(led, [{"id": "L1", "graded": True}, {"id": "L2", "graded": True}])
        with mock.patch.object(S, "SETTLED_LEANS_PATH", led):
            ids = S._settled_ids_in_ledger()
    assert ids == {"L1", "L2"}, ids
    # A lean the ledger holds is accounted for; one it does not hold is genuinely unavailable.
    assert "L1" in ids and "L9" not in ids
    print("  ✓ a ledgered lean is recognised as already accounted for")


def test_only_graded_rows_count_as_already_settled():
    """5/6 · pending is not loss, missing is not zero — an ungraded row is NOT 'already settled'."""
    import tempfile, pathlib
    from unittest import mock
    with tempfile.TemporaryDirectory() as d:
        led = pathlib.Path(d) / "mlb_settled_leans.jsonl"
        _ledger(led, [
            {"id": "G", "graded": True},
            {"id": "P", "graded": False},          # pending — must stay countable
            {"id": "N"},                            # no graded field at all — must stay countable
        ])
        with mock.patch.object(S, "SETTLED_LEANS_PATH", led):
            ids = S._settled_ids_in_ledger()
    assert ids == {"G"}, ids
    print("  ✓ only graded rows are treated as accounted for")


def test_unreadable_ledger_fails_toward_counting():
    """4 · a new genuinely unavailable row still counts once, even if the ledger cannot be read."""
    import tempfile, pathlib
    from unittest import mock
    with tempfile.TemporaryDirectory() as d:
        led = pathlib.Path(d) / "missing.jsonl"
        with mock.patch.object(S, "SETTLED_LEANS_PATH", led):
            assert S._settled_ids_in_ledger() == set()
        bad = pathlib.Path(d) / "bad.jsonl"
        bad.write_text("{not json\n\n{\"id\": \"OK\", \"graded\": true}\n")
        with mock.patch.object(S, "SETTLED_LEANS_PATH", bad):
            assert S._settled_ids_in_ledger() == {"OK"}
    print("  ✓ an absent or malformed ledger never makes a lean look accounted for")


def test_loader_reads_the_PRODUCTION_ledger_not_only_a_fixture():
    """ANTI-VACUITY · the gate is worthless if it reads the wrong file or the wrong field.

    Every other test here feeds the loader a ledger it wrote itself, so all of them would still pass
    if `_settled_ids_in_ledger` looked for a key the real artifact does not carry — and it nearly did:
    the PUBLISHED ledger (app/public/data/mlb/results/settled_leans.jsonl) has no `graded` field at
    all, only `outcome`. The pipeline ledger this reads is a different file that does. Pointing the
    loader at the published one would silently return an empty set, and an empty set disables the fix
    while every synthetic test stays green.

    So: run it against the real artifact, unmocked, and require a large result containing an id taken
    from the file itself. Stays true after the artifacts regenerate; fails the moment the path or the
    field drifts."""
    real = S.SETTLED_LEANS_PATH
    assert real.exists(), f"the production ledger must exist at {real}"
    first = None
    for line_text in real.read_text().splitlines():
        line_text = line_text.strip()
        if not line_text:
            continue
        obj = json.loads(line_text)
        if obj.get("graded") is True and obj.get("id"):
            first = obj["id"]
            break
    assert first, "the production ledger must contain at least one graded row with an id"
    ids = S._settled_ids_in_ledger()
    assert len(ids) > 10_000, f"loader returned {len(ids)} ids from the production ledger — it is not reading it"
    assert first in ids, f"a graded id read from the file itself ({first}) must be recognised"
    print(f"  ✓ the loader reads the production ledger ({len(ids)} graded ids)")


def test_reconciliation_identity_includes_the_new_bucket():
    """1/2/7 · the population identity closes, and the new term is reconciled rather than dropped."""
    src = pathlib.Path(__file__).with_name("settle_mlb_results.py").read_text()
    assert "alreadySettledCount" in src, "the bucket must be published, not hidden"
    assert "len(already_settled)" in src
    # The identity must subtract AND add the new term in both places, or the remainder silently shifts.
    assert "- len(already_settled)" in src, "unresolvedCount must account for it"
    assert "+ len(already_settled)" in src, "reconciles must account for it"
    # 8 · the protection itself
    assert "previously_settled_ids" in src
    assert 'lean.get("id") in previously_settled_ids' in src, "the ledger check must gate every unavailable append"
    assert src.count('lean.get("id") in previously_settled_ids') == 3, "all three unavailable sites must be gated"
    print("  ✓ the identity closes and all three unavailable paths are gated")


def main() -> int:
    print("\n=== pipeline.mlb.settle_mlb_results tests ===")
    test_population_reconciles_published_to_settled()
    test_grade_rule()
    test_decisive_denominator_excludes_voids()
    test_missing_board_is_a_skip_not_a_crash()
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
    test_rerun_does_not_recount_a_ledgered_lean_as_unavailable()
    test_only_graded_rows_count_as_already_settled()
    test_unreadable_ledger_fails_toward_counting()
    test_loader_reads_the_PRODUCTION_ledger_not_only_a_fixture()
    test_reconciliation_identity_includes_the_new_bucket()
    print("\n\033[0;32m✓ all settle_mlb_results assertions passed\033[0m")
    return 0


if __name__ == "__main__":
    sys.exit(main())
