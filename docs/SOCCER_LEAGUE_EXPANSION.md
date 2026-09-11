# Soccer league expansion — v1 backtest results (2026-09-11)

The model EPL publishes (`epl-model-v1-split-poisson`, unchanged, nothing tuned) was run walk-forward on four new
leagues from free football-data.co.uk results and judged by bars committed **before** any of those leagues was scored —
`data/internal/research/soccer/preregistration-league-expansion-v1.json`, final version 1.2. Both amendments were made
after scoring only the already-public EPL control; each is recorded in the file with its reason.

**Harness validity (H0): PASS.** EPL through the new harness reproduces the committed EPL evaluation exactly — every
season, all three models, to four decimals — so these numbers come from the arithmetic EPL was published on.

| League | Verdict | Holdout log loss (model) | Empirical | Elo | Closing market | Draw ECE, all scored seasons (bar ≤ 0.030) |
|---|---|---|---|---|---|---|
| Premier League | Control — parity pass | 1.045 | 1.0839 | 1.026 | 1.0118 | 0.0262 |
| LaLiga | Rejected | 1.0068 | 1.049 | 1.0011 | 0.965 | 0.0305 |
| Serie A | Rejected | 1.014 | 1.0891 | 1.0113 | 0.9784 | 0.0431 |
| Bundesliga | Rejected | 0.9946 | 1.0715 | 0.9835 | 0.951 | 0.045 |
| Ligue 1 | **Accepted** | 1.0127 | 1.0652 | 1.0019 | 0.9755 | 0.0271 |

Holdout = 2025-26, a full season never scored for these leagues. Bars: L1 beat empirical by 0.005 on the holdout;
L2 draw calibration over all scored seasons ≤ 0.030; L3 beat empirical by 0.005 in both development seasons.

## What it means

- **Ligue 1 — accepted.** It may publish model-only match forecasts, exactly as EPL does, once its public surface is built.
- **LaLiga (draw ECE 0.0305 — missed by 0.0005), Serie A (0.0431), Bundesliga (0.045) — rejected** on draw calibration
  alone; all three clear both skill bars comfortably. They stay rejected for this model version. The natural candidate is
  the Dixon-Coles low-score correction, which reweights exactly the cells that set the draw probability; it needs its own
  preregistration and a season nobody has looked at — 2026-27, graded forward.
- **Reported, never gating — the honest headline:** the closing market beats this model in every league by 0.033–0.044
  log loss, and plain Elo beats it in every league by 0.003–0.019. EPL's published model carries the same two limitations.
  Nothing here is, or may be described as, beating the market.

Reports: `data/internal/research/soccer/<league>/reports/walk-forward-v1.json` · registry: `app/src/lib/sports/soccer/leagues.mjs`.
