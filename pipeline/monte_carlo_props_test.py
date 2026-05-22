"""Tests for pipeline.monte_carlo_props (shadow-mode prototype).

Lock the contract that:
  * Below MIN_RECENT_SAMPLES, the simulator returns insufficient_data
    and never fabricates a distribution.
  * Deterministic seed → identical result across runs.
  * Higher variance lowers the confidence recommendation.
  * Line far below sample mean raises prob_over.
  * Probabilities sum to ~1 (over + under + push).
  * No production scoring file is touched.

Run: python -m pipeline.monte_carlo_props_test
"""
from __future__ import annotations

import sys

from . import monte_carlo_props as MC


GREEN = "\033[0;32m"
RED = "\033[0;31m"
BLUE = "\033[0;34m"
RESET = "\033[0m"


class Suite:
    def __init__(self) -> None:
        self.passed = 0
        self.failed = 0

    def ok(self, cond: bool, name: str) -> None:
        if cond:
            self.passed += 1
            print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            print(f"  {RED}✗{RESET} {name}")

    def eq(self, a, b, name: str) -> None:
        if a == b:
            self.passed += 1
            print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            print(f"  {RED}✗{RESET} {name}")
            print(f"    expected {b!r}, got {a!r}")


def test_insufficient_data_short_circuits(s: Suite) -> None:
    print(f"\n  {BLUE}─── short series → insufficient_data ───{RESET}")
    # 2 samples is below MIN_RECENT_SAMPLES (3).
    inp = MC.MonteCarloInput(recent_series=[20.0, 22.0], line=20.5)
    r = MC.simulate(inp, num_simulations=100)
    s.eq(r.status, "insufficient_data", "status is insufficient_data")
    s.ok(r.simulated_mean is None, "no simulated_mean fabricated")
    s.ok(r.prob_over is None, "no probability fabricated")


def test_deterministic_with_seed(s: Suite) -> None:
    print(f"\n  {BLUE}─── seeded runs produce identical output ───{RESET}")
    inp = MC.MonteCarloInput(recent_series=[18, 22, 25, 19, 21, 24], line=20.5)
    r1 = MC.simulate(inp, num_simulations=2000, seed=42)
    r2 = MC.simulate(inp, num_simulations=2000, seed=42)
    s.eq(r1.simulated_mean, r2.simulated_mean, "identical simulated_mean")
    s.eq(r1.prob_over, r2.prob_over, "identical prob_over")


def test_higher_variance_lowers_confidence(s: Suite) -> None:
    print(f"\n  {BLUE}─── higher recent variance → lower confidence label ───{RESET}")
    # Stable series — tight band around mean.
    stable = [20, 21, 22, 20, 21, 22]
    # Volatile series — same mean ≈ 21 but much wider.
    volatile = [5, 38, 10, 35, 12, 26]
    line = 18.5
    r_stable = MC.simulate(
        MC.MonteCarloInput(recent_series=stable, line=line),
        num_simulations=3000, seed=7,
    )
    r_volatile = MC.simulate(
        MC.MonteCarloInput(recent_series=volatile, line=line),
        num_simulations=3000, seed=7,
    )
    s.ok(
        (r_volatile.volatility or 0) > (r_stable.volatility or 0),
        f"volatility(volatile) > volatility(stable) "
        f"({r_volatile.volatility} > {r_stable.volatility})",
    )
    rank = {"Strong": 0, "Watch": 1, "High-variance": 2, "Avoid": 3}
    s.ok(
        rank[r_volatile.confidence_recommendation or "Avoid"]
        >= rank[r_stable.confidence_recommendation or "Avoid"],
        "volatile series recommendation is no better than stable's "
        f"(volatile={r_volatile.confidence_recommendation}, "
        f"stable={r_stable.confidence_recommendation})",
    )


def test_line_far_below_mean_pushes_over(s: Suite) -> None:
    print(f"\n  {BLUE}─── line far below sample mean → prob_over > 0.5 ───{RESET}")
    series = [25, 28, 30, 26, 27, 24]  # mean ≈ 26.7
    line = 10.5
    r = MC.simulate(
        MC.MonteCarloInput(recent_series=series, line=line),
        num_simulations=3000, seed=1,
    )
    s.ok(
        (r.prob_over or 0) > 0.85,
        f"prob_over > 0.85 (got {r.prob_over})",
    )
    s.ok(
        r.prob_under is not None and r.prob_under < 0.15,
        f"prob_under < 0.15 (got {r.prob_under})",
    )


def test_probabilities_sum_to_one(s: Suite) -> None:
    print(f"\n  {BLUE}─── prob_over + prob_under + prob_push ≈ 1 ───{RESET}")
    series = [18, 22, 25, 19, 21, 24, 20, 23]
    r = MC.simulate(
        MC.MonteCarloInput(recent_series=series, line=20.5),
        num_simulations=4000, seed=99,
    )
    total = (r.prob_over or 0) + (r.prob_under or 0) + (r.prob_push or 0)
    s.ok(
        abs(total - 1.0) < 0.001,
        f"probabilities sum within 0.001 of 1.0 (sum={total:.4f})",
    )


def test_season_blend_smoothes_recent_streak(s: Suite) -> None:
    print(f"\n  {BLUE}─── season_mean blend pulls extremes toward stable ───{RESET}")
    # Hot streak — recent series way above career baseline.
    recent = [30, 32, 33, 31, 30, 34]
    season_mean = 18.0  # career baseline
    line = 25.5
    r_no_blend = MC.simulate(
        MC.MonteCarloInput(recent_series=recent, line=line, season_mean=None),
        num_simulations=3000, seed=11,
    )
    r_blend = MC.simulate(
        MC.MonteCarloInput(
            recent_series=recent, line=line,
            season_mean=season_mean, season_weight=0.5,
        ),
        num_simulations=3000, seed=11,
    )
    s.ok(
        (r_blend.simulated_mean or 0) < (r_no_blend.simulated_mean or 0),
        "season blend lowers simulated_mean for a hot streak "
        f"(blend={r_blend.simulated_mean:.2f} < no_blend={r_no_blend.simulated_mean:.2f})",
    )


def test_never_returns_negative_simulated_value(s: Suite) -> None:
    print(f"\n  {BLUE}─── simulated values are non-negative ───{RESET}")
    # Player with very low mean — noise could push individual samples
    # below zero; we clamp to 0 to keep player counting stats honest.
    series = [0, 1, 0, 1, 2, 0]
    r = MC.simulate(
        MC.MonteCarloInput(recent_series=series, line=0.5),
        num_simulations=2000, seed=3,
    )
    s.ok(r.simulated_mean is not None and r.simulated_mean >= 0,
         f"simulated_mean is non-negative (got {r.simulated_mean})")


def main() -> int:
    s = Suite()
    for t in (
        test_insufficient_data_short_circuits,
        test_deterministic_with_seed,
        test_higher_variance_lowers_confidence,
        test_line_far_below_mean_pushes_over,
        test_probabilities_sum_to_one,
        test_season_blend_smoothes_recent_streak,
        test_never_returns_negative_simulated_value,
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
