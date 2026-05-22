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


def main():
    s = Suite()
    for t in (
        test_all_legs_win_makes_slip_win,
        test_any_loss_makes_slip_lose,
        test_unresolved_leg_makes_slip_pending,
        test_push_with_no_loss_makes_slip_push,
        test_push_with_loss_still_lose,
        test_grade_snapshot_payload_end_to_end,
        test_no_snapshot_means_honest_noop,
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
