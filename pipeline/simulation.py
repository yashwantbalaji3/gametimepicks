"""
Phase 19 — pipeline.simulation  (EXPERIMENTAL — NOT IN PRODUCTION)

Lightweight Monte Carlo prototype for NBA player-prop simulation.

⚠  This module is *experimental*. It is NOT wired into board generation,
   confidence scoring, or Parlay Lab logic. It exists so the team can
   start building intuition for distribution-based modeling without
   risking the live model.

What v1 (this file) does:

  - Models a single player-market projection as a normal distribution
    parameterized by (mean=projection, std=projection × variance_pct).
  - Simulates N trials per leg.
  - Estimates P(over) / P(under) from sample frequencies.
  - Compares model probability to implied probability from American odds.

What v1 deliberately does NOT do:

  - No correlated multi-leg simulation (Phase 19 v2/v3).
  - No bootstrapped recent-game logs (v2).
  - No Bayesian shrinkage to season averages (v2).
  - No opponent-adjusted means (v2).
  - No minutes/usage marginalization (v3).
  - No backtest harness (v3).
  - No production-grade calibration curve (v3).

Determinism contract:

  - When `seed` is provided, simulate_leg() returns the same probability
    on every call. Tests rely on this.
  - When seed is None, np.random global state is used (non-deterministic).

This file uses ONLY the Python standard library — no numpy, no scipy.
Simulation is small and slow on purpose; if/when v2 lands we can
introduce numpy with explicit benchmarks. Keeping stdlib-only for v1
means zero new dependencies in the workflow.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Inputs / outputs
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class LegInput:
    """A single player-market leg to simulate."""
    player_name: str
    market: str          # "PTS" | "REB" | "AST"
    side: str            # "Over" | "Under"
    line: float
    projection: float    # model's mean
    variance_pct: float = 0.30  # std as fraction of mean. Sane default for NBA.
    odds_american: int | None = None   # e.g. -110 / +135
    minutes_proj: float | None = None  # optional: future v2 hook
    usage_proj: float | None = None    # optional: future v2 hook


@dataclass
class LegSimulation:
    """Result of simulating a single leg."""
    leg: LegInput
    trials: int
    mean_sample: float
    std_sample: float
    p_over: float        # frequency of (sample > line)
    p_under: float       # frequency of (sample < line)
    p_push: float        # frequency of (sample == line)  — typically 0 for continuous
    p_lean_side: float   # P(leg's stated side wins)
    implied_prob: float | None = None  # from odds
    edge_pct: float | None = None      # p_lean_side - implied_prob, in pp


@dataclass
class ParlaySimulation:
    """Aggregate result of simulating multiple legs together (independent for v1)."""
    legs: list[LegSimulation]
    p_all_hit: float                 # joint probability the parlay wins
    expected_legs_won: float
    warnings: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Odds helpers (kept local — minimal dependency footprint)
# ---------------------------------------------------------------------------

def american_to_implied(odds: int) -> float:
    """Convert American odds to no-vig-removed implied probability."""
    if odds > 0:
        return 100 / (odds + 100)
    return -odds / (-odds + 100)


# ---------------------------------------------------------------------------
# Simulation core
# ---------------------------------------------------------------------------

def _validate_leg(leg: LegInput) -> None:
    if leg.side not in ("Over", "Under"):
        raise ValueError(f"side must be Over/Under, got {leg.side!r}")
    if leg.market not in ("PTS", "REB", "AST"):
        raise ValueError(f"market must be PTS/REB/AST, got {leg.market!r}")
    if leg.projection <= 0:
        raise ValueError(f"projection must be > 0, got {leg.projection}")
    if leg.line < 0:
        raise ValueError(f"line must be >= 0, got {leg.line}")
    if leg.variance_pct <= 0 or leg.variance_pct > 1.5:
        raise ValueError(
            f"variance_pct out of plausible NBA range (0, 1.5], got {leg.variance_pct}"
        )


def simulate_leg(
    leg: LegInput,
    *,
    trials: int = 5000,
    seed: int | None = None,
) -> LegSimulation:
    """
    v1 simulator: normal distribution centered on `projection` with
    std = projection × variance_pct.

    Truncates samples at 0 (negative PTS/REB/AST is impossible). This
    introduces a slight upward bias for very low projections (under 5);
    the bias is documented and fine for v1 since we never model
    leans on very-low-mean markets in practice.
    """
    if not isinstance(leg, LegInput):
        raise TypeError("simulate_leg expects a LegInput")
    if trials < 100:
        raise ValueError(f"trials too low for stable estimate, got {trials}")
    if leg.side not in ("Over", "Under"):
        raise ValueError(f"side must be Over/Under, got {leg.side!r}")
    if leg.market not in ("PTS", "REB", "AST"):
        raise ValueError(f"market must be PTS/REB/AST, got {leg.market!r}")
    if leg.projection <= 0:
        raise ValueError(f"projection must be > 0, got {leg.projection}")
    if leg.variance_pct <= 0 or leg.variance_pct > 1.5:
        raise ValueError(f"variance_pct out of range, got {leg.variance_pct}")

    rng = random.Random(seed) if seed is not None else random.Random()
    mu = leg.projection
    sigma = leg.projection * leg.variance_pct

    over = under = push = 0
    samples: list[float] = []
    for _ in range(trials):
        s = rng.gauss(mu, sigma)
        s = max(0.0, s)  # clamp impossible negatives
        samples.append(s)
        # We treat "exactly equal to line" as push, but with continuous
        # distributions this is essentially zero probability.
        if s > leg.line:
            over += 1
        elif s < leg.line:
            under += 1
        else:
            push += 1

    p_over = over / trials
    p_under = under / trials
    p_push = push / trials
    p_lean = p_over if leg.side == "Over" else p_under

    implied = (
        american_to_implied(leg.odds_american)
        if leg.odds_american is not None
        else None
    )
    edge = (p_lean - implied) * 100 if implied is not None else None

    n = len(samples)
    mean_s = sum(samples) / n
    var_s = sum((x - mean_s) ** 2 for x in samples) / n
    std_s = math.sqrt(var_s)

    return LegSimulation(
        leg=leg,
        trials=trials,
        mean_sample=mean_s,
        std_sample=std_s,
        p_over=p_over,
        p_under=p_under,
        p_push=p_push,
        p_lean_side=p_lean,
        implied_prob=implied,
        edge_pct=edge,
    )


def simulate_parlay(
    legs: list[LegInput],
    *,
    trials: int = 5000,
    seed: int | None = None,
) -> ParlaySimulation:
    """
    v1 parlay simulator: assumes legs are INDEPENDENT.

    This is intentionally wrong for same-game parlays — see roadmap.
    A clear warning is emitted whenever multiple legs share a player or
    (in v2) the same gameId. Users should not interpret v1 parlay
    probabilities as production-grade.
    """
    if not legs:
        raise ValueError("simulate_parlay requires at least one leg")

    # Each leg gets its own deterministic seed derived from the parent.
    leg_sims = [
        simulate_leg(
            leg,
            trials=trials,
            seed=None if seed is None else seed + i,
        )
        for i, leg in enumerate(legs)
    ]

    p_all = 1.0
    for ls in leg_sims:
        p_all *= ls.p_lean_side
    expected_won = sum(ls.p_lean_side for ls in leg_sims)

    warnings: list[str] = []
    # Same-player check
    names = [l.player_name for l in legs]
    if len(set(names)) < len(names):
        warnings.append(
            "Multiple legs target the same player — independence assumption "
            "is wrong. v2 will model correlation."
        )
    if len(legs) >= 4:
        warnings.append(
            "Long parlays (4+ legs) compound model uncertainty multiplicatively. "
            "v1 does not adjust for this."
        )

    return ParlaySimulation(
        legs=leg_sims,
        p_all_hit=p_all,
        expected_legs_won=expected_won,
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# Reasonable variance defaults — calibration data, not commitments
# ---------------------------------------------------------------------------

# These are rough rules of thumb for NBA distributions when we don't have
# a player-specific recent10 to compute std from. v2 will replace these
# with per-player std computed from real game logs.
DEFAULT_VARIANCE_PCT = {
    "PTS": 0.30,   # PTS std ≈ 30% of mean for typical starters
    "REB": 0.40,   # REB more volatile per-game
    "AST": 0.45,   # AST most volatile
}


def variance_pct_default(market: str) -> float:
    """Return default variance_pct for a market. Public — used by callers
    that don't have player-specific calibration data."""
    return DEFAULT_VARIANCE_PCT.get(market, 0.35)


__all__ = [
    "LegInput",
    "LegSimulation",
    "ParlaySimulation",
    "american_to_implied",
    "simulate_leg",
    "simulate_parlay",
    "variance_pct_default",
    "DEFAULT_VARIANCE_PCT",
]
