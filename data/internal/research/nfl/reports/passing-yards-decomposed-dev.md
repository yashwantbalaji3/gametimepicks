# NFL passing yards — decomposed candidate, development result (P318 / P332, 2026-09-15)

**Status:** DEV ONLY · **STOP — not registered.** The candidate meets the design note's typical-miss, level and coverage bars
on the development seasons but sits exactly at the calibration bar, and a bar met by one thousandth on the set it was tuned
on is not a cleared bar. The public family stays the founder-approved **ESTIMATE**. Nothing here touches 2014–2021 (a second
look for this family) or the 2026 forward record.

## Candidate (genuinely different from P300)
`passYds = attempts × yards-per-attempt`, each part forecast from prior games only (`scripts/research/nfl/explore-passing-yards-decomposed.mjs`):
team pass attempts (decayed mean, half-life 6 games, season decay 0.85, prior 4 games toward the running league mean); the named
QB's decayed share of attempts on games he played (no pull toward zero; the candidate is the team's highest-share QB whose last
played game is one of the team's last three — a departed or benched QB is VOID, never a candidate); yards per attempt shrunk
toward the running league rate with a 150-attempt prior; combined by 2,000 seeded draws, attempts ~ NegBin(size R), Y/A ~ Gamma(cv).
P300 forecast the yardage total as a share of team volume; this forecasts attempts and efficiency separately.

## Development evidence (2022–2025, 1,816 scored QB-games, 347 void, 11 team-games with no candidate)
Evidence file: `passing-yards-decomposed-dev.json`. Only the dispersion pair (R, cv) was a grid, as the props preregistration convention allows.

| dispersion (R, cv) | MAE p50 | vs rolling-4 (65.2) | level | p10–p90 coverage | width | ECE at rolling-4 line |
|---|---|---|---|---|---|---|
| 25, 0.25 | 60.7 | better | 1.007 | 0.836 | 210 | **0.0499** |
| 40, 0.25 | 60.5 | better | 1.007 | 0.815 | 199 | 0.0512 |
| 25, 0.30 | 61.0 | better | 1.007 | 0.865 | 230 | 0.0568 |
| 15, 0.25 | 61.0 | better | 1.007 | 0.865 | 229 | 0.0560 |

By season (25, 0.30): MAE 55.6 / 65.0 / 61.5 / 61.7 for 2022–2025; level 0.995–1.020; coverage 0.83–0.89. Attempts alone miss by
6.9 per game. The live ESTIMATE's dev MAE is 65.3 (design note); the rolling-4 median's is 65.2.

## Reading
- **Typical miss improves by about 7%** over both baselines, on every season — the decomposition is worth something.
- **Level is fixed** (1.007): forecasting attempts removes the low bias P299 carried.
- **Calibration is at the bar, not past it.** The dispersion pair the convention would choose (coverage nearest 0.80 → R 40,
  cv 0.25) reads ECE 0.051 > 0.05; the pair that reads 0.0499 was chosen by the bar itself. Coverage runs above 0.80 for every
  pair while ECE sits at 0.05: the ranges are slightly wide in the middle and slightly mis-shaped at the rolling-4 line.

## Decision
No registration; no second look; no forward protocol. Passing yards stays ESTIMATE. The next development step, if the founder
wants it, is a calibration-shaped change declared before any further look — a heavier-tailed Y/A family or an attempts variance
that grows with the pass-rate uncertainty — evaluated on the same development seasons under the same fixed constants, then a
registration only if ECE clears 0.05 with the coverage-chosen dispersion.
