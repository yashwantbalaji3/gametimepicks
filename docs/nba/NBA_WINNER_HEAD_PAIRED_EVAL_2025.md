# NBA winner head: paired Elo vs v1 evaluation, 2024-25 development season

**Status:** RESEARCH COMPLETED · private · promotes nothing, validates nothing (preregistration §8: only forward-shadow, regular-season, frozen-pre-tip forecasts count).
**Artifact:** `data/internal/research/nba/reports/winner-head-paired-2025.json` (per-game pairs included)
**Harness:** `app/scripts/nba/research/winner-head-paired-eval.mjs` (same sample, inputs and frozen parameters as `evaluate-sim-v1.mjs`), `paired-metrics.mjs` (+ test)

## Why

- The official NBA winner is the **Elo side** (founder N2; `nba-official-composition@1`, PR #1149).
- On opening night, v1's pHome sat **0.037–0.047 below Elo** in all 3 games.
- The aggregate dev report had v1 ahead of Elo on Brier and log loss, but with **no interval**, so it supported no claim either way.

## Result (n = 1,005 games, 2024-25 regular season, ≥ 30 days in)

| | Elo | v1 (`nba-sim-v1-coherent`, 4,000 sims) |
|---|---|---|
| Mean pHome | 0.584 | 0.547 |
| Realized home win rate | 0.530 | 0.530 |
| Brier | 0.2147 | 0.2122 |
| Log loss | 0.6175 | 0.6117 |
| ECE (10 bins) | 0.054 | 0.025 |

**Paired difference, v1 − Elo** (2,000-resample paired bootstrap, seed `nba-winner-head-2025`):

| Metric | Mean | 95% interval | Excludes 0 |
|---|---|---|---|
| Log loss | −0.0059 | [−0.0110, −0.0009] | yes (v1 lower) |
| Brier | −0.0026 | [−0.0049, −0.0004] | yes (v1 lower) |

- **The v1 − Elo gap is systematic:** v1 is below Elo in **98.4%** of games, mean −0.037. That matches opening night (−0.037 to −0.047), so the opening-night gap is not an engine malfunction.
- **Elo's reliability shows the cause:** it overstates the home side in the middle bins. Predicted 0.46 → realized 0.36 (n = 136); 0.55 → 0.48 (n = 178); 0.65 → 0.60 (n = 201). That is consistent with `HOME_ADVANTAGE = 70` rating points being too large for this season.
- **Elo and v1 favour different sides in 72 of 1,005 games.** v1's side won 43 of those (60%, n = 72, small).

## What it means (and what it does not)

1. **The NBA Theater anchor in #1149 must not be read as "v1 must move toward Elo".** On this evidence the Elo head is the less calibrated one. Anchoring v1 to it would make the replayed simulation worse. Which head the official forecast uses is founder decision **N6**, under the preregistration.
2. **Nothing here changes the official side.** Development-season evidence never promotes (prereg §8). The forward shadow (v1 graded nightly since #1137) is the evidence that counts.
3. **Two candidate challengers** for walk-forward evaluation (Workstream E), both preregistered before any look:
   - Elo with home advantage refit on 2023-24 only, then evaluated on 2024-25 and forward.
   - The v1 sim head as the winner head, scored against the existing §7 winner bars on forward rows (the bar already names `sim`; §12 look 3).

## Caveats

- Historical development season. It is not the assessment season and not the forward shadow.
- v1 takes Elo's win probability as an input (`ELO_TO_MARGIN 0.05115`), so the two heads are not independent.
- No injury feed existed for 2024-25: unknown availability is simulated, as in look 2.
- The 72-game side-disagreement subset is small. No claim is made from it.

## Reproduce

```
cd app && nice -n 19 node scripts/nba/research/winner-head-paired-eval.mjs --sims 4000 --boot 2000 --write   # ~4.5 min, one core
npx tsx --test scripts/nba/research/paired-metrics.test.mjs
```
