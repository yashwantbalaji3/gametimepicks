# Simulation Engine V2 (Session 13 · Phases C–E) — SHADOW

**What GameTimePicks means by "simulation":** each Monte Carlo run is one coherent possible game — a game clock, a
drive sequence, scoring events, team totals and player totals that all agree with one another — and every published
distribution is a count over those runs. A sport that still produces independent expected summaries is a
**projection**, and its page says so.

| | |
|---|---|
| Engine | `nfl-drive-sim-v2` · version `2.0.0-shadow` · `app/src/lib/sports/nfl/sim-v2/` |
| State | **SHADOW** — nothing public reads it. V1 stays canonical. |
| Receipt | `simulation-receipt@2` (`receipt.mjs`), shadow files `data/internal/research/nfl/sim-v2/shadow/<date>/<eventId>.json` (write-once) |
| Verdict (Protocol A) | **COHERENT_BUT_NOT_PROMOTED** — 0 incoherent runs in 1.64M; winner Brier worse than V1; score MAE at parity; period model new; documented biases (§6) |
| Page label | "EXPECTED STATISTICAL SUMMARIES · NOT ONE SIMULATED GAME" **stays** (it is still true of every public NFL number) |

## 1. Audit of the current v1 architecture (C1)

No published NFL number comes from a simulated game path; there is no drive, possession, quarter, clock or play
state in any production engine.

| Output | Producer | Class |
|---|---|---|
| Win probability | `build-nfl-public-forecasts` → MOV-Elo win head, analytic logistic × (1 − tie mass) | independent expected summary |
| Margin / total / team-score ranges | `game-sim.mjs` `nfl-gamesim-v1-joint-normal`: margin ⟂ total Gaussians, 10k draws | semi-independent summary (not a game path) |
| Projected score | `derivedProjectedScore(total median, margin median)` | expected summary |
| Score shape (key numbers, OT/tie) | `build-nfl-score-shape` `nfl-full-game-v2-regular-season`: 11 latent "scoring chances" per team, solved onto the published medians | scoring-event MC, no drives/clock, separate from every player number |
| Rushing / passing yds, anytime TD | share-level v1 / `nfl-anytime-td-opportunity-v1`, closed form per player; TD μ from team TD **form**, not the forecast's score | independent summaries |
| Receptions / receiving yds | props-v1 MC (5k) over the **incumbent** Gaussian environment, not the published heads | semi-independent |
| Private joint sims v1–v3 (P249) | per-draw coherent opportunity MC, no drive path | private, COHERENT_BUT_NOT_PROMOTED |

No shared latent variable connects the published families; Σ player P(TD) is not reconciled to projected points.
Full audit notes: inputs, seeds (mulberry32, `fnv1a(engine::event::date::REGULAR)`), receipts and bars are in the
Session 13 handoff.

## 2. SimulationReceiptV2 (C2) — sport-neutral contract

`schemaVersion, simulationReceiptId, sport, eventId, eventStart, home, away, simulationEngine, simulationEngineVersion,
promotionState (SHADOW|EXPERIMENTAL|PUBLIC), modelVersion (the anchor heads), inputSnapshotIds, availabilitySnapshotId,
marketReceiptId (null) + marketUse ("NOT_AN_INPUT …"), seedStrategy, baseSeed, runCount, runSchemaVersion, params,
calibration, aggregate {winProbability{home,away,tie}, overtimeProbability, score{home,away}, margin, total,
marginHistogram, totalHistogram}, periodAggregates [Q1–Q4, H1, H2 — each from the same runs], teamStatDistributions,
playerStatDistributions [per player: quantiles per stat, anytimeTd, twoPlusTd], scoringEventDistributions
{firstTdScorer, teamFirstTd, teamTdCount}, representativeRuns [label "REPRESENTATIVE SIMULATED GAME", runIndex, final,
quarters, drives], validation {coherenceChecks, sampleCount, failedRuns, failureCodes}, generatedAt, artifactHash}`.

Quantiles are `{mean, p10, p25, p50, p75, p90}`. The receipt stores aggregates, not 10,000 event logs; any run can be
re-simulated exactly from `baseSeed` + its index (representative runs are produced that way and are tested to equal
the batch run). `validateSimulationReceipt()` refuses: an unlabelled representative, a market input, any incoherent
run, a receipt claiming PUBLIC on its own, P(2+ TD) > P(ATD), a representative that names no real run.

## 3. NFL engine (D1–D5) — Level 1 drive simulation with play families inside drives

Per possession: drive result | (field-position bucket, score state, clock state) → plays and clock → net yards (a
TD covers exactly the field) → play mix (dropback rate by score × clock = game script; sacks, scrambles, attempts,
runs) → players (passer, target, catch, carrier, TD scorer, interceptions) → points (TD + XP / two-point, FG,
defensive TD, safety) → next start (kickoff table, or mirrored end spot + empirical offset). Halves, 2025 regular-season
overtime (10 minutes, both teams possess, then sudden death, ties possible), postseason overtime without ties.

- **Fit** (`scripts/research/nfl/extract_pbp_drives.py` → `fit-drive-sim-v2.mjs`): nflverse play-by-play (local,
  git-ignored) reduced to a drive table (66,953 drives 2015–2025) and team box scores (6,056 team-games; quarters
  reconcile to finals on all of them); committed parameter receipts record the training window and source sha256s.
- **Team strength:** one tilt θ per offense on the result table, solved so simulated MEAN points equal the published
  margin and totals heads' implied team means. V2 adds the coherent path, not a second rating.
- **Players:** role shares (`role-shares-v1/current.json`) with an explicit OTHER bucket; availability = the injuries
  contract (`isBlockingStatus`) + active roster; a blocked player's share moves pro rata to available named
  teammates; one starting QB (the board's published passer). TD scorers are opportunity-based (receiving TD by target
  share, rushing TD by carry share), the structure of the published ATD model.
- **Not modelled (stated):** downs/distance, penalties, timeouts, kick returns as events, the kicker as a player,
  weather, goal-line role differences. Player yards inside a drive are the drive's net yards split over its plays in
  proportion to sampled per-player gains.
- **Market:** never read (a source scan with a mutation probe pins it).
- **Determinism:** per-run RNG (`splitmix(baseSeed, runIndex)` → mulberry32); same inputs → identical batches.
- **Performance:** 10,000 coherent games with full player allocation ≈ 1.2 s.

## 4. Coherence contract (C4 / E1) — checked on every run

points = 6·TD + XP + 2·two-point + 3·FG + 2·safety = Σ quarters = the run's score · completions ≤ attempts ·
interceptions ≤ incompletions · Σ targets = attempts · Σ receptions = completions · Σ receiving yards = passing yards
= Σ passer yards · Σ receiving TDs = passing TDs = Σ passer TDs (one TD, credited to both) · Σ carries / rushing yards
/ rushing TDs = team · receptions ≤ targets · receiving TDs ≤ receptions · no negative counts · OT only from a
regulation tie · a tie only after OT · the first-TD scorer scored in that run. ATD, 2+ TD, first TD, quarters and
halves are counts over the same runs. Mutation probes (`sim-v2.test.mjs`) break each invariant and assert it is caught.

## 5. Convergence (D3)

Protocol A, five fixed games: |P(home) − P₂₀ₖ(home)| ≤ 0.022 at 1k, ≤ 0.0094 at 5k, ≤ 0.005 at 10k; OT probability
within 0.0025 at 10k. **10,000 runs** is the receipt default (stable to ~0.5 pp at ~1.2 s per game).

## 6. Validation (E2–E4)

Protocols fixed before running (`scripts/research/nfl/validate-drive-sim-v2.mjs`). V1 and V2 get IDENTICAL walk-forward
anchors, so the comparison isolates what the coherent game path adds or costs.

**Protocol A (primary): test 2019–2021 REG+POST (821 games), drive tables fit 2015–2018, anchors inside both heads'
held-out replays — no leakage.** `data/internal/research/nfl/sim-v2/validation-A.json`

| Winner (818 decisive) | Brier | Log loss |
|---|---|---|
| V1 (published MOV-Elo win head) | **0.2217** | **0.6358** |
| V2 (drive sim) | 0.2273 | 0.6468 |
| Market (no-vig close, benchmark) | 0.2113 | 0.6101 |
| Base rate (home 57.3%) | 0.2534 | 0.7000 |

| Scores | Team-score MAE | Margin MAE | Total MAE | Team cov80 | Margin cov80 | Total cov80 | Margin CRPS | Total CRPS |
|---|---|---|---|---|---|---|---|---|
| V1 | 7.748 | 10.698 | 10.943 | 0.785 | 0.778 | 0.783 | 7.667 | 7.709 |
| V2 | 7.753 | 10.685 | 10.915 | 0.833 | 0.826 | 0.789 | 7.678 | 7.706 |

- **Periods (V2 only — V1 has none):** home-leads-at-half Brier 0.2366 vs coin 0.25 (n 767). Quarter mean points
  sim 10.2 / 13.8 / 10.2 / 12.5 vs actual 9.2 / 14.5 / 9.7 / 13.5 — end-of-half scoring under-modelled.
- **Frequencies:** OT 3.2% vs 5.2%; tie 0.37% vs 0.37%; |margin| = 3: 7.8% vs 13.4%; = 7: 6.5% vs 8.8%; = 6: 4.8% vs
  6.9% — key numbers under-weighted (late-game decision logic is not modelled).
- **Distribution sanity (sim vs actual per team-game):** pass att 34.4/34.7, completions 22.0/22.5, rush att 25.8/25.8,
  plays 63.0/63.7, drives 11.2/10.9, pass TD 1.62/1.60, rush TD 0.85/0.95, INT 0.77/0.79, fumbles lost 0.48/0.47,
  FG 1.64/1.59, sacks 2.11/2.34 — but **passing yards 223 vs 250 and rushing yards 133 vs 116**: the yardage split leans
  to the run.
- **Correlations (team-level, sim / actual):** pass att ↔ own margin −0.23 / −0.28; rush att ↔ margin +0.53 / +0.51;
  pass TD ↔ own points +0.71 / +0.65; plays ↔ game total +0.22 / +0.18; own ↔ opponent points −0.14 / −0.06 (too
  negative). Every sign matches; correlation is an output of shared game state, never a fitted target.
- **Player families:** coherent by construction; **NOT VALIDATED** — no historical per-game role-share snapshots exist
  to replay player inputs without hindsight. No V2 player number may be published until a forward shadow ledger
  (frozen pregame V2 receipts graded after the game) clears the family bars.

### 6b. Protocol B (secondary — anchors in-sample for the heads' dev fits; 2024/25 kickoff rules differ from the 2022 table)

Test 2023–2025 (855 games), drive tables fit 2015–2022. `validation-B.json`. Same picture as A:

| | Winner Brier | Log loss | Team MAE | Margin MAE | Total MAE | Margin cov80 | Total CRPS |
|---|---|---|---|---|---|---|---|
| V1 | **0.2216** | **0.6343** | 7.449 | 10.337 | 10.377 | 0.784 | 7.416 |
| V2 | 0.2253 | 0.6419 | 7.456 | 10.349 | 10.367 | 0.820 | 7.412 |
| Market | 0.2102 | 0.6077 | | | | | |

Coherence 0 / 1,710,000 runs · half-leader Brier 0.2349 (coin 0.25) · OT 3.2% vs 5.4% · |margin| = 3: 8.0% vs 14.9% ·
passing yards 216 vs 232, rushing 128 vs 118. No result here was used to change the engine.

## 7. Promotion (E5)

SHADOW → EXPERIMENTAL → PUBLIC are separate states. Public canonical replacement requires: coherence contract passes
(✅ 0 failures), no-leakage validation passes **without regression beyond accepted bars** (❌ winner Brier +0.0056 vs V1;
key-number / OT / yardage-split biases), material output provenance clear (✅), founder/model gate (not requested).

**Path to EXPERIMENTAL (proposed, founder/model gate):**
1. v2.1 fixes fitted on the TRAINING window only — yardage split (completion weight so the pass share of gross gains
   matches training), late-game decision logic (key numbers, OT rate), end-of-half drive results — then re-validated
   on a season set not used to choose them.
2. Winner: publish V1's win head unchanged; V2 supplies paths, periods and player distributions conditional on it
   (or anchor V2's margin so its sampled win probability matches the win head — a methodology choice for the gate).
3. Forward shadow ledger: V2 receipts written pregame every NFL week (this script, write-once) and graded into the
   Forecast Ledger as `SHADOW` (never public history) until each player family clears its bar.

## 7b. Simulation Center V2 (Phase F) — internal presentation

`/preview/simulation-v2/` (internal: `guardInternalRoute()` + `/preview` pruned from the export; run with
`NEXT_PUBLIC_INTERNAL_ROUTES=1 npx next dev`) renders every shadow receipt: win / tie / OT probabilities, median scores
and 80% ranges, margin and total histograms (median bucket highlighted), Q1–Q4 / H1 / H2 from the same game paths, the
team box, per-player medians (80% range) with anytime / 2+ TD counted over the same runs, the first-TD distribution, and
the REPRESENTATIVE SIMULATED GAMES (median-like, high, low, upset, overtime) with their drive logs — each labelled an
illustration, not the forecast. No market number appears (the receipt carries none). It becomes a public game-report
section only after the §7 promotion gate; until then the public NFL label stays.

## 8. Migration plan — other sports (common receipt + sport adapter)

| Sport | V2 unit of simulation | Current engine | Gap to V2 |
|---|---|---|---|
| MLB | plate appearance / inning | `lib/mlb/full-game/` already simulates PA-level complete games (10k), box scores from the same runs | closest to V2 already — adapt its artifact to `simulation-receipt@2` (period = inning), add the per-run coherence contract and representative runs |
| NBA | possession | v0 / v0.1 Elo + simulations (SHADOW, private) | possession engine (pace × efficiency × player usage), quarter structure, overtime; G3 model-version decision first |
| Soccer (EPL, Ligue 1) | chance / goal / card / substitution timeline | exact Poisson matrix (no run count) | minute-level chance timeline from team λ; players from FPL availability + ESPN participation; keep the exact matrix as the 1X2 / totals control |
| UFC | round / exchange / finish hazard | `ufc-fight-model` heads (winner, method, round) | per-round finish hazard by method, coherent winner/method/round per run; fix the event-id mismatch before any product use |

A sport stays on its current engine — and its pages keep saying "projection" where that is the truth — until its V2
adapter passes the same coherence + no-leakage validation contract.
