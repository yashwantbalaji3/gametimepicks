# MLB-002 · `mlb-pa-matchup-v1`: prospective forward shadow, preregistration

**Registered:** 2026-10-10, committed before any forward row is captured. This file's commit hash is the registration.

**Authority:** founder decision 4 (2026-10-10), "prepare a new prospective shadow evaluation".

**Status:** shadow only. Nothing is published, recommended or promoted, and promotion needs another founder decision.

**Provenance:** the holdout of the first registration (`PREREGISTRATION.md`, verdict NOT QUALIFIED, `RESULT.md`) is closed. It is **not** reused, re-tuned against, or counted here.

## 1. Champion and challenger

| | Definition |
|---|---|
| **Champion** | The engine that produced the **published** full-game forecast for that game: today `mlb-fullgame-2026.08-pa-v2` (`DEFAULT_ENGINE_PARAMS`), or a later published version if the founder promotes one. Recorded per row |
| **Challenger** | `mlb-pa-matchup-v1`: the champion's engine parameters **plus** `EngineParams.matchup`, with the frozen league constants `league-constants.json` (dev window, `a38523dba6`). Mechanism, priors, slot table and missing-data rules are exactly as in `PREREGISTRATION.md` with amendments 1–3. **Frozen: no change to any of them during this evaluation.** A change would be a new candidate with a new registration |

Both arms run on **identical inputs** (the inputs of the published run) and the **same seed**, with 10,000 games each.

## 2. Primary metric

Winner log loss of P(home), challenger minus champion, over the forward sample. Paired game-level bootstrap with 10,000 resamples and seed 20261010.

## 3. Secondary metrics

- Winner Brier and calibration slope and intercept.
- Total runs: CRPS, log score, level, and 80% interval coverage.
- Run line ±1.5 home-cover log loss.
- **Each arm against the de-vigged market quote the forecast carried**, reported always, never used to qualify.
- Coverage: the share of batters with splits, with a known slot, and of starters with a line.

## 4. Sample size

- **Primary analysis:** at **n ≥ 300 graded forward regular-season games**.
- **Single look:** one analysis at the first nightly receipt with n ≥ 300. There are no interim efficacy looks.
- **Health checks:** interim receipts report only counts, coverage and pipeline health, never the metric comparison.
- **Postseason:** postseason games are captured and reported separately, never pooled into the primary analysis. They are a different rule set and too few.

## 5. Acceptance (qualifies for a promotion **proposal** only)

All of these must hold on the forward sample:

1. The winner log-loss difference has its 95% interval **below 0**.
2. Total CRPS is no worse than champion + 0.02.
3. The total's absolute level is no worse than the champion's + 0.25 runs.
4. No more than 1% of eligible games are lost to challenger-specific failures.
5. Coverage of batters with splits is at least 70% (else the result is reported as not evaluable).

Meeting these allows a **proposal**, not a promotion. Being worse than the market is reported either way, and no betting-value claim follows from any outcome.

## 6. Forward period

The period starts at the first generator run after the shadow is integrated (founder approval required) and ends at the single look, n ≥ 300 regular-season games.

The 2026 postseason has at most about 20 games left, so the **regular-season sample will come from the 2027 season**. The candidate and this registration are preserved over the off-season. **No historical game is used to fill the sample**, including any game available during development.

## 7. Feature freshness and missing data

- Only captures with `capturedAt` ≤ the run's `generatedAt` and < first pitch.
  - `batter-splits`: the latest same-game capture, else the player's latest capture from the previous 10 days.
  - `pitcher-workload` and `matchup`: same game only.
- Unknown hand: splits pooled. Unknown slot: 3.85 PA. Missing splits or line: league rates.
- Each row records the counts of missing items and the **capture time of every feature used**.
- **Input fingerprint:** `stableHash` of the challenger's full engine input, plus the champion's `artifactHash`.

## 8. Freezing, eligibility and grading

- **Frozen pregame:** a row is written only for a game not started at the run's own clock. A game's row is replaced only while it is pregame and regenerated, and a carried-forward game keeps the row that paired with its frozen public forecast (the same rule as the P317 shadow). After first pitch, nothing is written.
- **Eligible for grading:** the row's champion `artifactHash` must equal the **forecast of record**. Where the served-forecast evidence (#1046) exists, it must verify that the forecast was served. Unverified games are excluded and counted, never graded as losses.
- **Immutability:** rows are append-only per game. Receipts are built from committed official finals.

## 9. Publication and promotion restrictions

- `dataClass: PRIVATE_RESEARCH`, under `data/internal/research/mlb/engine-level-shadow/matchup-v1/` (a subfolder of the P317 shadow path the MLB workflows already commit, so no workflow change is needed; the P317 receipt reads only top-level date files).
- Nothing is read by any public page.
- No recommendations, no eligibility, no paused family touched.
- It rides the generator's existing commit (COST-001: no standalone commits, no new Vercel builds) and uses no paid API.
- Promotion needs a separate founder decision.
