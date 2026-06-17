"""Tests for pipeline.grade_parlays.

Pure tests over fixture snapshots + fixture lookup dicts. Never reads
from the real settled_leans.jsonl and never writes to the real graded
directory.

Run: python -m pipeline.grade_parlays_test
"""
from __future__ import annotations

import sys

from . import grade_parlays as GP


GREEN = "\033[0;32m"; RED = "\033[0;31m"; BLUE = "\033[0;34m"; RESET = "\033[0m"


class Suite:
    def __init__(self):
        self.passed = 0
        self.failed = 0

    def ok(self, cond, name):
        if cond:
            self.passed += 1
            print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            print(f"  {RED}✗{RESET} {name}")

    def eq(self, a, b, name):
        if a == b:
            self.passed += 1
            print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            print(f"  {RED}✗{RESET} {name}")
            print(f"    expected {b!r}, got {a!r}")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _leg(playerId, market, side, line):
    return {
        "playerId": playerId,
        "playerName": f"Player_{playerId}",
        "market": market,
        "side": side,
        "line": line,
    }


def _settled(playerId, market, side, line, result, finalStat=None):
    return {
        "playerId": playerId,
        "market": market,
        "side": side,
        "line": line,
        "result": result,
        "finalStat": finalStat,
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_all_legs_win_makes_slip_win(s: Suite):
    print(f"\n  {BLUE}─── all legs win → slip wins ───{RESET}")
    lookup = {
        (1, "PTS", "Over", 20.5): _settled(1, "PTS", "Over", 20.5, "win", 24),
        (2, "REB", "Over", 6.5): _settled(2, "REB", "Over", 6.5, "win", 9),
    }
    legs = [_leg(1, "PTS", "Over", 20.5), _leg(2, "REB", "Over", 6.5)]
    graded = [GP._grade_leg(leg, lookup) for leg in legs]
    status = GP._grade_slip_status([leg["result"] for leg in graded])
    s.eq(status, "win", "slip status is win")


def test_any_loss_makes_slip_lose(s: Suite):
    print(f"\n  {BLUE}─── any leg loses → slip loses ───{RESET}")
    lookup = {
        (1, "PTS", "Over", 20.5): _settled(1, "PTS", "Over", 20.5, "win", 24),
        (2, "REB", "Over", 6.5): _settled(2, "REB", "Over", 6.5, "loss", 3),
    }
    legs = [_leg(1, "PTS", "Over", 20.5), _leg(2, "REB", "Over", 6.5)]
    graded = [GP._grade_leg(leg, lookup) for leg in legs]
    status = GP._grade_slip_status([leg["result"] for leg in graded])
    s.eq(status, "loss", "slip status is loss")


def test_unresolved_leg_makes_slip_pending(s: Suite):
    """Unresolved leg + no loss → pending (never counted as a loss)."""
    print(f"\n  {BLUE}─── unresolved leg → slip pending ───{RESET}")
    lookup = {
        (1, "PTS", "Over", 20.5): _settled(1, "PTS", "Over", 20.5, "win", 24),
        # (2, REB) is intentionally NOT in lookup → unresolved
    }
    legs = [_leg(1, "PTS", "Over", 20.5), _leg(2, "REB", "Over", 6.5)]
    graded = [GP._grade_leg(leg, lookup) for leg in legs]
    s.eq(graded[1]["result"], "unresolved", "missing leg marked unresolved")
    status = GP._grade_slip_status([leg["result"] for leg in graded])
    s.eq(status, "pending", "slip status is pending")


def test_push_with_no_loss_makes_slip_push(s: Suite):
    """A push on any leg, no losses, no unresolved → slip pushes."""
    print(f"\n  {BLUE}─── push leg + no loss → slip push ───{RESET}")
    lookup = {
        (1, "PTS", "Over", 20.5): _settled(1, "PTS", "Over", 20.5, "win", 24),
        (2, "REB", "Over", 6.5): _settled(2, "REB", "Over", 6.5, "push", 6.5),
    }
    legs = [_leg(1, "PTS", "Over", 20.5), _leg(2, "REB", "Over", 6.5)]
    graded = [GP._grade_leg(leg, lookup) for leg in legs]
    status = GP._grade_slip_status([leg["result"] for leg in graded])
    s.eq(status, "push", "slip status is push")


def test_push_with_loss_still_lose(s: Suite):
    """A push + a loss is still a loss (loss dominates)."""
    print(f"\n  {BLUE}─── push + loss → slip loses (loss dominates) ───{RESET}")
    lookup = {
        (1, "PTS", "Over", 20.5): _settled(1, "PTS", "Over", 20.5, "loss", 14),
        (2, "REB", "Over", 6.5): _settled(2, "REB", "Over", 6.5, "push", 6.5),
    }
    legs = [_leg(1, "PTS", "Over", 20.5), _leg(2, "REB", "Over", 6.5)]
    graded = [GP._grade_leg(leg, lookup) for leg in legs]
    status = GP._grade_slip_status([leg["result"] for leg in graded])
    s.eq(status, "loss", "loss takes priority over push")


def test_grade_snapshot_payload_end_to_end(s: Suite):
    print(f"\n  {BLUE}─── grade_snapshot_payload end-to-end ───{RESET}")
    snapshot = {
        "date": "2026-05-21",
        "slips": [
            {
                "slipId": "slip_A",
                "riskProfile": "balanced",
                "status": "pending",
                "sport": "nba",
                "legs": [_leg(1, "PTS", "Over", 20.5)],
            }
        ],
    }
    # Mock settled lookup via monkeypatch
    original = GP._settled_lookup_for_date
    try:
        GP._settled_lookup_for_date = lambda date: {  # type: ignore[assignment]
            (1, "PTS", "Over", 20.5): _settled(1, "PTS", "Over", 20.5, "win", 24),
        }
        graded = GP.grade_snapshot_payload(snapshot)
    finally:
        GP._settled_lookup_for_date = original  # type: ignore[assignment]
    s.eq(graded["date"], "2026-05-21", "date preserved")
    s.eq(graded["slipsCount"], 1, "slipsCount = 1")
    s.eq(graded["slips"][0]["status"], "win", "slip graded as win")
    s.eq(graded["slips"][0]["legs"][0]["result"], "win", "leg graded as win")
    s.ok("gradedAt" in graded["slips"][0], "slip has gradedAt timestamp")


def test_no_snapshot_means_honest_noop(s: Suite):
    """If grade_snapshot_payload receives a payload with empty slips,
    it should produce an empty graded payload — never invent slips."""
    print(f"\n  {BLUE}─── empty snapshot → empty graded payload ───{RESET}")
    graded = GP.grade_snapshot_payload({"date": "2026-05-21", "slips": []})
    s.eq(graded["slipsCount"], 0, "empty snapshot yields slipsCount 0")
    s.eq(graded["slips"], [], "no slips invented")


def _mlb_settled(playerId, marketKey, lean, line, outcome, actual=None):
    """MLB settled row in the raw on-disk shape (outcome/lean/marketKey).
    Used to exercise the grader's normalization layer."""
    return {
        "playerId": playerId,
        "playerName": f"MLBPlayer_{playerId}",
        "marketKey": marketKey,
        "marketLabel": marketKey.replace("_", " ").title(),
        "lean": lean,
        "line": line,
        "outcome": outcome,
        "actual": actual,
    }


def test_mlb_settled_lookup_normalization(s: Suite):
    """The grader's lookup index must accept MLB rows alongside NBA
    rows and key them by (playerId, marketKey, lean, line) — the
    snapshot's MLB legs already use marketKey as `market`."""
    print(f"\n  {BLUE}─── MLB settled lookup normalization ───{RESET}")
    import tempfile, os, json as J
    nba_rows = [_settled(1, "PTS", "Over", 20.5, "win", 24)]
    mlb_rows = [
        _mlb_settled(901, "pitcher_strikeouts", "Over", 5.5, "Win", 7),
        _mlb_settled(902, "batter_hits", "Under", 1.5, "Loss", 2),
        _mlb_settled(903, "batter_total_bases", "Over", 1.5, "Push", 1.5),
        # REGRESSION (fix/results-clear-pending-slips, 2026-05-30): the
        # H+R+RBI market must normalize through the same lookup. May 27
        # was settled before HRR support existed, so its HRR board leans
        # never produced settled rows and every optimizer HRR leg (e.g.
        # Juan Soto, actual 4 > 1.5) stayed `unresolved`. Re-settling
        # fixed the data; this row guards the normalization path so a
        # future HRR settled row always reaches the grader.
        _mlb_settled(904, "batter_hits_runs_rbis", "Over", 1.5, "Win", 4),
    ]
    with tempfile.TemporaryDirectory() as tmp:
        nba_dir = os.path.join(tmp, "app", "public", "data", "results")
        mlb_dir = os.path.join(tmp, "app", "public", "data", "mlb", "results")
        os.makedirs(nba_dir, exist_ok=True)
        os.makedirs(mlb_dir, exist_ok=True)
        with open(os.path.join(nba_dir, "settled_leans.jsonl"), "w") as f:
            for r in nba_rows:
                f.write(J.dumps({**r, "date": "2099-01-01"}) + "\n")
        with open(os.path.join(mlb_dir, "settled_leans.jsonl"), "w") as f:
            for r in mlb_rows:
                f.write(J.dumps({**r, "date": "2099-01-01"}) + "\n")
        cwd = os.getcwd()
        try:
            os.chdir(tmp)
            lookup = GP._settled_lookup_for_date("2099-01-01")
        finally:
            os.chdir(cwd)
    # NBA key still present.
    s.ok((1, "PTS", "Over", 20.5) in lookup, "NBA key present in lookup")
    # MLB keys present with normalized shape.
    mlb_win_key = (901, "pitcher_strikeouts", "Over", 5.5)
    mlb_loss_key = (902, "batter_hits", "Under", 1.5)
    mlb_push_key = (903, "batter_total_bases", "Over", 1.5)
    mlb_hrr_key = (904, "batter_hits_runs_rbis", "Over", 1.5)
    s.ok(mlb_win_key in lookup, "MLB win key present")
    s.ok(mlb_loss_key in lookup, "MLB loss key present")
    s.ok(mlb_push_key in lookup, "MLB push key present")
    s.ok(mlb_hrr_key in lookup, "MLB H+R+RBI key present")
    s.eq(lookup[mlb_win_key].get("result"), "win",
         "MLB outcome 'Win' normalized to result 'win'")
    s.eq(lookup[mlb_loss_key].get("result"), "loss",
         "MLB outcome 'Loss' normalized to result 'loss'")
    s.eq(lookup[mlb_push_key].get("result"), "push",
         "MLB outcome 'Push' normalized to result 'push'")
    s.eq(lookup[mlb_hrr_key].get("result"), "win",
         "MLB H+R+RBI outcome normalized to result 'win'")
    s.eq(lookup[mlb_win_key].get("finalStat"), 7,
         "MLB 'actual' normalized to 'finalStat'")
    s.eq(lookup[mlb_hrr_key].get("finalStat"), 4,
         "MLB H+R+RBI 'actual' (4) normalized to 'finalStat'")


def test_mlb_only_slip_grades_correctly(s: Suite):
    print(f"\n  {BLUE}─── MLB-only slip grades correctly ───{RESET}")
    # Snapshot MLB leg shape: market=marketKey, side=lean.
    legs = [
        {"playerId": 901, "playerName": "P1", "sport": "mlb",
         "market": "pitcher_strikeouts", "side": "Over", "line": 5.5},
        {"playerId": 902, "playerName": "B1", "sport": "mlb",
         "market": "batter_hits", "side": "Under", "line": 1.5},
    ]
    lookup = {
        (901, "pitcher_strikeouts", "Over", 5.5): {"result": "win", "finalStat": 7},
        (902, "batter_hits", "Under", 1.5): {"result": "win", "finalStat": 0},
    }
    graded = [GP._grade_leg(leg, lookup) for leg in legs]
    status = GP._grade_slip_status([leg["result"] for leg in graded])
    s.eq(status, "win", "MLB all-hit slip → win")


def test_mlb_pending_when_one_unresolved(s: Suite):
    print(f"\n  {BLUE}─── MLB slip with one unresolved → pending ───{RESET}")
    legs = [
        {"playerId": 901, "sport": "mlb",
         "market": "pitcher_strikeouts", "side": "Over", "line": 5.5},
        {"playerId": 902, "sport": "mlb",
         "market": "batter_hits", "side": "Under", "line": 1.5},
    ]
    lookup = {
        (901, "pitcher_strikeouts", "Over", 5.5): {"result": "win", "finalStat": 7},
        # 902 row intentionally missing — leg should be unresolved.
    }
    graded = [GP._grade_leg(leg, lookup) for leg in legs]
    s.eq(graded[1]["result"], "unresolved", "missing MLB row → unresolved")
    status = GP._grade_slip_status([leg["result"] for leg in graded])
    s.eq(status, "pending", "MLB unresolved leg → slip pending, not loss")


def test_mlb_hrr_optimizer_leg_resolves(s: Suite):
    """REGRESSION (fix/results-clear-pending-slips, 2026-05-30).

    An optimizer-built H+R+RBI leg (market=`batter_hits_runs_rbis`,
    side=`Over`) must resolve when the MLB settled lookup carries the
    matching normalized row. This is the Juan Soto May 27 case: he
    played (H2 R1 RBI1 → HRR 4 > 1.5 = Over win) but his HRR leg sat
    `unresolved` for days because May 27 was settled before HRR support
    landed. Once re-settled, the leg must grade to `win` — and the slip
    flip from pending to win. Guards the full leg→lookup→slip path."""
    print(f"\n  {BLUE}─── MLB H+R+RBI optimizer leg resolves ───{RESET}")
    legs = [
        {"playerId": 665742, "sport": "mlb",
         "market": "batter_hits_runs_rbis", "side": "Over", "line": 1.5},
        {"playerId": 901, "sport": "mlb",
         "market": "pitcher_strikeouts", "side": "Over", "line": 5.5},
    ]
    lookup = {
        (665742, "batter_hits_runs_rbis", "Over", 1.5): {"result": "win", "finalStat": 4},
        (901, "pitcher_strikeouts", "Over", 5.5): {"result": "win", "finalStat": 7},
    }
    graded = [GP._grade_leg(leg, lookup) for leg in legs]
    s.eq(graded[0]["result"], "win", "HRR leg with settled row → win, not unresolved")
    s.eq(graded[0]["finalStat"], 4, "HRR finalStat carried through (4)")
    status = GP._grade_slip_status([leg["result"] for leg in graded])
    s.eq(status, "win", "all-win HRR slip → win (no lingering pending)")


def test_mixed_nba_mlb_slip_grades(s: Suite):
    print(f"\n  {BLUE}─── mixed NBA + MLB slip grades correctly ───{RESET}")
    legs = [
        {"playerId": 1, "sport": "nba",
         "market": "PTS", "side": "Over", "line": 20.5},
        {"playerId": 901, "sport": "mlb",
         "market": "pitcher_strikeouts", "side": "Over", "line": 5.5},
        {"playerId": 902, "sport": "mlb",
         "market": "batter_hits", "side": "Under", "line": 1.5},
    ]
    lookup = {
        (1, "PTS", "Over", 20.5): {"result": "win", "finalStat": 24},
        (901, "pitcher_strikeouts", "Over", 5.5): {"result": "win", "finalStat": 7},
        (902, "batter_hits", "Under", 1.5): {"result": "loss", "finalStat": 2},
    }
    graded = [GP._grade_leg(leg, lookup) for leg in legs]
    status = GP._grade_slip_status([leg["result"] for leg in graded])
    s.eq(status, "loss", "mixed slip with one MLB loss → loss")


def test_void_leg_drops_from_slip(s: Suite):
    """A void leg (DNP / 0-AB hitter prop) is refunded and drops out — the slip is
    decided by the remaining legs."""
    print(f"\n  {BLUE}─── void leg drops from the parlay ───{RESET}")
    s.eq(GP._grade_slip_status(["void", "win", "win"]), "win", "void + all wins → win")
    s.eq(GP._grade_slip_status(["void", "loss", "win"]), "loss", "void + a loss → loss")
    s.eq(GP._grade_slip_status(["void", "unresolved", "win"]), "pending", "void + unresolved → pending")
    s.eq(GP._grade_slip_status(["void", "void"]), "push", "all legs void → push (full refund)")
    s.eq(GP._grade_slip_status(["void", "push", "win"]), "push", "void + a push → push")
    s.eq(GP._MLB_OUTCOME_TO_RESULT.get("Void"), "void", "Void outcome maps to void")


def main():
    s = Suite()
    for t in (
        test_all_legs_win_makes_slip_win,
        test_any_loss_makes_slip_lose,
        test_unresolved_leg_makes_slip_pending,
        test_push_with_no_loss_makes_slip_push,
        test_push_with_loss_still_lose,
        test_void_leg_drops_from_slip,
        test_grade_snapshot_payload_end_to_end,
        test_no_snapshot_means_honest_noop,
        test_mlb_settled_lookup_normalization,
        test_mlb_only_slip_grades_correctly,
        test_mlb_pending_when_one_unresolved,
        test_mlb_hrr_optimizer_leg_resolves,
        test_mixed_nba_mlb_slip_grades,
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
