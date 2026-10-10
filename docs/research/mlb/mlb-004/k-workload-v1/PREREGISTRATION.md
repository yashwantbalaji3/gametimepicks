# MLB-004 · challenger `mlb-k-workload-v1` (pitcher strikeouts): preregistration

**Registered:** 2026-10-10, before the challenger is fit or scored on any data. The commit of this file is the registration.

**Status:** research only. No public prediction, product or eligibility changes. Promotion needs a separate founder decision after the qualifying test below.

## Why

The baseline audit found the published strikeout model has **no discrimination**: the observed over rate is about 0.48 in every probability bin, and the AUC of (mean − line) is 0.508 against the market's 0.573. Its mean is `0.55 × last-3 + 0.45 × season` of every appearance's K, relief outings included, with no batters faced, workload or opponent term.

## The challenger (fixed here)

For a probable starter in game *g*, using **only** box-score lines from games dated **before** *g*'s date (`data/internal/mlb/boxscore-outcomes/`, `POSTGAME_OUTCOMES` of earlier games):

1. **Expected batters faced:** the mean BF over the pitcher's last 5 **starts** (`started = true`), shrunk to a league starter BF of 22 with prior weight 3 starts. With no previous start, 22.
2. **Pitcher K rate:** season-to-date K / BF over **starts and relief**, shrunk to the league K / BF with prior weight 150 BF.
3. **Opposing lineup K rate:** the opponent team's batting K / PA over its previous 15 games, shrunk to league with prior weight 300 PA.
4. **League K rate:** pooled K / PA over all games dated before *g*.
5. **K rate for the matchup:** `log5(pitcher, lineup, league)`.
6. **Mean:** μ = E[BF] × matchup rate.
7. **Distribution:** K ~ negative binomial(mean μ, dispersion *r*). *r* is fitted by maximum likelihood on starts in **earlier calendar months only**: walk-forward, refit monthly, never on the row's own month.

Not in v1 (stated, not hidden): handedness splits, pitch count, rest, bullpen-day / opener detection, park, umpire.

## Evaluation

| | Window | Status |
|---|---|---|
| Development | 2026-05-16 → 2026-10-08, the starts with a settled K line | **Already exposed** in the baseline audit and the diagnosis. Results here are **exploratory**: they show whether the mechanism moves discrimination, and they qualify nothing |
| Qualifying (primary) | **Forward:** remaining 2026 postseason starts, then the 2027 season, single look at n ≥ 300 starts with a posted line | Untouched |
| Optional historical holdout | **2025 season**, only if the founder approves the 2024–25 box-score capture. Develop on 2024, read 2025 once | Untouched |

**Metrics:**
- **Primary:** log loss of P(over the posted line), challenger minus the current model, paired bootstrap 95%.
- **Secondary:**
  - AUC of P(over);
  - calibration slope and intercept;
  - log score of the actual K count, which needs no line;
  - challenger minus the de-vigged market;
  - mean absolute error of μ.

**Qualifying bars (forward test):**
1. Log loss better than the current model, 95% interval below 0.
2. Calibration slope in [0.7, 1.3].
3. AUC above the current model's.

It is reported against the market regardless. Beating the current model is **not** beating the market, and no betting-value claim follows from any result.

**Integrity:**
- Any input dated on or after the game's date invalidates the run.
- Changes after reading development results are a **new** version with a new registration.
- Failed results are kept.
