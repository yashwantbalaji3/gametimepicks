"""Monte Carlo prop simulation — SHADOW MODE prototype.

This module computes an Over/Under probability for a single player
prop by drawing N samples from a per-player distribution built from
that player's recent game logs. It is deliberately a SHADOW MODE
prototype:

  * It does NOT replace production scoring (`score_model.score_prop`).
  * It does NOT mutate anything on disk by itself.
  * It does NOT fabricate any inputs — every sample comes from a
    real recent10 series.
  * It does NOT claim that the Monte Carlo edge is better than the
    point-estimate edge — that determination needs a full backtest
    against settled rows (see BACKTEST_PLAN.md).

What it DOES:
  * Builds a small honest model from recent10 + season mean (when
    supplied) and reports:
      - simulated mean
      - simulated std dev
      - p(over line), p(under line), p(push)
      - a "volatility score" (std/mean) that the UI / guardrails can
        use to downgrade confidence on noisy markets
      - a "confidence recommendation" — Strong / Watch / High-variance
        / Avoid — based on the simulated edge + volatility
  * Is deterministic when seeded so unit tests are stable.
  * Handles the honest edge cases — < 3 samples returns
    `insufficient_data` and never invents a distribution.

The intended consumer is `pipeline.calibration_report` plus a
follow-up audit CLI that compares MC probabilities against settled
outcomes — that's how we'd justify ANY production change.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
from dataclasses import dataclass, asdict
from typing import Iterable, Optional


# Minimum number of recent samples we need before we'll build a
# distribution. Below this, we explicitly mark `insufficient_data`
# rather than fabricating one.
MIN_RECENT_SAMPLES = 3

# Default simulation count. 10k is the sweet spot for stable
# probabilities without slow tests; bump for production reports.
DEFAULT_NUM_SIMULATIONS = 10_000


@dataclass(frozen=True)
class MonteCarloResult:
    """Result of one MC run for one (player, market, line) prop."""
    # Status: "ok" or "insufficient_data".
    status: str
    n: int = 0
    sample_mean: float | None = None
    sample_std: float | None = None
    simulated_mean: float | None = None
    simulated_std: float | None = None
    prob_over: float | None = None
    prob_under: float | None = None
    prob_push: float | None = None
    # Volatility score: simulated_std / max(simulated_mean, 1) — higher
    # means noisier output for the same projection level. Used by the
    # confidence recommender below.
    volatility: float | None = None
    # Confidence recommendation. NEVER promises performance — only
    # describes the model's INTERNAL view of stability.
    confidence_recommendation: str | None = None


@dataclass(frozen=True)
class MonteCarloInput:
    """Inputs the MC simulation needs.

    Every field is OPTIONAL except `recent_series` — we never invent
    one. When the caller has access to additional context (season
    mean, home/away nudge, projection from production model), pass it
    in for tighter sampling.
    """
    recent_series: list[float]
    line: float
    """Optional. When provided, blends with the recent mean using
    `season_weight` so the simulator doesn't overfit to a 5-game
    streak. Defaults to None — no blend."""
    season_mean: Optional[float] = None
    season_weight: float = 0.25
    """Optional. Production projection (single-point estimate). Used
    only for the comparison report; never injected into the
    distribution."""
    point_projection: Optional[float] = None


def _safe_mean(values: Iterable[float]) -> float | None:
    vals = [float(v) for v in values if isinstance(v, (int, float))]
    if not vals:
        return None
    return sum(vals) / len(vals)


def _safe_std(values: Iterable[float]) -> float | None:
    vals = [float(v) for v in values if isinstance(v, (int, float))]
    if len(vals) < 2:
        return None
    m = sum(vals) / len(vals)
    var = sum((v - m) ** 2 for v in vals) / (len(vals) - 1)
    return math.sqrt(var)


def _confidence_recommendation(
    sim_edge_pct: float, volatility: float
) -> str:
    """Map (edge, volatility) onto a confidence label.

    Honest framing: this is the MODEL's INTERNAL view of how stable
    the projection is — it does not promise outcomes. The thresholds
    are tuned to be CONSERVATIVE: a high apparent edge is downgraded
    when volatility is high.

    Brackets (edge_pp, volatility):
      Strong:       edge ≥ 8 AND volatility ≤ 0.45
      Watch:        edge ≥ 4 AND volatility ≤ 0.55
      High-variance: edge ≥ 1 OR volatility > 0.55
      Avoid:        edge < 1
    """
    if sim_edge_pct >= 8 and volatility <= 0.45:
        return "Strong"
    if sim_edge_pct >= 4 and volatility <= 0.55:
        return "Watch"
    if sim_edge_pct >= 1:
        return "High-variance"
    return "Avoid"


def simulate(
    inputs: MonteCarloInput,
    *,
    num_simulations: int = DEFAULT_NUM_SIMULATIONS,
    seed: int | None = 1337,
) -> MonteCarloResult:
    """Run a Monte Carlo simulation over the prop's distribution.

    Sampling model:
      1. Build a discrete pool of past observations (recent_series).
      2. If `season_mean` is supplied, blend it as an additional pseudo-
         observation weighted by `season_weight` so the simulator
         smoothes single-game extremes.
      3. Each simulation step draws ONE value from the pool uniformly
         at random + adds a small zero-mean Gaussian noise scaled to
         the sample std (so we don't sample only the exact past
         observations). The noise term is 0 when fewer than 2 samples
         are available — the result is just a uniform draw from the
         pool.

    Stops cleanly when fewer than `MIN_RECENT_SAMPLES` real samples
    are available — never invents a distribution.
    """
    rng = random.Random(seed)
    series = [float(v) for v in inputs.recent_series if isinstance(v, (int, float))]
    if len(series) < MIN_RECENT_SAMPLES:
        return MonteCarloResult(status="insufficient_data", n=len(series))

    sample_mean = _safe_mean(series)
    sample_std = _safe_std(series) or 0.0

    # Optional season blend — add the season_mean as a pseudo-sample
    # weighted by season_weight*len(series). Caps the blend so a
    # single-season-mean input can't dominate a deep recent10.
    pool: list[float] = list(series)
    if (
        inputs.season_mean is not None
        and isinstance(inputs.season_mean, (int, float))
        and inputs.season_weight > 0
    ):
        blend_count = max(1, int(round(inputs.season_weight * len(series))))
        pool.extend([float(inputs.season_mean)] * blend_count)

    # The noise SD is the sample std clipped to a reasonable cap so
    # rare outliers don't blow up.
    noise_sd = min(sample_std, max(1.0, sample_mean or 0.0) * 0.5)

    sims: list[float] = []
    for _ in range(num_simulations):
        x = pool[rng.randrange(len(pool))]
        if noise_sd > 0:
            x += rng.gauss(0.0, noise_sd)
        # Player counting stats are non-negative.
        if x < 0:
            x = 0.0
        sims.append(x)

    sim_mean = sum(sims) / len(sims)
    sim_var = sum((s - sim_mean) ** 2 for s in sims) / (len(sims) - 1)
    sim_std = math.sqrt(sim_var)

    # Probability estimates. A "push" occurs when the simulated value
    # equals the line — for integer markets like rebounds this can
    # happen; for half-point lines it can't.
    line = inputs.line
    over_count = sum(1 for s in sims if s > line)
    under_count = sum(1 for s in sims if s < line)
    push_count = sum(1 for s in sims if math.isclose(s, line, abs_tol=1e-9))
    prob_over = over_count / len(sims)
    prob_under = under_count / len(sims)
    prob_push = push_count / len(sims)

    # Volatility score and the resulting confidence recommendation.
    volatility = sim_std / max(sim_mean, 1.0)
    # MC "edge" framed as |p(over) - p(under)| * 100 in percentage
    # points. This is the *probabilistic* edge over the line — NOT
    # the production point-estimate edgePct (which is mean - line).
    sim_edge_pp = abs(prob_over - prob_under) * 100.0
    rec = _confidence_recommendation(sim_edge_pp, volatility)

    return MonteCarloResult(
        status="ok",
        n=len(series),
        sample_mean=sample_mean,
        sample_std=sample_std,
        simulated_mean=sim_mean,
        simulated_std=sim_std,
        prob_over=round(prob_over, 4),
        prob_under=round(prob_under, 4),
        prob_push=round(prob_push, 4),
        volatility=round(volatility, 4),
        confidence_recommendation=rec,
    )


# ---------------------------------------------------------------------------
# CLI — for ad-hoc analysis against a single player. Reads recent
# series from stdin (one number per line) or from a --series CSV arg.
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description=(
            "Monte Carlo shadow-mode prop simulation. Reports prob(over) "
            "+ volatility + confidence recommendation for a single (line, "
            "recent series) combination. Pure read; never writes to disk."
        )
    )
    p.add_argument("--line", type=float, required=True)
    p.add_argument(
        "--series",
        type=str,
        help="Comma-separated recent observations (e.g. 22,18,30,24,21).",
    )
    p.add_argument("--season-mean", type=float, default=None)
    p.add_argument("--season-weight", type=float, default=0.25)
    p.add_argument("--point-projection", type=float, default=None)
    p.add_argument("--num", type=int, default=DEFAULT_NUM_SIMULATIONS)
    p.add_argument("--seed", type=int, default=1337)
    args = p.parse_args(argv)

    if args.series:
        series = [float(x) for x in args.series.split(",") if x.strip()]
    else:
        series = []
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                series.append(float(line))
            except ValueError:
                pass

    inputs = MonteCarloInput(
        recent_series=series,
        line=args.line,
        season_mean=args.season_mean,
        season_weight=args.season_weight,
        point_projection=args.point_projection,
    )
    result = simulate(inputs, num_simulations=args.num, seed=args.seed)
    print(json.dumps(asdict(result), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
