"""
Deterministic tests for pipeline.credit_guard.

Zero network. The real `_fetch_remaining` reaches the Odds API; we
inject a fake fetcher via the `fetch` keyword so the tests stay
offline. Every assertion exercises a decision boundary the orchestrator
relies on (cap, floor, missing key, probe failure, exact-floor edge).

Run:  python -m pipeline.credit_guard_test
"""
from __future__ import annotations

import sys

from . import credit_guard as CG


# ---------------------------------------------------------------------------
# Suite scaffolding — same shape as settle_test.Suite, kept local so the
# guard module's test surface stays self-contained.
# ---------------------------------------------------------------------------
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
            print(f"    expected: {expected!r}")
            print(f"    got:      {actual!r}")

    def assert_true(self, cond, name):
        if cond:
            self.passed += 1
            print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            self.failures.append(f"{name}: condition was false")
            print(f"  {RED}✗{RESET} {name}")


def _fake_fetch(remaining: int | None):
    """Return a fetcher that responds with the given balance value."""

    def fetch(_api_key: str):
        if remaining is None:
            return None
        return {"x-requests-remaining": str(remaining)}

    return fetch


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
def test_ok_path(s: Suite) -> None:
    print(f"\n  {BLUE}─── ok: balance well above floor ───{RESET}")
    d = CG.check_balance(
        api_key="real-or-not",
        estimated_cost=45,
        max_per_run=75,
        min_remaining=300,
        fetch=_fake_fetch(368),
    )
    s.assert_eq(d.ok, True, "decision.ok = True")
    s.assert_eq(d.remaining, 368, "remaining = 368")
    s.assert_eq(d.projected_after, 323, "projected_after = 368 - 45 = 323")
    s.assert_true("OK" in d.reason, "reason starts with OK")


def test_cap_exceeded(s: Suite) -> None:
    print(f"\n  {BLUE}─── stop: estimated cost above per-run cap ───{RESET}")
    d = CG.check_balance(
        api_key="x",
        estimated_cost=100,
        max_per_run=75,
        min_remaining=300,
        fetch=_fake_fetch(500),
    )
    s.assert_eq(d.ok, False, "decision.ok = False when cost > cap")
    s.assert_true("exceeds per-run cap" in d.reason, "reason names the cap")
    s.assert_eq(d.remaining, None, "remaining left None when guard refuses before probe")


def test_floor_breach(s: Suite) -> None:
    print(f"\n  {BLUE}─── stop: post-run balance below floor ───{RESET}")
    d = CG.check_balance(
        api_key="x",
        estimated_cost=50,
        max_per_run=75,
        min_remaining=300,
        fetch=_fake_fetch(320),
    )
    s.assert_eq(d.ok, False, "decision.ok = False when projected_after < floor")
    s.assert_eq(d.remaining, 320, "remaining still reported")
    s.assert_eq(d.projected_after, 270, "projected_after = 320 - 50 = 270")
    s.assert_true("below floor" in d.reason, "reason names the floor")


def test_floor_exact_match(s: Suite) -> None:
    print(f"\n  {BLUE}─── ok: post-run balance exactly equals floor ───{RESET}")
    # Exact-equality at the floor must be allowed — the floor is the
    # minimum tolerable post-spend balance, not a strict lower bound.
    d = CG.check_balance(
        api_key="x",
        estimated_cost=20,
        max_per_run=75,
        min_remaining=300,
        fetch=_fake_fetch(320),
    )
    s.assert_eq(d.ok, True, "decision.ok = True when projected_after == floor")
    s.assert_eq(d.projected_after, 300, "projected_after = 320 - 20 = 300 (floor)")


def test_missing_key(s: Suite) -> None:
    print(f"\n  {BLUE}─── stop: ODDS_API_KEY not set ───{RESET}")
    d = CG.check_balance(
        api_key="",
        estimated_cost=10,
        max_per_run=75,
        min_remaining=300,
        fetch=_fake_fetch(500),
    )
    s.assert_eq(d.ok, False, "decision.ok = False when api_key is empty")
    s.assert_true("not set" in d.reason, "reason cites missing key")


def test_probe_failure(s: Suite) -> None:
    print(f"\n  {BLUE}─── stop: probe failed (network / 401 / bad header) ───{RESET}")
    d = CG.check_balance(
        api_key="x",
        estimated_cost=10,
        max_per_run=75,
        min_remaining=300,
        fetch=_fake_fetch(None),
    )
    s.assert_eq(d.ok, False, "decision.ok = False when probe returns None")
    s.assert_true("probe failed" in d.reason, "reason cites probe failure")


def test_negative_cost_refused(s: Suite) -> None:
    print(f"\n  {BLUE}─── stop: negative cost is refused ───{RESET}")
    d = CG.check_balance(
        api_key="x",
        estimated_cost=-5,
        max_per_run=75,
        min_remaining=300,
        fetch=_fake_fetch(500),
    )
    s.assert_eq(d.ok, False, "decision.ok = False on negative cost")
    s.assert_true("negative" in d.reason, "reason calls out negative cost")


def test_zero_cost_allowed(s: Suite) -> None:
    print(f"\n  {BLUE}─── ok: zero cost is a free balance probe ───{RESET}")
    # The orchestrator uses estimated_cost=0 after a run to read the
    # post-spend balance for logging. That must succeed when funds exist.
    d = CG.check_balance(
        api_key="x",
        estimated_cost=0,
        max_per_run=75,
        min_remaining=300,
        fetch=_fake_fetch(400),
    )
    s.assert_eq(d.ok, True, "decision.ok = True on zero cost above floor")
    s.assert_eq(d.projected_after, 400, "projected_after = remaining when cost=0")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> int:
    print()
    print(f"  credit_guard tests")
    print(f"  zero network · zero file writes")

    s = Suite()
    test_ok_path(s)
    test_cap_exceeded(s)
    test_floor_breach(s)
    test_floor_exact_match(s)
    test_missing_key(s)
    test_probe_failure(s)
    test_negative_cost_refused(s)
    test_zero_cost_allowed(s)

    print()
    if s.failed == 0:
        print(f"  {GREEN}✓ all {s.passed} credit_guard assertions passed{RESET}")
        return 0
    print(f"  {RED}✗ {s.failed} of {s.passed + s.failed} credit_guard assertions failed{RESET}")
    for f in s.failures:
        print(f"    - {f}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
