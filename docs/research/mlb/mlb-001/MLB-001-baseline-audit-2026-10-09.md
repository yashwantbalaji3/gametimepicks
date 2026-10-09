# MLB-001 — Engine rules and baseline audit (2026-10-09)

**Task:** `MLB-001` (roadmap §7). **Lane:** A (Core Intelligence). **Stage:** RESEARCH COMPLETED. Nothing was tuned, promoted or changed.
**Method:** read-only analysis on `origin/main` (2026-10-09). The receipts are in `receipts/`:
- `collect*.py`, `analyze.py`, `totals.py`: the forecast-of-record join and the scores.
- `engine-experiments.ts` plus `engine-experiment-switches.diff`: experiments on an engine copy whose logic is byte-identical to `app/src/lib/mlb/full-game/engine.ts`, apart from two switches (automatic runner off; a counter on the safety cap). Each experiment ran 40,000 games per configuration.
**Independent re-verification (Lane A, same day):** winner log loss model 0.6993 / coin 0.6931 / market 0.6684 (n = 810, paired 805); moneyline hit rate 51.4%; total hit rate 49.0% (n = 767 decisive); model-health states `mlb_moneyline` WATCH, `mlb_total` BREACHED, `mlb_run_line` HOLDING. Every number below is **measured** unless marked *inferred*.

## Forecast of record

The data is the 810 graded games in `app/public/data/mlb/results/game-predictions-graded.jsonl` (786 regular season; 24 postseason from 2026-09-28).
- Each ledger `forecastSource` (351 git revisions, 459 snapshots) leads to a predictions `artifactHash`. Every one of those hashes matches a git revision of `full-game-simulations/<date>.json` (810/810).
- The oldest revision with that content was generated before first pitch in every case.
- The moneyline probability equals the full-game `winProbability` in 810/810 games.
- Model versions: pa-v1 for 321 games, pa-v2 for 489.

So the erased public files (TRUTH-001 recovery, PR #1042) do not affect these scores.

## 1 · Engine rules (the roadmap's eight items)

| # | Item | Today (code) | Verdict | Measured impact |
|---|---|---|---|---|
| 1 | Postseason automatic runner | No game-type input (`types.ts:261-277`); every extra half-inning starts with a runner on 2nd (`engine.ts:255`) | **Confirmed defect** (MLB has no automatic runner in the postseason) | Small: extras rate and P(home) unchanged; mean total −0.06…−0.12; extra-inning games last 11.21 innings instead of 10.43. 24 graded games affected |
| 2 | Safety-cap run | At inning 30 home gets +1 (`engine.ts:29`, `:410-413`) | Simplification, home-biased | Fired 0 times in 480,000 experimental games |
| 3 | Starter removal | Leaves after 25 batters faced or 7 runs (`engine.ts:74`, `:344-347`); no pitch count, times-through-order, opener or rest | Crude | 24.8 batters faced, 5.76 innings per start; strikeouts 0.995× the board only because the cap equals `STARTER_BATTERS_FACED`. *Inferred:* innings above the typical ~5.3, so pitcher outs would be biased high |
| 4 | K/BB/HBP rates | Strikeouts from the pitcher only (`plate-appearance.ts:78-82`); walks + HBP a league 0.085 (`:49`, `:135`); **the pitcher does not change hit rate** (`:129-133`, `:140`) | **Confirmed defect** | Opposing starter's projected strikeouts 3 → 9 changes runs by −0.04. A lineup's projected hits ±0.10 per game moves runs 4.08 → 6.13 and P(home) 0.59 → 0.41 |
| 5 | PA conversion | Hit rate = projection ÷ fixed 3.85 PA (`plate-appearance.ts:45`, `:131`); the engine itself generates 38.41 PA per team | **Confirmed defect** | Simulated hits 1.132× and total bases 1.173× the board (11,981 rows). By slot, 1.224× (leadoff) falling to 0.993× (9th): slot counted twice |
| 6 | Bullpen | League aggregate differing only in strikeout rate 0.24 (`plate-appearance.ts:56`, `engine.ts:145`) | Not modelled | A game with no starters simulates like one with starters (9.73 vs 9.79 runs) |
| 7 | DP / advancement | DP, WP/PB/balk and errors are 0; no advancement on outs except 0.4 scoring from 3rd; no steals; advancement not by outs | Simplification (effects offset) | P317 dev: DP −0.32, errors +0.40, free advancement +0.10 runs. Non-homer walk-off counts every runner who scores |
| 8 | Lineup opportunities | Mechanics correct: PA by slot 4.69 → 3.81 | Inputs defective | 45% of team-sides (722/1,620) used prop-listing order; only 375/1,620 had all nine rated; 645 "Lineup fallback" rows |

**Extra innings:** simulated 10.86% of games (range 6.8–14.4%). The 2026 actual rate cannot be measured, because no committed linescore has innings. As a proxy, one-run games are 0.310 simulated vs 0.300 actual (2023–25: 0.283).

## 2 · Baseline (existing model, untuned)

**Winner** (P(home), forecast of record)

| | n | Log loss | Brier |
|---|---|---|---|
| Model | 810 | **0.6993** | 0.2529 |
| Coin flip | 810 | 0.6931 | 0.2500 |
| Market (de-vigged, paired) | 805 | **0.6684** | 0.2380 |
| Model, postseason | 24 | 0.6793 | 0.2432 |

- **Model vs coin: on this sample the model scored WORSE than a coin flip.** Lower log loss is better, and 0.6993 is above the coin's 0.6931 (+0.0061; Brier 0.2529 vs 0.2500, also worse). The 95% bootstrap interval of the difference, [−0.006, +0.019], includes 0, so the size of the shortfall is not established — but nothing here suggests the model is better than a coin. No significance claim is made.
- *Correction (2026-10-09, founder review):* an earlier summary of this audit could be read as the model "beating a coin flip". It does not; the numbers above are unchanged, only the wording.
- Model vs market: +0.031 [0.017, 0.045]: the market benchmark is better than the model, and the interval excludes 0 (paired bootstrap, 805 games).
- Calibration is far too spread out: logistic intercept 0.152, slope **0.314**. The model's 0.3–0.4 bin won 47.4% and its 0.6–0.7 bin won 56.2%.
- Home bias: mean P(home) 0.501, but home teams won 0.538 (2023–25: 0.5285). A symmetric simulation scores home 4.77 vs away 5.02 runs, against roughly equal actuals.

**Total runs**
- Level: simulated mean 7.90 vs actual 8.78 (**−0.89**; regular season −0.95).
- Against climatology (2023–25): CRPS 2.535 vs 2.397; log score 2.870 vs 2.802.
- MAE: median 3.60, constant 8 gives 3.42, posted line 3.35.
- p10–p90 coverage 0.799.
- **Correlation of the simulated mean with the actual total: −0.043** (line vs actual: 0.196).

**Run differential** (exact counts): log score 2.743 vs climatology 2.713.

**Pick record (ledger)**

| Market | W–L–P | Hit | Note |
|---|---|---|---|
| Moneyline | 416–394–0 | 51.4% | log loss 0.6993 vs market 0.6684 |
| Total | 376–391–38 | 49.0% | **paused** by the live-record gate (BREACHED) |
| Run line | 510–300–0 | 63.0% | 742/810 picks were +1.5. A random team at +1.5 covers ≈ (1 + P(one-run game)) / 2 ≈ 0.65, so the "beats a coin flip" judgement (HOLDING) measures the +1.5 structure, not skill. The right floor is the price of the side taken, which decision engine v2 (#1038) records |

## 3 · Ranked defects and what a new version would test (not implemented)

1. **No run prevention.** Pitcher, bullpen and park move only strikeouts, and the inputs are noisy last-10 means with no opponent or park adjustment (`pipeline/mlb/mlb_model.py:18-22`, `:271-317`). This drives a winner score worse than a coin flip (not significantly so) and a total with no signal. *Challenger:* per-PA rates from batter × pitcher (log5 / hierarchical) for hits, power, walks and strikeouts, plus park and team bullpen.
2. **Probabilities too spread out (slope 0.31).** Shrink the inputs with hierarchical priors, not the output.
3. **No home-field effect** (≈ 3.7 points of P(home)).
4. **Total level −0.89**, together with the offsetting 3.85 divisor.
5. **Slot double counting** (1.22× → 0.99×). Convert each projection with the batter's own historical PA.
6. **Unrated and filler batters; prop-listing order.** The identity fix (#1037) removes a third of these; the rest are `MLB-003`.
7. **Constant walks/HBP; pitcher-only strikeouts.**
8. **Fixed starter workload.**
9. **Advancement, double plays and errors.**
10. **Postseason automatic runner.** Add a `gameType` input.
11. **Safety cap; walk-off scoring rule.**

Items 10–11 are unambiguous rule corrections and can ship as a versioned engine change. Items 1–9 are registered one challenger at a time against `DEFAULT_ENGINE_PARAMS` on identical inputs and seeds (the P317 protocol).

**Preregistration skeleton (EVAL-001):**
- **Winner:** log loss, Brier and calibration slope/intercept against coin, market and control.
- **Totals and margin:** CRPS and log score against climatology; p10–p90 coverage ±0.03; level within ±0.3 runs.
- **Box score:** simulated/board hits ratio 1.00 ± 0.03 in every slot.
- **Window:** forward from registration, ≥ 200 games, bootstrap CI excluding 0, regular season and postseason separate, rollback on any guard failure.
- The 2026 Jul–Oct record has already been looked at (P317 dev), so any score on it is a second look.

## 4 · Data for MLB-002

- **History:** 2023–25 regular-season finals, 7,289 games (score and venue only; no innings, lineups or odds). 2026 linescores also lack innings.
- **Odds:**
  - `team-markets`: 78 dates from 2026-07-09, DraftKings, captured early in the day (not closing).
  - Closing odds: 82 games.
  - `pregame-archive/market-snapshots`: 77 dates.
  - No 2023–25 odds. The historical endpoint costs credits and needs founder approval.
- **Leakage risks:**
  - `ingest-mlb-independent-inputs.mjs` reads linescores with no date filter.
  - Board and predictions files are overwritten intraday; join by `sourceBoardHash` / `artifactHash`.
  - Input snapshots exist only from 2026-09-26.
  - Box-score batting orders assume lineup knowledge.
  - Game-log projections must be rebuilt as-of the forecast date.
  - A market challenger uses only `capturedAt` before the forecast time.
- **Caveat:** the per-batter board ratios used each date's current board file, not the exact revision a forecast used. Game-log projections are stable within a day, so this is an approximation.

## Status

MLB-001 stays **IN_PROGRESS** at stage RESEARCH COMPLETED. Next:
- the rule corrections (10–11) as a versioned engine change;
- a preregistration for challenger 1 (run prevention) under MLB-002.

No promotion, no tuning on this record.
