# MLB Full-Game Sim — Rolling Backtest Report (2026-07-09)

**Verdict: `insufficient_sample`.** The market-anchored simulation tracks the market baseline (as
designed) on the only date with committed lines. It does not — and on this sample cannot — beat the
market. Nothing about this justifies public rollout or product use.

Money md5 `affe6b21071f2b3be96bb2774eb347c3` — unchanged (read-only backtest).

---

## Dates tested + data

| item | value |
|---|---|
| dates with committed team-market lines | **1** (2026-07-09) |
| games graded (final + committed line) | 9 |
| finals source | StatsAPI schedule (free) |
| market baseline | de-vigged moneyline / total / run line |
| independent inputs used | **none** (engine is market-anchored; see the model-inputs audit) |

## Metrics (2026-07-09)

| metric | sim | market baseline |
|---|---|---|
| moneyline Brier | **0.2367** | 0.2360 |
| projected-total MAE | 4.82 | 4.82 (market line) |
| win-prob calibration | coarse thirds; N too small to read |

## Reading (blunt)

- The sim's moneyline Brier (0.2367) is **essentially equal** to the market's (0.2360) — it does **not**
  beat the market. Expected: the simulation is market-anchored, so its point estimates ARE the market's.
- Projected-total MAE equals the market line's — again, anchored.
- **The sample is one date / 9 games** — far too small to conclude anything. Flagged `INSUFFICIENT
  SAMPLE` in the artifact.

## Leakage

The engine has no learned parameters, so no future data can leak into a graded date. The harness
processes dates in ascending order; any future learned parameter (e.g. a fitted dispersion) MUST be fit
only from strictly-earlier dates — documented invariant.

## Why not ready + what's needed next

- **Not ready** because it is market-anchored (no independent edge) and the sample is one date.
- **Sample size needed:** many dates (target ≥ ~50 games minimum before even a weak read), which requires
  **committing team-market lines daily** — the single binding constraint.
- **To beat the market:** add real independent inputs (pitcher strength, park, bullpen) and re-fit, then
  re-run the rolling backtest and require a Brier/calibration improvement over the market baseline.

## What stays blocked

Public rollout, Bank Builder / Moonshot use, product-card eligibility, and any "beats the market" claim
— all blocked. The engine + artifacts stay internal.
