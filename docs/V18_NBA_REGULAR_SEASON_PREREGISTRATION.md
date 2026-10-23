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
| Winner side (Stage 12-S1) | `nba-winner-side@1`: the side of `elo.pHome` (founder N2), TOO_CLOSE only at exactly 0.5 (N4 open), frozen with the producing `modelVersion` | `app/src/lib/sports/nba/winner-side.mjs` |
| Joint combinations (Stage 12-S1) | `pra`, `ptsAst`, `ptsReb`: quantiles of the per-draw sums of the player's own simulated components (no extra randomness) | `game-sim.mjs` `COMBO_KEYS` |
| 2026-27 challenger (Stage 12-S1b, founder N3) | family `v0.2`, `nba-experimental-v0.2-season-2026-27`: v0.1's pool, Elo and minutes also folding the 2026-27 finals record and fetched box scores as of the forecast instant | `season-fold.mjs`, `experimental-forecast.mjs` `FAMILIES` |
| Role-minutes forward-shadow challenger (founder, 2026-10-22; §14, look 8) | family `v0.3`, `nba-experimental-v0.3-role-minutes`; minutes model `nba-minutes-model-v0.3-role-prior`, pool `nba-roster-gated-pool-v0.3`, engine `nba-sim-v0.3-conditional-minutes`: v0.1's roster gate and Elo, a new minutes layer and its normalisation, frozen at the v0.1 cutoff | `minutes-model-v03.mjs`, `game-sim-v03.mjs`, `experimental-forecast.mjs` `FAMILIES` |

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
counted, never zero). Families: **points, rebounds, assists, 3PM**; **PRA, points + assists (P+A) and
points + rebounds (P+R) only as joint combinations** of the simulated components (never separately fitted
markets; P+A and P+R added before their first frozen forecast, founder N5, 2026-10-07).

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
| P+A, P+R | the two component families must each have met their bar |
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
| P+A, P+R | components each PUBLIC; joint coverage ∈ [0.76, 0.84] on ≥ 1,000 rows each | same | never fitted alone; same shape as PRA (founder N5) |

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
| 2 | 2026-10-02 | 2024-25 **development** season, full (1,005 games after day 30), v0 + shadow Elo unchanged, 1,000 sims, dry run (`diagnose-sim-dispersion.mjs --season 2025 --games 1005 --simulations 1000`) | v0 sim winner Brier **0.267** vs shadow Elo **0.215** (bar ≤ 0.240); margin p10–p90 coverage **0.88** (bar 0.76–0.84); margin bias −1.42 (bar \|bias\| ≤ 1.0); sim total SD 22.02 ≈ margin SD 22.00 (bar: total SD > margin SD). v0 cannot meet the winner, margin or total bars; it stays the frozen shadow. No bar changed; assessment season (2025-26) still unread by any candidate |
| 3 | 2026-10-07 | no outcome: founder decisions N1–N3, N5 (Yash, 2026-10-07 03:21Z) recorded before the first 2026-27 regular-season game. Additions only: the frozen Elo winner side and the joint PRA / P+A / P+R quantiles become new keys in every family's receipt (v0 included; no existing v0 or v0.1 number changes, checked byte-for-byte against the previous build on real slates), the P+A / P+R rows above (PRA's shape), and the v0.2 challenger family | no bar changed. v0.1 is the player champion (N1); v0.2 shadows from game 1 and never replaces v0.1 or the Elo side automatically (N3). The winner row's bar names `sim`; scoring an Elo-side winner for promotion is a later founder reading (N6), not this look |
| 4 | 2026-10-19 | **v1 candidate** (`nba-sim-v1-coherent`, family `v1`, CANDIDATE_SHADOW; `game-sim-v1.mjs`, `sim-v1-profile.mjs`). Scalar parameters fitted on the 2023-24 regular season ONLY (`calibrate-sim-v1.mjs` → `reports/sim-v1-calibration-2024.json`) and frozen; then ONE look at the 2024-25 **development** season, same sample rule as look 2 (1,005 games ≥ day 30), seasons ≤ 2025 only loaded (`evaluate-sim-v1.mjs --write` → `reports/sim-v1-dev-evaluation.json`; a 5-game harness smoke run preceded it, numbers discarded). v1 4,000 draws, v0 1,000, Elo unchanged; v1 pools = historical roster proxy (no captures existed), no injuries feed | v1: winner Brier **0.212** (Elo 0.215, v0 0.267), log loss 0.612 (Elo 0.618, coin 0.693), ECE 0.025; margin MAE 11.31, bias +0.56, p10–p90 0.815, p25–p75 0.536; total MAE 15.29, **bias −2.98 (fails \|bias\| ≤ 2.0)**, p10–p90 0.776, p25–p75 0.480; sim total SD 17.94 > margin SD 14.38; OT rate 2.4 % vs realised 4.6 % (under). Players (expected ≥ 20 min, n 9,930): minutes MAE 5.41; p10–p90 coverage pts 0.780, **reb 0.849, ast 0.859 (fail 0.76–0.84), 3PM 0.905 (fails 0.74–0.86)** — over-dispersed. Historical dev numbers only: no interval on the v1−Elo winner difference was computed, so no claim that v1 beats Elo; nothing promotes or validates v1. No parameter changed after this look; assessment season (2025-26) still unread by v1; v1 starts its own forward shadow as a candidate |
| 5 | 2026-10-20 | **no outcome; governance amendment.** Founder decision (Yash, in the release owner's session, 2026-10-20) creating a separate **EXPERIMENTAL PUBLIC LANE** (§13), recorded before any 2026-27 regular-season final. Read: the frozen pre-tip receipts for 2026-10-20 (v0.1 + Elo; integrity verified). | **No bar, threshold, metric, sample size, graded record or evaluation rule above changed.** No market moved from SHADOW. The capability registry keeps NBA `HISTORICAL_ONLY`. The lane counts toward nothing in §6–§8. |
| 6 | 2026-10-20 | **no outcome; governance amendment A** (§13 amendment A). Founder's conditional approval (Yash, 2026-10-20) of projection-only player boards with PRA / P+R / P+A. Recorded; activation is via the release-owner gate. Read: the same frozen 2026-10-20 v0.1 receipts, to reconcile the combo fields. | **No bar, threshold, metric, sample size, graded record or evaluation rule above changed.** No market moved from SHADOW; registry still `HISTORICAL_ONLY`. Combos are copied from the receipts (per-draw sums), not recomputed. |
| 7 | 2026-10-21 | **no outcome; governance amendment C** (§13 amendment C). Founder decision (Yash, in the release owner's session, 2026-10-21): `nba-possession-sim-v0` is ALLOWED as the NBA Theater replay engine and its public presentation is conditionally approved — not a promotion (approval file `docs/launch/approvals/NBA_THEATER_PUBLIC_2026-10-21.md`). Read: the frozen 2026-10-20 v0.1 receipts (official panel) and the stored possession runs built from as-of-tip inputs. | **No bar, threshold, metric, sample size, graded record or evaluation rule above changed.** Elo + v0.1 stay official; no market moved from SHADOW; the possession engine counts toward no validation or product record; registry still `HISTORICAL_ONLY`. |
| 8 | 2026-10-22 | **Outcome look (investigation of v0.1's low projected minutes, PR 1178) + amendment: the v0.3 forward-shadow challenger (§14).** Read: the frozen 2026-10-20 / 2026-10-21 v0.1 receipts (all 14 games re-derived their `payloadSha256` from the roster and injury git blobs they hashed); the 2026-10-20 final box scores (3 games, 63 matched player rows), for v0.1 and for a REPLAY of the v0.3 candidate; the 25 committed 2026-10-21 PTS lines (private capture — a line is not truth); the release owner's relayed v0.1 shadow grading. **Diagnosis (founder-accepted 2026-10-22):** the primary cause is the uniform 240-minute rescale of the roster pool (`game-sim.mjs:98-99,112`; factors 0.62–1.22; a median 5.2 / 5.5 minutes off projected starters on 10-20 / 10-21); secondary, the trailing window is the last 10 games of 2025-26, play-in and playoffs included (`minutes-model.mjs:56,96-99`); **not preseason** (v0.1 reads no 2026-27 box score; 0 preseason appearances used). The v0.3 rule was chosen on structural grounds. **Disclosure:** v0.3's first draft (one uniform factor on Σ playRate·minutes) changed ONCE, after a PROJECTION-SIDE replay inspection only (rescale factors and starter minutes, no outcome), to bench-first water-filling with v1's frozen power; the 10-20 outcome comparison for v0.3 was computed after that final design; nothing changed after any outcome. The two constants (§14) were approved by the founder for v0.3 only. **Moving closer to sportsbook lines does not establish better accuracy.** | **No bar, threshold, metric, sample size, graded record or evaluation rule above changed.** v0.1 stays official for players and Elo for winners; nothing promoted; registry still `HISTORICAL_ONLY`. 2026-10-20 and 2026-10-21 stay frozen and immutable; this look's replays are descriptive and are **never v0.3 forward-shadow samples** (they were built after tip, §8). v0.3 is frozen (§14) before its first forward slate. |

## 13. Experimental public lane (amendment, founder decision 2026-10-20)

**Status.** This is a separate lane beside the preregistered shadow. It is **not** the §7–§8 SHADOW → PUBLIC FORECAST promotion: it satisfies no bar, and its outputs are never counted as validation, as a forward-shadow sample, or as a product record. Lane id `nba-experimental-public@1` (`app/src/lib/sports/nba/experimental-public-lane.mjs`).

**Scope:**
- **Surfaces:** the `/nba` hub only (plus `/nba/projections/` under amendment A below, once activated).
- **Data:** one canonical snapshot per slate, `nba-experimental-public-snapshot@1`, at `app/public/data/nba/experimental-public/<date>.json`. It is built by `app/scripts/nba/build-nba-experimental-public.mjs` from the **committed** v0.1 forecast file.
- **Every public surface** that shows these figures reads this snapshot and nothing else.

**What is published, per game:** only games whose forecast receipt verifies (`receiptIntegrity` = OK, generated strictly before tip):
- **Game information:** the Elo winner side (founder N2), shown as the favoured team only. Source label: "Elo team rating".
- **Player figures:** v0.1 roster-gated player medians (founder N1) for PTS / REB / AST / 3PM, plus expected minutes. Players with at least 10 expected minutes who are not ruled Out are listed by expected minutes, never ranked. Source label: the v0.1 receipt's model version.
- **Provenance:** freeze time, tip time, receipt model version and payload hash. Every block carries the notice **UNVALIDATED EXPERIMENTAL SIMULATION**.
- **No recomputation:** every number is copied from the receipt's stored payload, and the producer refuses any game that does not re-derive.

**What is withheld (pinned by tests):**

| Item | Reason |
|---|---|
| Win probabilities and confidence | No regular-season game has been graded |
| Projected team scores | The v0.1 team score is a sum of player simulations that ignores the opponent; on 2026-10-20 it contradicts the Elo side in 2 of 3 games; v0's margin and total checks failed (look 2) |
| Player ranges | Preseason coverage was not reliable |
| Odds, lines, edges, picks, Top-10 rankings | No authorized NBA price exists |
| Bank Builder, Moonshot and Parlay Lab legs; Smart Betslip selections | The registry stays `HISTORICAL_ONLY`, so `canEnterPredictionProducts("nba")` is false |
| The animated NBA Simulation Theater | Stays private until its own activation, alignment and privacy gates pass |

**A tipped game** is shown as a *frozen pregame forecast*, with its freeze time, never as live.

**Model versions:**
- v0.1 family receipts (`nba-preseason-experimental-v0.1`), using the simulation engine `nba-preseason-experimental-v0`.
- Elo `NBA_ELO_PARAMS` (§1).
- The v1 candidate is **not** a lane source.

**Data sources:**
- ESPN public schedule, roster and injuries captures (free).
- The box-score corpus (§2).

**Rollback criteria.** Set `LANE.enabled = false` (one line); the next build removes every lane surface. Roll back on any of these:
- a published number that differs from its receipt;
- a game published without a verified pre-tip receipt;
- any probability, odds, edge or pick reaching the page;
- the snapshot being read by a product;
- a private v1, theater or internal-path marker in the export;
- wrong game identity.

**Lane scorecard.** The lane's figures are graded only as context, in the existing shadow ledger for v0.1, which is already graded nightly. They are never reported as a validated record.

### 13 amendment A. Projection-only player boards (recorded 2026-10-20 — conditional approval; activation via release-owner gate)

**Status.** Recorded 2026-10-20 after the founder's conditional approval (Yash, 2026-10-20). It is a change to the lane only: no bar, threshold, metric, sample size, graded record or evaluation rule in §1–§12 changes, no market leaves SHADOW, and the registry keeps NBA `HISTORICAL_ONLY`. Activation is the release-owner gate: the route ships only when the release owner merges it after confirming the publication with the founder. The proposal it adopts is `docs/nba/NBA_LANE_AMENDMENT_PROPOSAL_2026-10-20.md` (PR 1161).

**The founder's conditions (2026-10-20):**
- projection-only player boards with matchup, team, player and stat filters and user-controlled sorting;
- PTS, REB, AST, 3PM, PRA, P+R and P+A, only where actually modelled;
- combination statistics derive from the same frozen simulation draws and pass source-reconciliation tests;
- every projection is clearly labelled experimental and unvalidated;
- no sportsbook lines, odds, edges, EV, betting recommendations or unsupported markets under this authorization;
- the amendment is recorded formally, every required safeguard is preserved, and page weight is measured;
- a separate lightweight projection-board experience is preferred where needed.

**What it permits:**
- **Surface.** One added route, `/nba/projections/`, a separate lightweight page. `/nba` gains one link line to it, and its lane cards are compact (see Page weight below). The route reads only the lane snapshot (`latest.json`), under the same rule as `/nba`: hidden when disabled or when its slate is past (`laneIsCurrent`).
- **Board view.** A table of the snapshot's players with filters for matchup, team, player (text) and stat group. The default order is expected minutes. A reader may re-sort by a stat column; that is the reader's sort, not a published ordering.
- **Combination medians.** PRA, P+R and P+A medians, copied to 1 dp from the same v0.1 receipt (`pra` / `ptsReb` / `ptsAst` p50). The v0 engine sums the components per simulated draw (`game-sim.mjs` `comboDraws`), so a combo median is the median of the per-draw sum, not the sum of component medians. Label: "sum over the same simulated draws (v0 engine; components independent within a player)".
- **Snapshot.** Additive only, so it stays `nba-experimental-public-snapshot@1`: `comboMedians` per player row and `comboSource` per game. No existing key, value or name changes. The board's stat list is `PROJECTION_BOARD_STATS`; the `/nba` card columns (`STATS`) are unchanged.

**Source reconciliation (pinned by tests; any failure refuses the build):**
- every published combo equals the receipt's own p50 (1 dp), and differs from the sum of component medians wherever the receipt's values differ;
- for every receipt player, each combo mean equals the sum of its component means within 0.02 (draws are additive in the mean). A failure refuses the whole snapshot build;
- the producer's `snapshotMatchesSource` re-derives the combos, and the builder exits 1 on any mismatch;
- the 2026-10-20 snapshot was regenerated with fields added only. Stripping the added fields gives the pre-amendment file byte-for-byte (sha256 pinned in `projection-boards.test.mjs`).

**What stays withheld:**

| Item | Status |
|---|---|
| Sportsbook lines, odds, edges, EV, picks, leans, betting recommendations | Not shown; no authorized NBA price |
| R+A, steals, blocks, turnovers | Not modelled; never shown |
| Rank numbers, "top" wording, highlights, badges | Never shown; the only order besides expected minutes is the reader's own sort |
| Player ranges (p10–p90), means, SDs, per-draw data | Not published (§13) |
| Win probabilities, any percentage or chance | Not shown (§13) |
| Projected team scores | Withheld (§13) |
| Products (Bank Builder, Moonshot, Parlay Lab, Smart Betslip, Ask, Top-10 picks) | Cannot read the lane; `canEnterPredictionProducts("nba")` stays false |

**Safeguards preserved:**
- every block carries the UNVALIDATED EXPERIMENTAL SIMULATION notice, with freeze times and receipt hashes;
- no recomputation;
- the route never reads `data/internal/**` at runtime;
- the client island's import graph is browser-safe (no `node:` module);
- the §13 rollback criteria apply unchanged, plus one more: a combo that does not reconcile.

**Rollback switch.** Set `AMENDMENT_A.enabled = false` in `app/src/lib/sports/nba/experimental-public-lane.mjs` (one line). The next snapshot build drops the combo fields, `/nba/projections/` renders its empty state, and the `/nba` link line disappears. `LANE.enabled = false` still removes every lane surface, this one included.

**Page weight (measured 2026-10-21, release owner).** Full builds with the real 11-game 10-21 slate (uncommitted fixture built by the producer from verified receipts) and a 15-game synthetic slate:
- `/nba/projections/`: 149 KB at 11 games and 175 KB at 15, after the board payload was packed (PR 1163). Budget **200 KB**.
- `/nba` with full per-team tables: 388 KB at 11 games against its 250 KB budget.

So, with this amendment on, the `/nba` lane cards became compact (PR 1170):
- each card keeps matchup, tip, freeze time, final status, the Elo-favoured team, player count and receipt;
- every player row lives on `/nba/projections/` only;
- with `AMENDMENT_A.enabled = false` the full tables return to `/nba`.

`/nba` then measured 232 KB at 11 games and 239 KB at 15. No existing budget was raised, and no published number changed.

### §13 amendment B — NBA Simulation Theater: canonical forecast + labelled supporting-simulation runs

**Status:** recorded 2026-10-20 as **approved in principle** by the founder. It is not an activation. The public NBA Theater stays OFF until the activation conditions below are met and the release owner verifies them.

**The founder's decision:** "Adopt the architecture separating the canonical official forecast from independently simulated v1 outcomes. The official projection panel must never change when users explore alternative simulation runs. Retain the v1 Top 10 research board, but relabel it clearly as an NBA v1 Challenger — Research Only … Do not activate the Theater publicly merely because the architectural decision is approved."

**What it decides:**
1. **One official forecast.** The Theater's official projection panel shows only the canonical snapshot: the Elo side plus v0.1 players, exactly as the lane prints them.
2. **Runs are labelled.** Replayed games are individual runs of the supporting simulation engine (`nba-sim-v1-coherent`).
   - The run the Theater opens on is labelled "Simulated game · one supporting-simulation run". It is never "official".
   - Every other run is a hypothetical what-if.
3. **No overwrite.** Nothing a run shows changes, replaces or rounds into an official number: not on the Theater, boards, lane, products or results.
4. **No anchor.** v1 is not required to agree with the official forecast. Which engine is best is decided by forward, market-by-market evidence (roadmap `NBA-CC`), never by this amendment.
5. **The v1 board.** It is "NBA v1 Challenger — Research Only": private, never official, never a Top Pick, never a product source.

**Engineering:**
- `app/src/lib/consistency/theater-gate-policy.mjs` sets `NBA_THEATER_GATE_POLICY_IN_FORCE = LABELLED_SUPPORTING_RUNS`.
- The consistency gate still requires:
  - a verified pre-tip supporting game;
  - box-score invariants on every run;
  - no scenario leak;
  - no unlabelled model-version mix.

**Activation conditions (all required; none is met by this amendment):**
1. A recorded founder approval file under `docs/launch/approvals/` that permits public NBA Theater output, cited in the commit that sets `NBA_THEATER_PUBLIC_ENABLED = true`.
2. The consistency gate is open for each published game.
3. A public route exists, and the export-boundary rules are revised to allow exactly the labelled public Theater markers.
4. e2e at 320 / 390 / 768 / 1440, accessibility, reduced motion, and a privacy scan of the export.
5. Release-owner verification on the exact head and on Production.

**What stays withheld:** win probabilities, official team scores and ranges, odds, picks and products, as in §13.

### §13 amendment C — NBA Simulation Theater: the Research Possession Simulation as the replay engine

**Status:** founder decision recorded 2026-10-21: **APPROVED (conditional)**, feature **OFF**. Approval file: `docs/launch/approvals/NBA_THEATER_PUBLIC_2026-10-21.md` (PR 1116). It is not an activation and not a promotion. `NBA_THEATER_PUBLIC_ENABLED` stays `false` until the approval file records every gate with the exact SHA it passed on and the release owner sets it in its own reviewed commit.

**The founder's decision (quoted in the approval file):** "For PR #1167, I approve using `nba-possession-sim-v0` as the replay engine for the NBA Simulation Theater … I also approve its public presentation conditionally … I do not authorize promoting this research engine to our official NBA model. Keep v0.1/Elo as the canonical forecast until a separate evidence-based model-promotion decision." The engine question is closed; it is not to be reopened.

**What it changes:** amendment B approved the architecture with labelled runs of `nba-sim-v1-coherent`. Amendment C names the engine that replays: for this engine and this scope only, the Theater playback moves out of "withheld". Three roles, kept separate:

| Role | Source | Rule |
|---|---|---|
| **A. Official GameTimePicks forecast** | the canonical frozen snapshot: Elo winner side (N2) + v0.1 player medians (N1) | the official panel shows it exactly as the `/nba` lane prints it (the lane's players and stats, medians to 1 dp, expected minutes) and never changes when a replay runs, a run is chosen or a what-if is opened |
| **B. NBA v1 Challenger** | `nba-sim-v1-coherent` | model evaluation and comparison only; it no longer drives any replay and never overwrites, rounds into or replaces an official number |
| **C. Research Possession Simulation** | `nba-possession-sim-v0` | drives the playback: every play, score, clock state, possession and lineup comes from one stored event log, and the box score is the fold of that log (checker P1–P11 on every pool draw); not official, not promoted, counted toward no validation or product record |

**Scope** — the public route `/nba/simulation/[eventId]` (PR 1167), only for games with a verified pre-tip official snapshot and stored possession runs built from as-of-tip inputs:
- four-quarter animated playback, possession by possession; synchronised clock and scoreboard;
- scoring events, substitutions and play-by-play; player contributions; overtime;
- pause, resume, restart and speed controls;
- final team and player box scores; the official-versus-simulated comparison;
- clearly labelled alternative runs (each a hypothetical what-if).

**Required on-screen labelling** (`app/src/lib/simulation-theater/nba/possession/labels.mjs` `ROLE_C_LABEL` / `ROLE_C_NOTE`, pinned by test): the primary label **"Research Possession Simulation — Unvalidated"**, with the note that the replay is generated by an independent research simulation engine; that it is not the official GameTimePicks forecast; that one replay is one possible modelled outcome; that a different simulated score does not mean the official forecast changed; and that the engine's predictive superiority has not been established. Nothing may imply a real or live basketball game.

**Engineering:**
- `app/src/lib/consistency/theater-gate-policy.mjs` `NBA_THEATER_REPLAY_ENGINE` names the approved engine and cites the approval file.
- Under `LABELLED_SUPPORTING_RUNS` (in force), `theaterActivationGate("NBA", id)` opens a game only when this engine's stored runs for it pass the shared replay gate (`possession/stored-run.mjs` `replayGateProblems`): the approved engine; every stored run passes P1–P11 and its digest; the whole seed pool was checked with zero violations; the runs were selected against the game's CURRENT official snapshot; the default run is won by the official Elo side; the engine's inputs are dated no later than the game's lock. The scenario-leak, box-score and model-version-mix checks still apply. A v1 game is no longer required for the replay.
- The public loader applies the same replay gate; a test pins that every game it would publish has the consistency gate open.

**What stays withheld (§13, unchanged):** the official win probability, official team score and ranges; odds, lines, edges, picks and rankings. No Theater output feeds Bank Builder, Moonshot, Parlay Lab or Smart Betslip; the registry stays `HISTORICAL_ONLY`. **No bar, threshold, metric, sample size, graded record or evaluation rule above changed.**

**Activation conditions** — amendment B's five, with this engine; evidence and SHAs are recorded in the approval file; the flag is the release owner's.

## 14. v0.3 role-minutes forward-shadow challenger (founder decision 2026-10-22; look 8)

**Status.** Founder decision of 2026-10-22, recorded in the PR 1116 decision register and relayed by the release owner. v0.3 is **APPROVED as a FORWARD-SHADOW CHALLENGER only**. It is not a promotion, it publishes nothing, and it changes no official value. Evidence and replays: `docs/nba/NBA_V01_PRESEASON_MINUTES_INVESTIGATION_2026-10-21.md` (PR 1178).

**The diagnosis (accepted).**
- **Primary cause:** the uniform 240-minute rescale. `prepareRoster` multiplies every rostered player's minutes-per-appearance by one factor, 240 ÷ pool sum (`game-sim.mjs:98-99`, applied at `:112`). The pool sums ran 197–384, so the factor was 0.62–1.22, and projected starters lost a median 5.2 (10-20) / 5.5 (10-21) minutes.
- **Secondary cause:** the "trailing10" window is the team's last 10 games of 2025-26. The "regular" population is `phase !== 1`, so play-in and playoff games are inside it (`minutes-model.mjs:56,96-99`).
- **Not preseason.** v0.1 reads only the corpus box scores (`dataRule: "corpus-v1"`) and the minutes model drops phase 1.
- The frozen 2026-10-20 / 2026-10-21 forecasts are unchanged.

**Candidate identity.**

| Component | Version | Where |
|---|---|---|
| Family | `v0.3`, role `CHALLENGER`, directory `experimental-v0.3/` (own forecasts and own ledger), `alignsWith: "v0.1"` | `experimental-forecast.mjs` `FAMILIES` |
| Model version | `nba-experimental-v0.3-role-minutes` | same |
| Minutes model | `nba-minutes-model-v0.3-role-prior` | `app/src/lib/sports/nba/minutes-model-v03.mjs` |
| Pool | `nba-roster-gated-pool-v0.3` (v0.1's roster gate: fail closed, injuries rule, INSUFFICIENT_HISTORY null never 0) | `minutes-model-v03.mjs` `gatePoolV03` |
| Engine | `nba-sim-v0.3-conditional-minutes`: the v0 per-draw model and seed, with conditional minutes, bench-first normalisation and a participation stream (`game-sim.mjs` itself is not edited and stays pinned) | `app/src/lib/sports/nba/game-sim-v03.mjs` |
| Data rule | `corpus-v1+boxscores-2026-27`: the fetched 2026-27 box scores fold, the finals record does not, so **v0.3's Elo is v0.1's** | `build-nba-experimental-forecasts.mjs` |

**The rules (frozen).**
- **Population:** regular season = phase 2 + cup final only (`sim-v1-profile.mjs` `inPopulation`; `minutes-model-v03.mjs:76`).
- **Role prior:** the whole prior regular season, by athlete, across teams.
- **Blend:** `minutes = (w·Σprior + Σcurrent) / (w·n_prior + n_current)`, `w = min(1, PRIOR_GAMES / n_prior)` (`minutes-model-v03.mjs:122`). Rates, starter share, minutes SD and play rate use the same weights.
- **Play rate:** appearances ÷ (appearances + coach's-decision DNPs) (`:135`).
- **Normalisation:** minutes stay conditional on playing, and the team sums to 240 in expectation (Σ playRate·minutes).
  - An over-full pool is water-filled on minutes^power (`game-sim-v03.mjs:91-93`).
  - A pool at or under 240 keeps v0's uniform bounded factor.

**The two constants (approved by the founder for v0.3 ONLY).**

| Constant | Value | Origin | Implementation | Rationale |
|---|---|---|---|---|
| Prior strength `PRIOR_GAMES` | 10 appearances | Reuses the frozen v0 window length `TRAILING_N = 10` (`minutes-model.mjs:29`, §1). Not fitted to any outcome. | `minutes-model-v03.mjs:58` (`PARAMS`), used at `:122` | The prior is worth one v0 window of games. A thin prior is never inflated (w ≤ 1). There is no switch point, so there is no season-turnover cliff. |
| Bench-first power `MINUTES_POWER` | 1.25 | Reuses v1's frozen `V1_PARAMS.MINUTES_POWER` (`game-sim-v1.mjs:97`), fitted on 2023-24 only and frozen at look 4. Not fitted to any 2026-27 outcome. | `minutes-model-v03.mjs:52,58` (`NORMALISATION`, `PARAMS`), applied in `game-sim-v03.mjs:93` | A power above 1 takes an over-full pool's excess mostly from short-minutes players, as real rotations do, instead of one share off every starter. |

Both constants, every version string, the family spec and the two source files' sha256 are pinned by `minutes-model-v03.test.mjs` ("FROZEN CONSTANTS AND RULES"). **No tuning after 2026-10-20/21. Any change during the test is a NEW candidate** (new version strings, its own shadow), never an edit of v0.3.

**The founder's conditions.**
1. v0.1 stays official for players, and Elo for winners. v0.3 never feeds the lane, the official snapshot, the Theater or any product. This is pinned by the "ISOLATION" test (text and import-graph guard).
2. 2026-10-20 / 2026-10-21 stay frozen and immutable. The replays are descriptive and never forward evidence. The builder refuses replay inputs unless `--out` is outside the repository.
3. v0.3 is frozen and registered **before its first forward slate**. This section and the code freeze land before the first 2026-10-22 freeze.
4. **The same information cutoff as the official forecast:**
   - same instant and same inputs;
   - a v0.3 game is frozen only where v0.1's receipt for it has `generatedAt` equal to the run's `--now` and the same roster sha256, injury sha256 and schedule capture (`experimental-forecast.mjs` `alignedCutoffRefusal`, enforced by the builder). Any other game is refused per game (`NOT_ALIGNED`), never built at another cutoff;
   - v0.3 runs after v0.1 in the same workflow run. Its data rule also folds the fetched box scores captured at or before that instant.
5. Graded against real results by the same grader and ledger rules as every family (`grade-nba-experimental-forecasts.mjs --family v0.3` → `experimental-v0.3/ledger.json`):
   - errors;
   - calibration;
   - interval coverage;
   - availability handling (predicted-but-DNP, predicted-but-absent, played-but-unpredicted);
   - minutes accuracy.

   It is compared with v0.1 on paired pre-tip regular-season rows by the champion/challenger evaluator, and a direction is claimed only with an interval excluding 0.
6. The preregistered promotion rules are kept: §6 minimums, §7 bars and §8 forward shadow, market by market. There is no automatic promotion. Promotion happens only through a founder-approved record in the PR 1154 promotion record, citing READY_FOR_FOUNDER_REVIEW. No new official value without a separate approval.

**Moving closer to the sportsbook lines does NOT establish better accuracy.** On 2026-10-21 the v0.3 replay sat closer to the 25 consensus lines than v0.1: median gap −1.3 vs −3.0. A line is not an outcome, one night is not a sample, and nothing here claims v0.3 is better than v0.1 on any market.

**Looks.** 2026-10-20 / 2026-10-21 are recorded as an outcome look (look 8), never as v0.3 forward samples. The first v0.3 forward sample is the first slate it freezes at v0.1's cutoff after this section lands.

**No bar, threshold, metric, sample size, graded record or evaluation rule above changed.**

### 14.1 Reporting note (2026-10-23): few-clusters guard (claim-suppressing only)

**What changed.** The §14 champion/challenger evaluator (`app/src/lib/sports/nba/champion-challenger.mjs`, `EVALUATOR_VERSION` → `nba-champion-challenger-2`) and the daily diagnostics (`model-diagnostics.mjs`, → `nba-model-diagnostics-2`) still print every game-clustered 95% interval exactly as before. Below `FEW_CLUSTERS_BELOW = 10` games, though:
- a paired difference's direction is `FEW_CLUSTERS`, not `CHALLENGER_LOWER` / `CHAMPION_LOWER` / `CI_INCLUDES_0`;
- a bias or coverage finding's status is `FEW_CLUSTERS`, not `SYSTEMATIC` / `NO_CLAIM`, so it feeds no text-only proposal.

**Why.** A percentile bootstrap that resamples k games can only recombine those k games. With very few games, its interval is about the span of the per-game means. On 2 games, "excludes 0" says only that both games leaned the same way.
- The first v0.3 forward comparison (2026-10-22, 2 games) printed directions and "SYSTEMATIC" labels from exactly that.
- Its verdicts were correctly `INSUFFICIENT_N`, but a reader could have quoted a direction.
- The threshold is not fitted. It is the reporting threshold already used by the PR 1180 historical backtest (`REPORTING.fewClustersBelow = 10`).

**Why it is claim-suppressing only** (pinned by the "few-clusters guard" tests in `champion-challenger.test.mjs` and `model-diagnostics.test.mjs`, each against the pre-guard rule):
- No interval, estimate or n changes, and no new claim can appear.
- A direction can only become `FEW_CLUSTERS`, and only below 10 games.
- A verdict can never become `READY_FOR_FOUNDER_REVIEW` because of it.
- For every game-level §6 market the guard cannot touch a verdict at all: n = games, and `INSUFFICIENT_N` is decided before the direction is read, with minN 300 ≥ 10.
- For player markets it could only matter with ≥ 800–1500 eligible rows in under 10 games, which two NBA rotations cannot supply.
- On the committed 2026-10-22 ledgers, every verdict for v0.2, v1 and v0.3 is identical with and without the guard.

**No bar, threshold, metric, sample size, graded record or evaluation rule above changed.** The §6 minimums, the §7 bars, the §8 forward-shadow rule and the verdict rule are unchanged. Nothing is promoted, and the registry stays `HISTORICAL_ONLY`.
