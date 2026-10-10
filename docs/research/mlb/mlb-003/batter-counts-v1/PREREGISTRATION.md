# MLB-003 · challenger `mlb-batter-counts-v1` (batter hits / total bases / H+R+RBI / HR): preregistration

**Registered:** 2026-10-10, before the challenger is fit or scored. The commit of this file is the registration.

**Status:** research only. Nothing published, promoted or made eligible.

## Why

The baseline and the diagnosis found two failures in the published batter model:
- **Wrong distribution.** It uses a normal CDF on small, skewed counts; an over-dispersed count model alone recovers most of the total-bases gap in development data.
- **Weak means.** The AUC of (mean − line) is 0.51 for total bases, 0.535 for H+R+RBI and 0.589 for hits. The mean has no pitcher, handedness or opportunity term.

## The challenger (fixed here)

For batter *b* in game *g* on date *D*, **inputs only from games dated before D**: `data/internal/mlb/boxscore-outcomes/` and the pregame `batter-splits` / `pitcher-workload` / `matchup` captures with `capturedAt` before the line's board capture.

1. **Expected PA:** the batter's mean PA over his last 15 games **in which he started** (box-score `battingOrder` ending in `00`), shrunk to 4.0 with prior weight 5 games.
   - The batting order of game *g* itself is **not** used: it is a postgame record.
   - The pregame slot is used **only** when the pregame `matchup` capture names it. In that case the PA is the league `PA_BY_SLOT` for that slot.
2. **Per-PA rates:**
   - Each rate is per PA: hits, doubles, triples and HR (from earlier box scores, season to date), plus runs and RBI per PA, each shrunk to league.
   - Prior weights: hits 150 PA; 2B 300; 3B 800; HR 170; R 200; RBI 200.
   - Then adjusted for the opposing starter **only** through the matchup-v1 inputs, frozen as registered: the starter's K, BB and HR rates and the batter's split against the starter's hand. Hits on balls in play keep the batter's own rate (DIPS).
3. **Count distributions:**
   - hits ~ binomial(⌊E[PA]⌉, p_hit) mixed with a beta to over-disperse; dispersion fit by maximum likelihood on earlier months only (walk-forward);
   - total bases from the type rates (1B, 2B, 3B, HR), by simulation of the PA outcomes (5,000 draws per batter-game, fixed seed);
   - HR ~ binomial;
   - H+R+RBI from the joint draw of the same PAs, with runs and RBI drawn per PA at their rates.
4. **P(over the posted line)** is read directly from the count distribution.

Not in v1 (stated): park, weather, bullpen hand-off by inning, platoon substitutions, lineup-position changes mid-game.

## Evaluation

| | Window | Status |
|---|---|---|
| Development | 2026-05-16 → 2026-10-08, the batter lines with a settled market | **Already exposed** (baseline, diagnosis, MLB-002 for Sep–Oct game outcomes). **Exploratory only** |
| Qualifying (primary) | **Forward:** remaining 2026 postseason, then 2027, single look at n ≥ 2,000 graded hits lines and ≥ 1,000 total-bases lines | Untouched |
| Optional historical holdout | **2025 season** (only if the 2024–25 box-score capture is approved). Develop on 2024, read 2025 once, scored on the **actual counts** (log score, CRPS), since there are no posted lines or prices | Untouched |

**Metrics:**
- **Primary:** per market, log loss of P(over the posted line), challenger minus the current model, paired bootstrap 95%.
- **Secondary:**
  - log score of the actual count;
  - CRPS;
  - AUC;
  - calibration slope and intercept;
  - challenger minus the de-vigged market.

**Qualifying bars (forward):**
- For each market separately: log loss better than the current model (95% interval below 0) **and** calibration slope in [0.7, 1.3].
- A market that fails is reported as failing. Markets are never pooled to pass.

**Integrity:**
- Any postgame field used as a same-game input invalidates the run.
- A change after reading development results is a new version with a new registration.
- Failed results are kept.
- Beating the current model is not beating the market. No betting-value claim follows.
