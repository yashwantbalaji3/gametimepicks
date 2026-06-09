# UFC model plan (staged, launch-gated)

- **Stage 0 — schedule-only (NOW):** schedule artifact + readiness; no picks.
- **Stage 1 — market-implied baseline:** odds connected; de-vigged implied
  probabilities INTERNAL only; no public parlays.
- **Stage 2 — fighter-stat model:** stats + odds → calibrated moneyline
  probability (features: strike/TD off-def differentials, finish/decision rate,
  layoff, age, reach, opponent-quality proxy). Backtest (Brier, walk-forward)
  required before any public projection.
- **Stage 3 — method/round models:** only after sufficient data; separate
  per-market thresholds + calibration.
- **Stage 4 — public Suggested Parlays:** only after Results grading + backtest
  pass; strict Low/Bank controls; transparent methodology.

**Targets:** win (binary), method (multiclass), rounds (ordinal/total).
**Metrics:** Brier + calibration curve per market; min sample thresholds before
publishing (hundreds of graded fights). **Launch gates:** the readiness ladder
(`projectionsReady`/`parlayReady`). **Rollback:** flip a provider gate false →
readiness recomputes → picks lock; the public surface returns to data-gated states.
