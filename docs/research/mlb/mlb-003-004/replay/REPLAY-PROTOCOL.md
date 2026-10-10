# MLB-003 / MLB-004 · chronological box-score replay: protocol (registered 2026-10-10)

**Registered:** before the replay is run on 2024 or 2025. The commit of this file and of `replay.mjs` is the registration. The harness was debugged on 2026 data, already exposed (see `replay-2026-exposed.json`, exploratory).

**Status:** research only. Nothing is published, promoted or made eligible. No result here qualifies a model.

## What it is

A one-pass, date-ordered replay of a season's box scores (`HISTORICAL-DATA-AND-HOLDOUT-AUDIT.md`).
- **Ordering:** for each date D, every prediction is made from a running state that holds only games dated before D. The state is updated with D's games only after all of D's predictions.
- **What the game's own box score supplies:** the population (who started), the opposing starter's identity (a pregame fact: the probable pitcher) and the result. It never supplies a feature.
- **Walk-forward parameters:** dispersion and the run and RBI coefficients are refit at the first date of each month, from earlier months of the same season only.
- **Season boundary:** no prior-season data is used. That keeps 2024 (whose prior season was not captured) and 2025 identical in design.

## Populations and windows

| | Rows | Scored from |
|---|---|---|
| Pitcher strikeouts | Every start (`started = true`) in which the current-model replica has ≥ 3 earlier appearances and every model has a prediction | **May 1** of the season (March–April is burn-in for every model), through the postseason |
| Batter counts | Every batter start (`battingOrder` ending `00`) in which the current-model replica has ≥ 5 earlier appearances and every model has a prediction | May 1 |

**Disclosed selection effects:**
- Batter rows are conditioned on the batter starting, which is equivalent to knowing the confirmed lineup. Late scratches are absent.
- Strikeout rows are conditioned on the listed starter starting. Openers are included, and nothing detects them.

## Models

| Name | What | Notes |
|---|---|---|
| `current` | Replica of the published prop model (`pipeline/mlb/mlb_model.py`) | Applied to season-to-date appearances. K: `0.55·last-3 + 0.45·season` mean of every appearance's K, σ = max(sd, 1.6). Batters: `0.5·last-10 + 0.5·season`, σ = max(sd, floor 0.85 / 1.10 / 1.20). The normal is read as a count distribution by integer discretization. It has no HR, R or RBI model |
| `v1` | `mlb-k-workload-v1` and `mlb-batter-counts-v1`, as preregistered | **Batter v1 has no matchup inputs here:** the pregame captures it reads do not exist for 2024–2025. It is computed **exactly** (enumerated) rather than by its 2,000 random draws, which only estimate the same distribution |
| `v2` | `mlb-k-workload-v2` and `mlb-batter-counts-v2`, defined below | Developed on 2024; frozen in `V2-FREEZE.md` before 2025 is read |
| `v2h` | v2 plus handedness | Scored on the subset with known starter hand. Needs `people-handedness.json` |

### `mlb-k-workload-v2` (mechanism changes vs v1; same per-BF K rate)

1. **Batters faced is a distribution, not a point.**
   - BF = round(E[BF] + ε), where E[BF] is v1's, and clipped to [1, 45].
   - ε is drawn from the empirical residuals (actual BF − pregame E[BF]) of **every earlier start** of the season. That carries early-exit risk: injuries, blow-ups, openers.
   - It needs ≥ 200 earlier residuals.
2. **Strikeouts given BF:** beta-binomial(BF, p, κ).
   - p = v1's `log5(pitcher K/BF, opponent K/PA over 15 games, league)`.
   - κ is chosen from {25, 50, 100, 200, 400, ∞} by maximum likelihood on earlier months.
3. **v2h:** the opponent's K/PA is computed over its last 30 games **started by a pitcher of the same hand**, shrunk to its overall rate (prior 150 PA).

Not in v2 (stated): rest days, pitch-count limits, IL returns, park, umpire, opener detection, prior-season talent.

### `mlb-batter-counts-v2` (mechanism changes vs v1)

1. **PA distribution:** the league histogram of PA among earlier batter starts, exponentially tilted to v1's E[PA] (last 15 starts, prior 5 at 4.0). It carries early substitution and extra-inning PA.
2. **The opposing pitchers:**
   - K, BB and HR per PA = s · log5(batter, starter, league) + (1 − s) · log5(batter, the opponent's bullpen, league).
   - s = min(0.9, the starter's E[BF] / league PA per team-game).
   - Starter rates are season-to-date, shrunk with prior 70 / 170 / 500 BF. Bullpen rates come from the team's relief lines, prior 600 BF.
   - Non-HR hits keep the batter's own BABIP (DIPS), as v1.
3. **Over-dispersion:** a game-level multiplier on all hit probabilities. It takes five equiprobable points of Gamma(κ, κ), with κ from {3, 5, 10, 20, 40, 80, ∞}, fit by maximum likelihood on earlier months' hits.
4. **Runs and RBI, coherent with the PA outcome** (v1 drew them independently of the outcome):
   - **League coefficients:** fitted by least squares on earlier batter-games:
     - RBI ≈ β_HR·HR + β_H·(non-HR hits) + β_O·(other PA);
     - R − HR ≈ γ_on·(non-HR times on base) + γ_o·(other PA).
   - **Per PA:**
     - a homer scores the batter and drives in 1 + Poisson(β_HR − 1);
     - other hits score with γ_on and drive in Poisson(β_H);
     - walks and outs follow β_O and γ.
   - **Scaling:** both are scaled by the batter's own R and RBI against that expectation (prior 30) and by the opponent's runs allowed per game against league (prior 20 games).
   - Hits, TB, HR, R, RBI and H+R+RBI are all read from **one** per-PA joint outcome. This is the MLB-005 coherence principle.
5. **v2h:** the batter's K, BB and HR rates **against the starter** come from his games against same-hand starters (a game-level split; box scores carry no per-PA hand), shrunk to his overall rates (prior 120 PA).

Not in v2 (stated): park, weather, batting-order slot (pregame slot is unavailable historically), platoon substitution, lineup protection.

## Metrics

**Primary** (per market): mean **count log loss**, −log P(actual count).
- Reported for v2 minus current and v2 minus v1.
- 95% interval from a paired bootstrap that resamples **whole dates** (2,000 draws).
- HR, R and RBI have no current-model counterpart, so their primary comparison is v2 against v1.

**Secondary:**
- threshold log loss and AUC at fixed thresholds: K 3.5 / 4.5 / 5.5 / 6.5; hits 0.5 / 1.5; TB 1.5 / 2.5; H+R+RBI 1.5 / 2.5; HR, R, RBI 0.5;
- calibration slope and intercept at the main threshold: K 4.5, hits 0.5, TB 1.5, H+R+RBI 1.5;
- CRPS;
- MAE of the mean;
- coverage of the 10–90% interval.

**No market comparison is possible:** there are no historical lines or prices.

**Count-level discrimination is not line-level discrimination.** Across all starts, any sensible K model separates a 3-K pitcher from an 8-K pitcher. Against a posted line, which already holds that information, the published model's AUC was 0.508. A count gain here does not show a gain against the market.

## Use of 2024 and 2025

| Season | Label | Use |
|---|---|---|
| 2024 | **DEVELOPMENT** | v2 and v2h may be changed after reading 2024. Every change is logged in `V2-FREEZE.md` |
| 2025 | **RETROSPECTIVE_HOLDOUT** | Read **once**, by `--holdout-read`. The harness refuses unless `V2-FREEZE.md` is committed, the replay directory has no uncommitted changes, and no result file exists. All frozen versions (current, v1, v2, v2h) are scored in that single read |

**Retrospective-support criterion for 2025, per market** (registered here, and still **not** a qualification):
1. v2 minus current count log loss with its 95% interval below 0, where a current model exists;
2. v2 minus v1 with its 95% interval below 0;
3. a calibration slope at the main threshold in [0.7, 1.3].

A market that fails is reported as failing, and markets are never pooled.

**Qualification** remains the forward test in each preregistration: the remaining 2026 postseason, then 2027, against the posted lines and the market.
