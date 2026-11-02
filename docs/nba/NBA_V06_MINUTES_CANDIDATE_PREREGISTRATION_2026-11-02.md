# NBA v0.6 minutes candidate: preregistration

**Status: UNARMED CANDIDATE, drafted 2026-11-02.** This changes no official forecast, lane, receipt, ledger, workflow, public reader or accessor. No production path imports it, and a test proves that. It is not a family in `experimental-forecast.mjs`. No constant here is approved.

**Data class:** PRIVATE_RESEARCH. No sportsbook price or line appears here.

**Basis:** `docs/nba/NBA_MINUTES_ROOT_CAUSE_AUDIT_2026-11-02.md`, sections 1, 6 and 9.

This document is committed before the v0.6 replay joins any outcome. The commit that first adds it is the freeze. Any later change to a rule, a constant or a bar needs an entry in section 9, and a change to a rule or a constant is a new candidate version.

## 1. What this candidate can and cannot show

**The games of 2026-10-20 to 2026-11-01 are seen data.** The audit read them before v0.6 existed, and the audit's findings shaped every rule below. A replay on those games is **not forward evidence**, whatever it shows. It can reject the candidate. It cannot validate it.

**The true forward window is slates dated 2026-11-03 and later.** Only those games can be forward evidence.

**The 2026-11-02 slate is in neither set.** It is shown side by side only and is never scored in this protocol.

## 2. The prediction rules

Code: `app/src/lib/sports/nba/minutes-model-v06.mjs` and `game-sim-v06.mjs`. Built on `minutes-model-v03.mjs`, `game-sim-v03.mjs` and PR 1281's `eligibility-gate-v05.mjs`, all three unedited and sha-pinned by a test.

Each team's pool comes from v0.3's roster gate. For each rostered player, in order:

1. **As-of inputs.** A box score counts only if it tipped before the forecast instant and was captured at or before it. A box score with no capture stamp does not count. An injury entry stated after the instant does not count. A feed or roster stamped after the instant is refused.
2. **Out.** Out in the injury feed means removed, as in v0.3.
3. **State.** The v0.5 rule classifies the player from his current-season record with this team.
4. **Play probability.** q = v0.3 play rate × the v0.5 multiplier for that state. If the player is listed Day-To-Day and his state is `LAST_PLAYED` or `NONE`, q is also multiplied by `DAY_TO_DAY_MULTIPLIER`. States with missed-game evidence do not take it, because the missed game and the listing are largely the same evidence.
5. **Exclusion.** A player in a state whose 2025-26 play rate is under `EXCLUDE_BELOW_PLAY_RATE` gets no minutes and is marked `EXCLUDED_NOT_PLAYING` with the state as reason. Those states are `NO_APPEARANCE` and `MISSED_2PLUS_OTHER`. His q is kept so participation can still be scored.
6. **Role minutes.** Current means this season's appearances for this team. Carried means last season's regular-season appearances on any team, plus this season's for other teams. The estimate is (w·Σ carried + Σ current) / (w·n carried + n current), with w = min(1, k / n carried).
   - k = `PRIOR_GAMES`, or `TRANSFER_PRIOR_GAMES` when the most recent carried appearance was for another team.
   - With no game for this team yet, the carried role stands alone.
   - Preseason, play-in and playoff games never enter.
   - Rates, starter rate and the base play rate stay on v0.3's estimate. A stat difference from v0.3 therefore comes from minutes.
7. **Team normalisation.** With the pool's play-rate-weighted sum S = Σ q·m:
   - **S > 240:** m′ = min(m, f·m^1.25), with f solving Σ q·m′ = 240. Nobody is raised, and the bench gives up the larger share.
   - **S ≤ 240:** m′ = min(ceiling, f·m), with ceiling = max(m, min(`UNDERFULL_CEILING_MINUTES`, m + `UNDERFULL_CEILING_SDS` × own SD)). Nobody is lowered.
   - The two branches agree at S = 240.
   - Minutes a pool cannot place are reported as `unallocatedMinutes`. They are never put on a player.
8. **Reconciliation.** Every team satisfies Σ q·m′ + unallocatedMinutes = 240.
9. **No fabrication.** A player with no regular-season box score in S or S−1 has null minutes and a reason code: `ROOKIE_NO_REGULAR_SEASON_BOX`, `VETERAN_NO_BOX_IN_LAST_TWO_SEASONS` or `NO_COMMITTED_EVIDENCE`. Preseason minutes are not evidence. The first regular-season game is. Draft position is not committed, and PR 1180 section 12 found raw preseason minutes over-project rookies by 8 to 9.5, so the rookie data decision stays with the founder.
10. **Coverage.** Each team's output lists the starters and top bench player of its last game before the instant, each with a status: `PROJECTED`, `OUT`, `EXCLUDED`, `NO_PROJECTION` or `NOT_ON_ROSTER_CAPTURE`.

Player draws use v0.3's per-draw model and seed. No team score is produced.

## 3. Constants: all PROPOSED_NOT_APPROVED

| Constant | Value | Source | Recompute | Weakness |
|---|---:|---|---|---|
| `PRIOR_GAMES` | 3 | Audit section 6, 2024-25 and 2025-26, first 20 team games. Reuses the frozen `MIN_GAMES_FOR_RATES` | Audit script | The approved v0.3 value is 10. A value of 2 or 1 scored slightly lower; 3 adds no new number |
| `TRANSFER_PRIOR_GAMES` | 1 | Lowest pooled MAE of 0, 1, 2, 3, 5, 10, 20 on changed-team rows, same two seasons, n 2,334 | `fitTransferPriorGames`, pinned | Pooled MAE 4.955 at 1, 4.965 at 0, 5.154 at 3. In 2025-26 alone, 0 was lower than 1 |
| `EXCLUDE_BELOW_PLAY_RATE` | 0.25 | Judgement inside a measured gap. 2025-26 cells run 0.021, 0.135, then 0.369. In the first 20 team games of 2024-25 and 2025-26 the same cells are at most 0.176, then at least 0.336 | Same two states from 0.14 to 0.36, pinned | The value itself is a judgement. `NO_APPEARANCE` has the weakness PR 1281 section 5 records |
| `DAY_TO_DAY_MULTIPLIER` | 0.527 | Frozen v0.3 receipts, slates 10-22 to 10-28, states `LAST_PLAYED` and `NONE`: 20 of 43 Day-To-Day rows played (0.465), against 1,033 of 1,171 unlisted (0.882) | `fitDayToDayMultiplier`, pinned | **In-sample.** No injury history predates 2026-10, so no prior season can supply it. n is 43. See section 8 |
| `UNDERFULL_CEILING_SDS` | 1 | Judgement. 84.8% of 2025-26 appearances are at or below own mean + 1 SD | `shareUnderMeanPlusSd`, pinned | It is a description, not a fit |
| `UNDERFULL_CEILING_MINUTES` | 41 | p99 of 2025-26 appearance minutes, n 26,565 | `minutesQuantile`, pinned | 2024-25 gives 42 |

**Reused, and not approved for this family either:** rate prior 10 and minutes power 1.25, whose approval on 2026-10-22 covers v0.3 alone; and PR 1281's five multipliers (0.025, 0.574, 0.578, 0.429, 0.157), which await the founder. The audit found every gated v0.5 cell ran under the observed rate on its 20 forward games. I reuse them unchanged rather than refit after that look.

## 4. Evaluation games

**Seen-data replay.** Inputs: each frozen v0.1 receipt's roster and injury blobs, located by sha256, with box scores folded at that instant. The script refuses unless every v0.1 and v0.3 side re-derives its frozen minutes.

- **Primary set:** games on slates 10-22 to 10-31 with a frozen v0.3 receipt, a committed box score and a GRADED v0.1 ledger row. The audit counted 74.
- **Wider set:** the same with no v0.3 condition, for v0.6 against v0.1 only. The audit counted 88.
- The 4 games of 11-01 have no committed box score at this head and are not added later.

**Forward window.** Regular-season games on slates dated 2026-11-03 and later. See section 7.

## 5. Metrics

All intervals are 95% percentile bootstraps resampling games, 2,000 draws. Below 10 games the result is labelled FEW_CLUSTERS and is not quoted. Error is forecast − actual. Lower MAE and lower Brier are better. A difference is called established only if its interval excludes 0, and on these games it is still replay evidence, never forward validation.

| Metric | Definition |
|---|---|
| Minutes MAE and bias | Played rows that v0.1, v0.3, v0.5 and v0.6 all project. v0.1 and v0.3 use frozen values |
| Unconditional minutes error | Per team-game, Σ abs(q·m − actual) over the pool and the box. v0.1 uses q = 1. No projection counts as 0. Excluded players cannot flatter this one |
| Participation Brier | Rows in the frozen v0.3 pool. v0.1 uses 1 where projected and 0 otherwise. Excluded rows keep their q |
| Extreme rows | Rows with abs(err) ≥ 15 per 100, and projected rows ≥ 41 with how many reached 41 |
| Coverage | Starters, sixth men and all who played, by family. Reason for every played row v0.6 did not project |
| Dependent stats | Pts, reb and ast median MAE, on rows with medians from v0.1, v0.3 and v0.6 |

Matched-row MAE alone flatters a model that drops rows, so it is always read beside the unconditional error and coverage.

**Sensitivities, fixed now:** `DAY_TO_DAY_MULTIPLIER` = 1; no exclusion; `TRANSFER_PRIOR_GAMES` = 3. **Sub-window, fixed now:** primary-set games after 10-28, which the Day-To-Day fit did not touch, though the audit did. v0.5 is shown for context only.

## 6. Replay bars

All on the primary set, all against frozen v0.3. Meeting them permits a founder review of shadow arming. **It arms nothing, and it is not forward evidence.** Missing any of R1 to R8 means the candidate does not go to shadow as written.

| Bar | Rule |
|---|---|
| R1 | Minutes ΔMAE v0.6 − v0.3: interval entirely below 0 |
| R2 | Unconditional minutes Δ v0.6 − v0.3: interval entirely below 0 |
| R3 | abs(minutes bias) ≤ 1.0, with an interval covering 0 |
| R4 | Participation Brier Δ v0.6 − v0.3: interval entirely below 0 |
| R5 | Projected rows ≥ 41: no more than v0.3 |
| R6 | Starters and sixth men projected: no fewer than v0.3 |
| R7 | Pts, reb and ast not worse than v0.3: each interval's upper end ≤ +0.05 |
| R8 | Team minutes reconcile on every side, within 0.02 |

## 7. Forward protocol

- **Code freeze:** the commit that first adds this document, plus any amendment logged in section 9.
- **Evidence class:** with v0.6 unarmed, a forward look is a **code-frozen replay with no receipt**. It is out-of-sample for the code, and weaker than a frozen receipt. Only arming produces receipts, and arming is a founder decision.
- **Comparison:** same freeze inputs as v0.1 and v0.3, same metrics as section 5.
- **First look:** not before 30 forward games, and no direction quoted below 10.
- **Bars, restated from PR 1281 section 9 and unchanged:**
  - (a) Sample: 1,500 matched player-games with expected minutes ≥ 20 for pts, reb and ast; 800 for 3PM. Below that, the market is HOLD.
  - (b) Minutes MAE ≤ 6.0; conditional MAE better than the season-mean-rate baseline by ≥ 5%; p10–p90 coverage in [0.76, 0.84], 3PM [0.74, 0.86]; ECE ≤ 0.05.
  - (c) Against v0.1: pts ΔMAE interval entirely below 0; reb, ast and 3PM interval upper end ≤ +0.05.
  - (d) abs(minutes bias) ≤ 1.0 and abs(pts bias) ≤ 0.5, each interval covering 0.
  - (e) Above-share in [0.45, 0.55] for each family.
  - (f) A founder-approved entry in the PR 1154 promotion record.
  - (g) Any line comparison uses official lane rows and one declared line rule. Closeness to a sportsbook line is never evidence of accuracy.
- **Unchanged:** v0.1 stays official for players and Elo for the side. Team scores stay withheld. Frozen receipts are never regenerated. No what-if feeds picks.

## 8. Disclosure: what was seen before this commit

- The audit's numbers, including its replay of a 3-game prior with the v0.5 gate, which had lower minutes MAE than v0.3 on the 74 games. The prior and the gate were chosen knowing that.
- **Outcomes of slates 10-22 to 10-28, for one number only:** the Day-To-Day play rates in section 3. That constant is in-sample on 54 of the 74 primary games. The sub-window in section 5 and the sensitivity with the multiplier at 1 exist for this reason.
- 2024-25 and 2025-26 box scores, for `TRANSFER_PRIOR_GAMES`, the ceilings and the check that the exclusion gap holds early in a season.
- v0.6's projections on every slate with **no outcome joined** (`--projections-only`), to prove fidelity and reconciliation. Result: v0.1 214 of 214 sides and v0.3 186 of 186 sides re-derive, and every side reconciles.
- One injury feed was stamped 1 second after its freeze, on 10-26. Its receipt hashed it, so it is that freeze's input. The replay counts this and does not refuse it. The candidate's own gate refuses a later feed everywhere else.
- v0.6 has not been scored on any 2026-27 game as of this commit.

## 9. Amendments

None.
