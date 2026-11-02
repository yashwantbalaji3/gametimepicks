# NBA v0.7 minutes candidate: preregistration

**Status: UNARMED CANDIDATE, drafted 2026-11-02.** This changes no official forecast, lane, receipt, ledger, workflow, public reader or accessor. No production path imports it, and a test proves that. It is not a family in `experimental-forecast.mjs`. No constant here is approved.

**Data class:** PRIVATE_RESEARCH. No sportsbook price or line appears here.

**Basis:** `NBA_MINUTES_ROOT_CAUSE_AUDIT_2026-11-02.md`, `NBA_V06_MINUTES_CANDIDATE_PREREGISTRATION_2026-11-02.md` and `NBA_V06_SEEN_DATA_REPLAY_2026-11-02.md`. The v0.6 files and documents are preserved evidence and stay byte-identical; a test pins them.

**This document is committed and pushed before v0.7 joins any outcome.** The commit that first adds it is the freeze. Any later change to a rule, a constant or a bar needs an entry in section 10, and a change to a rule or a constant is a new candidate version.

## 1. The anti-tuning rule

- **Games from 2026-10-20 to 2026-11-02 are seen.** No v0.7 rule or constant was fitted to them.
- **Design inputs:** the documented lessons, and the completed seasons 2024-25 and 2025-26.
- **In code:** `minutes-model-v07-fit.mjs` throws on any season outside 2023-24 to 2025-26, and the committed corpus it reads holds no 2026-27 game. Both are tested.
- **No variant selection.** `buildV07Context` takes no overrides and this protocol has no sensitivities, so no variant can be run from the module.
- **The v0.6 replay's unexecuted pairing** (no Day-To-Day multiplier, no exclusion) was not run, here or as a selection step. See section 9.

**After this commit, one seen-data replay is allowed, as a regression check only, labelled not forward evidence.** See section 7.

## 2. What the completed seasons showed

All numbers are MEASURED on corpus box scores, with no 2026-27 game. Reproduce with:

```
cd app && npx tsx scripts/nba/research/study-nba-v07-completed-seasons.mjs
```

**A multiplier double-counts coach's decisions.** The base play rate already holds coach's DNPs, so multiplying it by a state ratio discounts them twice. Fit on one season, scored on the other's first 20 team games:

| State | Season scored | n | Observed | Mean q, multiplier | Mean q, direct rate |
|---|---|---:|---:|---:|---:|
| `MISSED_2PLUS_COACH` | 2025-26 | 506 | 0.407 | 0.214 | 0.338 |
| `MISSED_2PLUS_COACH` | 2024-25 | 633 | 0.322 | 0.209 | 0.343 |
| `MISSED_1_COACH` | 2025-26 | 475 | 0.469 | 0.335 | 0.447 |
| `MISSED_1_COACH` | 2024-25 | 512 | 0.479 | 0.354 | 0.466 |

Brier falls from 0.1188 to 0.1170 and from 0.1155 to 0.1145, lower being better. **INFERRED:** this explains at least part of the audit's note that every gated v0.5 cell ran under the observed rate. A role tier on the states and a first-20-games fit added nothing in scratch runs on the same two seasons, which are not in the study script, so neither is used.

**Real lift in an under-full pool is not proportional, and it is about zero at the top.** Slope of (actual − role) on (f − 1)·role, where 1 means a uniform factor is right. The Out stand-in uses hindsight:

| Role band | 2024-25 slope (n) | 2025-26 slope (n) |
|---|---:|---:|
| 30 or more | 0.002 (3,939) | −0.058 (3,274) |
| 24 to 30 | 0.148 (3,664) | 0.152 (4,093) |
| 12 to 24 | 0.521 (7,115) | 0.489 (7,916) |
| Under 12 | 1.243 (3,257) | 1.311 (2,925) |

**The v0.6-style lift reproduces v0.6's failure on completed seasons.** Fit on one season, scored on the other's first 20 team games. Each cell is MAE / bias on played rows:

| Under-full rule | Scored season | All rows | Role ≥ 30 | Role < 30 | Unallocated per side |
|---|---|---:|---:|---:|---:|
| Own mean + 1 SD, 41 ceiling | 2025-26 | 4.983 / +1.26 | 4.574 / +2.59 | 5.101 / +0.87 | 1.96 |
| No lift | 2025-26 | 4.838 / −0.65 | 3.869 / +0.20 | 5.116 / −0.90 | 20.64 |
| Proportional, under the top line | 2025-26 | 4.735 / −0.06 | 3.869 / +0.20 | 4.983 / −0.13 | 14.98 |
| **Additive, under the top line** | 2025-26 | **4.722 / +0.08** | 3.869 / +0.20 | **4.967 / +0.05** | 13.88 |
| Own mean + 1 SD, 41 ceiling | 2024-25 | 4.922 / +0.92 | 4.441 / +2.20 | 5.079 / +0.51 | 2.43 |
| No lift | 2024-25 | 4.821 / −0.85 | 3.862 / −0.08 | 5.134 / −1.10 | 19.59 |
| Proportional, under the top line | 2024-25 | 4.722 / −0.35 | 3.862 / −0.08 | 5.002 / −0.44 | 14.90 |
| **Additive, under the top line** | 2024-25 | **4.706 / −0.18** | 3.862 / −0.08 | **4.982 / −0.21** | 13.42 |

These pools know every Out in hindsight, so they are design evidence, not a forecast of forward error. Actual starters still run about −1.1 to −1.2 and bench about +0.75 to +1.1 under the additive rule.

## 3. The prediction rules

Code: `app/src/lib/sports/nba/minutes-model-v07.mjs`, `minutes-model-v07-state.mjs` and `game-sim-v07.mjs`. Built on `minutes-model-v03.mjs` and `game-sim-v03.mjs`, unedited and sha-pinned. The v0.6 modules are not imported.

Each team's pool comes from v0.3's roster gate. For each rostered player, in order:

1. **As-of inputs.** A box score counts only if it tipped before the forecast instant and was captured at or before it. A box score with no capture stamp does not count. An injury entry stated after the instant does not count. A feed or roster stamped after the instant is refused. Preseason, play-in and playoff games never enter.
2. **Removal needs positive evidence.** Out in the as-of injury feed removes a player, with `removalEvidence: OUT_IN_FEED`. A box-score absence never removes anyone. There is no exclusion state.
3. **State.** The v0.5 state rule, restated in `minutes-model-v07-state.mjs` and pinned to the v0.5 table's counts: `NONE`, `NO_APPEARANCE`, `LAST_PLAYED`, `MISSED_1_COACH`, `MISSED_1_OTHER`, `MISSED_2PLUS_COACH`, `MISSED_2PLUS_OTHER`.
4. **Play probability.** Base is v0.3's play rate.
   - `LAST_PLAYED` and `NONE`: q = base.
   - Any other state: q = min(base, `PLAY_RATE_BY_STATE[state]`).
5. **Day-To-Day.** There is no multiplier. A listed player takes the rate of `DAY_TO_DAY_STATE`, or his own state's rate if that is higher, capped by base. So a listed long absentee rises to that rate, because the listing is positive evidence of a short absence, and a listed `LAST_PLAYED` player falls to it. The listing and the state never stack.
6. **Role minutes.** Current means this season's appearances for this team. Carried means last season's regular-season appearances on any team, plus this season's for other teams. The estimate is (w·Σ carried + Σ current) / (w·n carried + n current), with w = min(1, k / n carried).
   - k = `PRIOR_GAMES`, or `TRANSFER_PRIOR_GAMES` when the most recent carried appearance was for another team.
   - With no game for this team yet, the carried role stands alone.
   - Rates, starter rate and base stay on v0.3's estimate, so a stat difference from v0.3 comes from minutes.
7. **Team normalisation.** With S = Σ q·m over the pool:
   - **S > 240:** m′ = min(m, g·m^1.25), with g solving Σ q·m′ = 240. Nobody is raised, and the bench gives up the larger share.
   - **S ≤ 240:** with f = 240 / S, a player with m ≥ `TOP_ROTATION_MINUTES` keeps m exactly. Below that line, m′ = min(`TOP_ROTATION_MINUTES`, m + `UNDER_FULL_LIFT_MINUTES` × (f − 1)). The lift is additive, so a short pool is never scaled.
   - If that lift alone would overfill the team, it is scaled down to fit. That takes a pool far too small to be a real side.
8. **Unallocated minutes.** Every team satisfies Σ q·m′ + unallocatedMinutes = 240, and `unallocatedMinutes` ≥ 0. They are never put on a player. Each side reports S, lift placed, cut, unallocated, and context codes: `ROSTERED_PLAYERS_WITH_NO_PROJECTION`, `PLAYERS_OUT_IN_FEED`, `PROJECTED_PLAYERS_WITH_PLAY_PROBABILITY_UNDER_HALF`.
9. **No fabrication.** A player with no regular-season box score in S or S−1 has null minutes, null q and a reason code: `ROOKIE_NO_REGULAR_SEASON_BOX`, `VETERAN_NO_BOX_IN_LAST_TWO_SEASONS` or `NO_COMMITTED_EVIDENCE`. Preseason minutes are not evidence. His first regular-season game is. The rookie data decision stays with the founder.
10. **Coverage report.** `report-nba-v07-coverage.mjs` emits, per slate and team, the starters and sixth man of the team's last game before the instant (the audit's last-lineup proxy, because no depth chart is committed), plus other rotation players. Each row gets a status, and every status other than `PROJECTED` has a reason code: `OUT_IN_FEED`, `NOT_ON_ROSTER_CAPTURE`, or a code from rule 9. A team with no lineup carries `TEAM_NO_GAME_BEFORE_INSTANT` or `REFUSED:<reason>`. The report throws if a missing row has no reason.

Player draws use v0.3's per-draw model and seed. No team score is produced.

### How each lesson is met

| Lesson | Rule |
|---|---|
| Current-season box scores, no leakage | 1, 6 |
| Rotation and sixth-man coverage | 2, 10 |
| Normalisation must not push the top up or scale short pools | 7 |
| Returning starters must not be excluded from absence alone | 2, 4, 5 |
| The exclusion rule added almost nothing | 2 removes it |
| Day-To-Day handling and fit-window limits | 5, section 1 |
| Transparent unallocated minutes | 8 |
| Never fabricate rookies | 9 |

## 4. Constants: all PROPOSED_NOT_APPROVED

| Constant | Value | Source | Recompute | Weakness |
|---|---:|---|---|---|
| `PRIOR_GAMES` | 3 | Audit section 6, 2024-25 and 2025-26, first 20 team games. Reuses frozen `MIN_GAMES_FOR_RATES`. Carried from v0.6 | Audit script | The approved v0.3 value is 10 |
| `TRANSFER_PRIOR_GAMES` | 1 | Lowest pooled MAE on changed-team rows, same two seasons, n 2,334. Carried from v0.6 | Pinned in the v0.6 test | In 2025-26 alone, 0 was lower than 1 |
| `PLAY_RATE_BY_STATE` | `NO_APPEARANCE` 0.029, `MISSED_1_COACH` 0.484, `MISSED_1_OTHER` 0.489, `MISSED_2PLUS_COACH` 0.367, `MISSED_2PLUS_OTHER` 0.136 | 2024-25 and 2025-26 regular seasons pooled, rows with a role. n 4,358, 3,784, 3,650, 5,047 and 12,739 | `fitStateTable`, pinned | "On the team" is a labels-side stand-in, so a player who never appears is not in the cells. One rate for all roles. Season-long, not early-season |
| `DAY_TO_DAY_STATE` | `MISSED_1_OTHER` | **Named judgement.** No completed season has an injury feed. A listing borrows the nearest box-score state, a player who just missed one game for a non-coach reason | None possible | A proxy, never measured against a listing. Day-To-Day lumps every grade of doubt |
| `TOP_ROTATION_MINUTES` | 30 | Slope by role band: −0.06 to 0.00 at 30 or more against about 0.15 at 24 to 30, both seasons | `proportionalLiftSlope`, pinned | The line is a judgement within a measured step |
| `UNDER_FULL_LIFT_MINUTES` | 9 | 2024-25 and 2025-26 pooled, 9.03 per unit of (f − 1), n 28,970, rounded. By season 8.96 and 9.07 | `fitAdditiveLift`, pinned | The Out stand-in uses hindsight, so S there is cleaner than a real freeze's S |

**Reused, and not approved for this family either:** rate prior 10 and minutes power 1.25, whose approval on 2026-10-22 covers v0.3 alone.

**Dropped from v0.6:** `EXCLUDE_BELOW_PLAY_RATE`, `DAY_TO_DAY_MULTIPLIER`, `UNDERFULL_CEILING_SDS`, `UNDERFULL_CEILING_MINUTES`, and the five v0.5 multipliers.

## 5. Evaluation window

- **Slates dated 2026-11-03 and later**, regular season, code frozen at this commit.
- **First review not before 30 games.** The replay script reports the count and scores nothing below 30. No direction is quoted below 10 clusters.
- **The 2026-11-02 slate is seen and is in neither the regression set nor the forward window.**
- **Evidence class:** with v0.7 unarmed, a forward look is a **code-frozen replay with no receipt**. It is out-of-sample for the code and weaker than a frozen receipt. Only arming produces receipts, and arming is a founder decision.
- **Inputs:** each frozen v0.1 receipt's roster and injury blobs, located by sha256, with box scores folded at that instant. The script refuses unless every v0.1 and v0.3 side re-derives its frozen minutes.
- **Games:** a frozen v0.3 receipt, a committed box score and a GRADED v0.1 ledger row.

```
cd app && npx tsx scripts/nba/research/replay-nba-v07-candidate.mjs --mode forward --out-dir <dir outside the repo> --bootstrap 2000 --simulations 10000
```

## 6. Metrics and bars

All intervals are 95% percentile bootstraps resampling games, 2,000 draws. Error is forecast − actual. Lower MAE and lower Brier are better. A difference is called established only if its interval excludes 0.

Matched rows are played rows that v0.1, v0.3 and v0.7 all project, so matched MAE is always read beside unconditional error and coverage. Stats compare frozen v0.1 and v0.3 medians with v0.7 simulated medians. "Large error" is abs(error) ≥ 15. Unconditional error is, per team-game, Σ abs(q·m − actual) over the pool and the box, with no projection counting as 0 and v0.1 using q = 1. Participation ECE uses 10 equal-width bins on rows in the frozen v0.3 pool. Sixth man is the top bench minutes of the game itself.

| Bar | Subject | Rule |
|---|---|---|
| B1 | Minutes | MAE ≤ 6.0, and ΔMAE v0.7 − v0.3 interval entirely below 0 |
| B2 | Unconditional minutes | Δ v0.7 − v0.3 interval entirely below 0 |
| B3 | Bias | abs(minutes bias) ≤ 1.0, with an interval covering 0 |
| B4 | Bias by population | Actual starters, actual bench and rows projected ≥ 34: each abs(bias) ≤ 2.0 |
| B5 | Starter coverage | No fewer actual starters projected than v0.3, and share ≥ 0.97 |
| B6 | Sixth-man coverage | No fewer actual sixth men projected than v0.3, and share ≥ 0.97 |
| B7 | Pts | Against v0.3: interval upper end ≤ +0.05. Against v0.1: interval entirely below 0 |
| B8 | Reb | Against v0.3 and v0.1: interval upper end ≤ +0.05 |
| B9 | Ast | Against v0.3 and v0.1: interval upper end ≤ +0.05 |
| B10 | Calibration | p10–p90 share in [0.76, 0.84] for each of minutes, pts, reb and ast; participation ECE ≤ 0.05; Brier Δ v0.7 − v0.3 interval upper end ≤ 0 |
| B11 | Large-error rate | Δ rows with large error per 100, v0.7 − v0.3, interval upper end ≤ +0.5; projected rows ≥ 41 no more than v0.3 |
| B12 | Integrity | Every side reconciles to 240 within 0.02; every played row with no projection has a reason code |

**No single metric can promote v0.7.** All twelve bars must be met at the same review. Missing any one means no promotion at that review. Meeting all twelve permits a founder review of shadow arming and **arms nothing**.

**Limits on what a pass means:**

- The bars are read once per review, at 30 games and then only at 60, 120 and each further doubling. A pass at one review does not carry to the next.
- Any market-facing claim still needs PR 1281's section 9 bars as restated in the v0.6 preregistration section 7: 1,500 matched rows at expected minutes ≥ 20, above-share in [0.45, 0.55], a founder-approved promotion record entry, and the rest. 3PM is not evaluated here and stays HOLD.
- v0.1 stays official for players and Elo for the side. Team scores stay withheld. Frozen receipts are never regenerated. No what-if feeds picks.

## 7. The one permitted seen-data replay

Mode `seen-regression`, slates 2026-10-22 to 2026-10-31, the same games as the v0.6 primary set.

- **Label on every output: SEEN-DATA REPLAY. REGRESSION CHECK ONLY. NOT FORWARD EVIDENCE.**
- It runs once, after this commit is pushed. It prints the same bars. Passing a bar there validates nothing.
- **A regression means any of:** a fidelity refusal, a B12 failure, or starters or sixth men projected below frozen v0.3. Other misses are reported and not called regressions.
- **It cannot change v0.7.** No rule, constant or bar moves because of it. A fix would be a new version under its own preregistration, frozen before it is scored.
- Comparison with v0.6 uses the published v0.6 replay numbers only. v0.6's code is not re-run.

## 8. Tests

`app/src/lib/sports/nba/minutes-model-v07.test.mjs` covers leakage on synthetic and committed data, reconciliation on every committed team, normalisation, positive-evidence removal, play probability, Day-To-Day, no fabrication, windows, the coverage report, determinism, draw equality with v0.3, the completed-seasons guard, the recompute of each data-sourced constant, the unarmed proof and the byte pins on v0.6 and v0.3.

## 9. Disclosure: what was seen before this commit

- **All three basis documents**, including v0.6's replay tables, its sensitivities, its Day-To-Day play rates (20 of 43, then 14 of 22) and the two named starters. Those are 2026-27 outcomes in documented form. Rules 2, 4, 5 and 7 were designed knowing them. That is why seen data cannot validate v0.7.
- **The pairing.** Rule 2 removes the exclusion, which is half of the unexecuted pairing, because the lesson says so. v0.7 differs from that pairing in play probability, Day-To-Day and normalisation. The pairing itself was not run.
- **Day-To-Day.** The proxy gives q ≈ 0.49, and v0.6's documented rate was 0.47 to 0.64. No 2026-27 number enters it, but the choice was made knowing them.
- **2024-25 and 2025-26 box scores**, for every result in section 2. The forms in section 2 were compared on those seasons, including the top line, so they are design evidence and not out-of-sample for the final choice.
- **v0.7's projections on every slate 10-20 to 11-02 with no outcome joined** (`--mode projections-only`). v0.1 214 of 214 and v0.3 186 of 186 sides re-derive. Every side reconciles at 240. 72 of 214 sides are under-full, unallocated mean 4.5 and max 40.18 per side, no row is at 41 or more, and the highest is 39.2.
- **The 2026-11-02 coverage report**, from frozen receipt inputs with no outcome joined. Starters 147 of 150 projected and 3 `OUT_IN_FEED`. Sixth men 30 of 30.
- One injury feed was stamped 1 second after its freeze, on 10-26. Its receipt hashed it, so it is that freeze's input. The replay counts it.
- **v0.7 has not been scored on any 2026-27 game as of this commit.**

## 10. Amendments

None.
