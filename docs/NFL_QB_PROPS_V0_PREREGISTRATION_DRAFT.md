# NFL QB props v0: pre-registration (DRAFT, not signed)

**Status: DRAFT.** No verdict exists, and none may be computed, until the founder signs off this document. The descriptive ledger (`data/internal/research/nfl/qb-props/ledger.json`, weeks 5–9) is **not** the confirmatory sample. It was looked at to build the grader, so it is excluded from the test below.

## 1. What is tested

The sim-v2 SHADOW receipts' quarterback lines, one row per projected starting QB per game:
- pass TD and interceptions (counts);
- passing yards, completions and attempts (continuous).

The model is `nfl-drive-sim-v2` with receipt schema `simulation-receipt@2.1`, the first schema that carries per-player count PMFs.

Nothing here touches the official forecast, a price, or a public page beyond the flag-OFF stub.

## 2. Confirmatory sample (forward only, disjoint from everything already seen)

- **Receipts:** every shadow receipt of record (latest `generatedAt` strictly before `eventStart`) whose `generatedAt` is **after the signature date below** and whose schema is `@2.1` or later. Receipts generated at or after kickoff are excluded and counted.
- **Rows:** the projected QB (the largest pass-attempt median per team) in games with a verified final (settlement source FINAL, team passing yards agree).
- **Excluded and counted, never dropped silently:**
  - a projected QB who did not play;
  - an unverified final;
  - a game not yet final.
- **Size:** the look happens once, when **n ≥ 300 QB-games** have accrued (about 10 weeks at about 30 per week). Not before, and only once.

## 3. Strata (reported, never used to choose a result)

- **Starter match:** the projected QB is the actual starter, i.e. the QB with the most attempts.
- **`eligibility@1` state at freeze:** ELIGIBLE / INELIGIBLE / UNKNOWN, once the contract is on main. The primary analysis is all rows. The ELIGIBLE-and-R5-publishable stratum is reported beside it.

## 4. Bars

The proposed bars are taken from the market review, 2026-11-09. Each must hold on the confirmatory sample. Each interval is a game-clustered 95% bootstrap, with seed 20261110 and 2,000 resamples.

| Family | Primary | Secondary |
|---|---|---|
| Pass TD | Count log loss below a Poisson trailing-rate baseline (the QB's own earlier 2026 rate; league QB rate for fewer than 3 games). The interval of (model − baseline) must lie entirely below 0. | ECE ≤ 0.03 at 0.5 / 1.5 / 2.5 from the PMF; cov80 in [0.75, 0.85] |
| Interceptions | Same as pass TD | ECE ≤ 0.03 at 0.5 / 1.5; cov80 in [0.75, 0.85] |
| Passing yards | MAE of the median below the trailing-mean baseline (interval of the difference entirely below 0) | cov80 in [0.75, 0.85]; \|bias\| ≤ 10 yards |
| Completions, attempts | MAE below the trailing-mean baseline (interval below 0) | cov80 in [0.75, 0.85] |

**Passing-yards ECE (ECE ≤ 0.03 in the review) is not testable yet.** The receipt stores yards quantiles, not a distribution a line probability can be read from without inventing one. It needs either a yards histogram field (a schema change) or the founder dropping that bar. **Decision needed.**

**What a pass means:** the family may be labelled "EXPERIMENTAL · validated forward". It is not a promotion. Promotion goes through the existing champion/challenger gate and founder approval. **What a fail means:** the family stays withheld, a new model version is a new registration, and no bar is edited.

**Sportsbook comparison:** none until an authorized private capture exists.

## 5. What is fixed now

- The grader's code: `app/src/lib/sports/nfl/qb-props-grade.mjs`, `app/scripts/nfl/grade-qb-props.mjs`.
- The selection rule, the projected-QB rule, the verified-final rule, and the bootstrap seed.
- **Still to add before signature:** the grader does not yet compute the Poisson trailing-rate baseline's count log loss, ECE at the lines, or the R5-publishable stratum. These are added and tested before the founder signs, so the code is fixed before the window opens.

Any change after the signature is a new registration.

## 6. Sign-off

| | |
|---|---|
| Founder signature and date | ________ |
| Confirmatory window opens | the first receipt generated after the date above |
