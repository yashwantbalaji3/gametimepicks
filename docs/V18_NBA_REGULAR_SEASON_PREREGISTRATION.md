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
- **Surface.** One added route, `/nba/projections/`, a separate lightweight page. `/nba` changes only by one link line to it. The route reads only the lane snapshot (`latest.json`), under the same rule as `/nba`: hidden when disabled or when its slate is past (`laneIsCurrent`).
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

**Page weight.** The route has no budget until it is measured on a post-05:00Z build. The measurement commands are in the PR; no existing budget is raised.

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
