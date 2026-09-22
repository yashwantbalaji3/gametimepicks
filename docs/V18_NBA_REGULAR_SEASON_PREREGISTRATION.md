# v1.8 — NBA regular-season shadow preregistration (N6)

**Frozen:** 2026-09-22, before any 2026-27 result exists (preseason opens 2026-10-03, regular season
2026-10-20). **Prior looks:** none on 2026-27 data. The 2024-25 dispersion diagnostic
(`docs/V17_NBA_SIM_DISPERSION_DIAGNOSTIC.md`) was read before writing this; no bar below was tuned on any
2025-26 or 2026-27 outcome. Any change to this file after 2026-10-20 must be recorded in §12 as a new look.
**Registry:** `nba` = `HISTORICAL_ONLY`, `canEnterPredictionProducts: false` — this file cannot move it; a
market moves only with a receipt that cites the bars here.

## 1. Model versions frozen for the initial shadow (exact strings in code)

| Component | Version string | Where |
|---|---|---|
| Game simulation | `nba-preseason-experimental-v0` (`NBA_SIM_MODEL_VERSION`) | `app/src/lib/sports/nba/game-sim.mjs` |
| Expected minutes + per-minute rates | `nba-minutes-model-v0` (`MINUTES_MODEL_VERSION`), `TRAILING_N = 10`, `MIN_GAMES_FOR_RATES = 3` | `app/src/lib/sports/nba/minutes-model.mjs` |
| Team rating | Elo `NBA_ELO_PARAMS` = { K: 20, HOME_ADVANTAGE: 70, MEAN: 1500, SEASON_REGRESSION: 0.25, SCALE: 400 }, two streams (`ratings`, `preseasonRatings`) | `app/src/lib/sports/nba/team-rating.mjs` |
| Forecast artifact | `nba-experimental-forecasts` schema 1, labels `NBA PRESEASON — EXPERIMENTAL` / `NBA REGULAR SEASON — SHADOW` | `app/src/lib/sports/nba/experimental-forecast.mjs` |
| Box-score corpus | `BOXSCORE_SCHEMA_VERSION = 1`, builder `nba-boxscore-corpus-1.2.0` | `boxscore-parse.mjs`, `app/scripts/nba/build-nba-boxscore-corpus.mjs` |
| Roster capture | `nba-roster-contract-v1`, `nba-roster-capture-1.0.0` (reconciled in the artifact, **not applied to the pool** at v0) | `roster-contract.mjs`, `roster-parse.mjs`, `app/scripts/nba/capture-nba-rosters.mjs` |
| Grader | `grade-nba-experimental-forecasts.mjs` → `experimental/ledger.json` (separate preseason / regular buckets) | `app/scripts/nba/grade-nba-experimental-forecasts.mjs` |

The shadow runs **v0 exactly as frozen**. Any v1 candidate from the dispersion plan is a separate
version string, gets its own forward shadow from the day it is armed, and never rewrites v0's ledger.

## 2. History window and split

- **Training/history window:** `corpus-v1.json` finals 2023-24 → 2025-26 (4,179) and the box-score corpus
  (4,179 games, 113,080 rows); regular-season Elo folds phase ≠ 1 only.
- **Development:** 2023-24 + 2024-25 regular season (corpus seasons 2024, 2025).
- **Assessment (historical):** 2025-26 regular season (corpus 2026) — read once per candidate.
- **Forward shadow (the only evidence that can promote):** 2026-27 regular season from game one, graded
  nightly by the existing job in `.github/workflows/sport-schedules.yml` (`nbaexp` step).
- Leakage rule unchanged: only rows strictly earlier than the forecast's `now` are folded.

## 3. Preseason treatment

Preseason (`seasonType 1`) is a separate population end to end (its own Elo stream, its own minutes
population, its own ledger bucket, its own label). Preseason results are **reported** in the ledger and
**never** count toward any regular-season bar, sample size, or calibration table. A preseason-only
finding may motivate a candidate; it cannot promote one.

## 4. Team-outcome metrics (per game, regular season only)

| Metric | Definition | Baselines reported alongside |
|---|---|---|
| Winner | Brier and log loss of `sim.pHome` and of `elo.pHome` (both already graded separately) | coin (ln 2 = 0.6931), home-rate, preseason-frozen Elo, market when an authorized price exists (**none today**) |
| Calibration | ECE with **10 equal-width bins** on p(home), plus the reliability table | — |
| Score / margin / total | MAE and bias of the sim means (`marginMAE`, `totalMAE`, `homeMAE`, `awayMAE`) | model-card v1 Elo point estimates: margin MAE 11.98, total MAE 15.52 |
| Interval coverage | share of actual margins / totals inside p10–p90 (nominal 0.80) and p25–p75 (0.50) | — |
| Overtime | share of OT games vs sim tie mass | realized 4.69 % |

## 5. Player metrics by market family

Graded per matched player-game (predicted row ↔ box-score row; DNP and null-minute rows excluded and
counted, never zero). Families: **points, rebounds, assists, 3PM**; **PRA only as the joint combination**
of the simulated components (never a separately fitted market).

| Metric | Definition |
|---|---|
| Expected-minutes MAE | \|expectedMinutes − actual minutes\| (the minutes model's own error) |
| Production-given-minutes MAE | \|actual minutes × predicted rate − actual stat\| per family (rate error alone) |
| Unconditional MAE | \|sim mean − actual\| per family |
| Distribution calibration | coverage of p10–p90 per family; ECE (10 bins) of P(stat ≥ sim median) |
| Availability | predicted-but-DNP, predicted-but-absent, played-but-unpredicted counts (roster/injury misses) |

## 6. Minimum sample sizes (assessment or forward shadow)

| Market | Minimum n before any decision |
|---|---|
| winner, margin, total | 300 graded games (≈ first 3 weeks) |
| points, rebounds, assists | 1,500 matched player-games with expectedMinutes ≥ 20 |
| 3PM | 800 matched player-games with expectedMinutes ≥ 20 and rate ≥ 0.05/min |
| PRA | the three component families must each have met their bar |
| rest / back-to-back / role-change slices | 100 per slice — reported, not gated, until then |

Below the minimum a market is **HOLD** regardless of its numbers.

## 7. Promotion bars, market by market

House style: winner markets need log loss better than coin by ≥ 0.010 and ECE ≤ 0.05
(`docs/PROGRAM_172_EXECUTION_LOG.md`); a market with an authorized price must beat the de-vigged closing
market on Brier **and** log loss (`docs/MLB_FULL_GAME_PUBLIC_READINESS_AUDIT.md`,
`docs/EVENT_MARKET_RESEARCH_VALIDATION_PLAN.md`); distribution markets need interval coverage near nominal
(NFL props: 0.741 at 80 % was PUBLIC_ELIGIBLE by policy, `docs/PROGRAM_171_EXECUTION_LOG.md`).

| Market | SHADOW → PUBLIC FORECAST bar (all must hold) | PUBLIC → PRODUCT ELIGIBLE (additional) | Rationale |
|---|---|---|---|
| Winner | n ≥ 300; sim log loss ≤ Elo log loss + 0.005 **and** ≤ coin − 0.010; ECE ≤ 0.05; sim Brier ≤ 0.240 | an authorized NBA price receipt exists **and** Brier + log loss not worse than the de-vigged closing market over ≥ 300 priced games | the sim must not be worse than the analytic Elo it sits beside (today gap 0.589 vs 0.690 on the first artifact); the coin/ECE numbers are the house bar; no market exists → no product path yet |
| Margin | n ≥ 300; margin MAE ≤ 12.5 (model-card 11.98 + noise allowance); p10–p90 coverage ∈ [0.76, 0.84]; \|bias\| ≤ 1.0 | market spread receipt; MAE not worse than the closing spread | v0 covers 0.917 on 2024-25 (over-dispersed) — this is the bar the dispersion plan must earn |
| Total | n ≥ 300; total MAE ≤ 16.0; coverage ∈ [0.76, 0.84]; \|bias\| ≤ 2.0; sim total SD > sim margin SD | market total receipt; MAE not worse than the closing total | the total needs the shared-pace structure; a margin-only fix cannot pass this row |
| Points | n ≥ 1,500; minutes MAE ≤ 6.0; conditional MAE better than the season-mean-rate baseline by ≥ 5 %; coverage ∈ [0.76, 0.84]; ECE ≤ 0.05 | prop price receipt; hit rate at the market line ≥ break-even over ≥ 500 priced rows | minutes are graded first because a wrong rotation dominates every family |
| Rebounds, assists | same shape as points, n ≥ 1,500 each | same | each family earns support separately |
| 3PM | n ≥ 800; same shape; coverage ∈ [0.74, 0.86] (discrete, low counts) | same | wider band for a discrete low-count stat |
| PRA | components each PUBLIC; joint coverage ∈ [0.76, 0.84] on ≥ 1,000 rows | same | never fitted alone |

**No adoption on a pooled all-market score.** A market passes or fails on its own rows. A pooled ledger
number is reported for context and cannot promote anything.

## 8. Forward-shadow requirement

Every promotion needs the forward shadow on top of the historical assessment: the market's bars must
hold on 2026-27 regular-season games graded by the nightly job **with the artifact written before
tip-off** (`inputAsOf` < `dateUtc`, already recorded per game; `gamesAlreadyStartedAtNow` must be 0 for
the date). Historical passes alone move a market from SHADOW to CANDIDATE, never to PUBLIC.

## 9. Injuries, rosters, back-to-backs

- **Injuries:** availability comes only from the injuries feed (`Out` excludes; Day-To-Day is simulated
  at full minutes — recorded in the artifact). Predicted-but-DNP and played-but-unpredicted rows are
  counted per game; a family whose availability misses exceed 15 % of its rows is HOLD until the roster
  gate (below) is applied.
- **Rosters:** from 2026-09-22 every artifact carries the roster reconciliation (`rosterReconciliation`
  per side, `roster` manifest) from the free ESPN roster owner. At v0 the pool is still box-score history;
  the first roster-gated pool is a versioned candidate (v0.1) and starts its own shadow. The 2026-10-03
  artifact shows the size of the gap: 22 of 40 simulated players are no longer on the two rosters and 16
  rostered players have no history — the shadow's first weeks measure exactly that.
- **Back-to-backs / rest:** derivable from the schedule capture; reported as slices (rest 0 / 1 / 2+ days)
  once n ≥ 100 per slice; never a bar in the first look.

## 10. What rejects, holds, or pauses a market

| State | Trigger |
|---|---|
| **HOLD** | n below §6; an input owner (schedule, results, injuries, rosters) MISSING for > 2 consecutive days; `gamesAlreadyStartedAtNow` > 0 on any graded date |
| **REJECT** | a bar in §7 fails on the first full-sample look; or ECE > 0.08 at any n ≥ 150; a rejected market re-enters only as a new version string |
| **PAUSE** | provider label order changes (`LabelOrderError`), a schema change in any owner, or a corpus rebuild — grading stops until the receipt is re-verified |

## 11. Reporting

The ledger stays the single evidence spine (`experimental/ledger.json`); a per-market status table
(SHADOW / HOLD / CANDIDATE / PUBLIC / REJECTED) is derived from it and this file. No number is written
into the capability registry by automation.

## 12. Looks log

| # | Date | What was looked at | Outcome |
|---|---|---|---|
| 1 | 2026-09-22 | this file, written before any 2026-27 result; 2024-25 dispersion diagnostic (60 games, v0 unchanged) | bars frozen; assessment season (2025-26) not yet read by any candidate |
