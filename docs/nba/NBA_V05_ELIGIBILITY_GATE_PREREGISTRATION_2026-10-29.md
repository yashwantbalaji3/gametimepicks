# NBA v0.5 eligibility-gate challenger — preregistration (DRAFT, NOT ARMED)

**Status.** Proposed 2026-10-29. A **forward-shadow candidate only**: it changes no official forecast, no published lane, no Theater, no social or product surface, and is not scheduled in any workflow. It is resolvable by name (`CANDIDATE_FAMILIES["v0.5"]`, `armed: false`), and the builder refuses `--write` for it. **Arming needs a founder decision** (approval of the constants in §5 and of this protocol), recorded in the V18 preregistration looks log, after which a reviewed change moves `v0.5` into `FAMILIES` and adds its nightly build and grade.

**Data class.** PRIVATE_RESEARCH. Aggregates only. No sportsbook price or line appears here.

**Evidence.**
- Investigation: `GameTimePicks_Launch_Program_2026-10-28/investigations/nba-minutes-defect.md` (founder program folder, not in the repo).
- Refreshed scripts and outputs (outside the repo): `/Users/yashwantbalaji/gtp-evidence/nba-minutes-1029/`.

---

## 1. What it fixes

v0.3 (the armed role-minutes challenger, §14 of `docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md`) keeps each team at 240 minutes **in expectation**: Σ playRate·minutes = 240. Its playRate comes from the role prior: appearances ÷ (appearances + coach's-decision DNPs), mostly from last season.

Over its forward games so far (§2), v0.3 still:
- puts about 32 playRate-weighted expected minutes per team-game (about 39 unweighted) on players who then do not play;
- projects the players who do play about 22 minutes per team-game short;
- carries a minutes location bias of about −1.8 per played row.

v0.5 is v0.3 plus one layer: a **pre-tip eligibility gate**. It lowers the play probability of players whose own current-season record with the team says they are unlikely to play. v0.3's engine then redistributes the freed expected minutes to the eligible rotation, unchanged.

## 2. Refreshed out-of-sample evidence (v0.1 vs v0.3; forward receipts)

These rows are published v0.1 lane rows, played, that v0.3 also froze at v0.1's cutoff. Bias is forecast − actual. 95% intervals are game-clustered percentile bootstraps.

**Sample:** 910 played rows from 54 final games (2026-10-22 … 10-28). The lane had 1,104 rows in these games: 115 DNP and 79 absent.

ΔMAE is v0.3 − v0.1. Negative favours v0.3.

| Family | v0.1 bias (CI) | v0.1 MAE | v0.3 bias (CI) | v0.3 MAE | ΔMAE v0.3 − v0.1 (CI) | Above-share v0.1 / v0.3 |
|---|---|---|---|---|---|---|
| Minutes (E − actual) | −1.57 (−2.44, −0.71) | 7.01 | −1.79 (−2.49, −1.12) | 5.76 | **−1.25 (−1.58, −0.96)** | — |
| Pts | −0.90 (−1.35, −0.46) | 5.20 | −0.59 (−0.99, −0.19) | 4.81 | **−0.39 (−0.57, −0.19)** | 0.524 / 0.502 |
| Reb | −0.56 (−0.78, −0.34) | 2.20 | −0.48 (−0.68, −0.30) | 2.00 | **−0.20 (−0.27, −0.12)** | 0.545 / 0.538 |
| Ast | −0.28 (−0.42, −0.13) | 1.53 | −0.18 (−0.30, −0.05) | 1.36 | **−0.17 (−0.22, −0.12)** | 0.509 / 0.480 |
| 3PM | −0.16 (−0.23, −0.09) | 0.94 | −0.12 (−0.18, −0.05) | 0.92 | −0.02 (−0.05, +0.01) | 0.438 / 0.415 |
| PRA | −1.43 (−2.12, −0.77) | 7.24 | −0.95 (−1.56, −0.40) | 6.35 | **−0.89 (−1.11, −0.63)** | 0.546 / 0.537 |

**Toward §6.** There are 554 played rows with v0.3 E ≥ 20 (524 with v0.1 E ≥ 20), against a minimum of 1,500. Every player market is **HOLD**.

Minutes MAE on E ≥ 20 rows is 5.49 for v0.3 and 6.59 for v0.1, against the bar of ≤ 6.0. This is context only.

**Pool split** (means per team-game, 108 team-games):

| | v0.1 | v0.3 |
|---|---|---|
| Expected minutes on players who then did not play | 42.0 (36.2, 48.2) | 39.5 (34.2, 44.9) unweighted; **31.8 (27.3, 36.6)** playRate-weighted |
| Played rows: expected vs actual | 198.0 vs 218.9 | 217.3 vs 239.0 |
| Actual minutes by players the model never projected | 23.1 | 3.1 |

## 3. Diagnosis: what separates non-players before tip

Every signal below is available at the freeze instant. They come from the receipt row (injury status, starterRate, playRate) or from the current season's regular-season box scores that tipped before the instant **and** were captured at or before it.

The analysis covers 1,567 v0.3-simulated rows in 54 final games (108 team-games). Of these, 389 did not play: 241 DNP and 148 absent from the box. The v0.3 pool mass on non-players is 31.8 per team-game.

"Mass" is playRate × E. Each signal is shown alone. The interval on the share is a game-clustered bootstrap.

| Pre-tip signal | Rows flagged | Share that did not play | Non-player mass caught per team-game (share, CI) | Player mass also hit per team-game |
|---|---|---|---|---|
| Last team game not played (DNP or absent) | 360 | 0.65 | 16.9 (0.53; 0.45–0.61) | 12.2 |
| No 2026-27 regular-season appearance yet (team has played) | 232 | 0.73 | 12.6 (0.40; 0.33–0.48) | 5.9 |
| v0.3 basis = role prior only | 257 | 0.68 | 13.0 (0.41; 0.34–0.49) | 9.9 |
| Depth rank > 10 by v0.3 role minutes | 487 | 0.51 | 10.9 (0.34; 0.29–0.40) | 15.1 |
| Non-play streak ≥ 2 | 172 | 0.76 | 9.4 (0.29; 0.22–0.37) | 3.2 |
| Last team game absent from the box | 137 | 0.81 | 8.3 (0.26; 0.21–0.33) | 4.2 |
| Last team game coach's DNP | 215 | 0.56 | 8.5 (0.27; 0.20–0.33) | 6.6 |
| Injury status Day-To-Day | 80 | 0.56 | 7.4 (0.23; 0.18–0.29) | 6.7 |
| v0.3 playRate < 0.7 | 287 | 0.59 | 6.3 (0.20; 0.16–0.24) | 5.6 |
| starterRate 0 and role < 15 min | 223 | 0.54 | 2.9 (0.09; 0.07–0.12) | 4.6 |

**Reading.**
- The current-season record with the team is the strongest separator.
  - Players who played the team's last game played 87% of the time.
  - Players who missed it played 35%; after an absence from the box, 19%.
- v0.3's playRate is miscalibrated at the bottom of the rotation. Depth ranks 14–16 played about 30–50% of the time, against a mean playRate of about 0.62–0.67.
- The Day-To-Day tag is informative (played 0.44), but no 2025-26 injury history exists to fit a constant from strictly prior data. v0.5 does **not** use it.
  - Inside the LAST_PLAYED state, Day-To-Day rows (n 41) played 0.46 and hold 3.9 min per team-game of non-player mass.
  - Depth rank > 10 (n 263) played 0.66 and holds 4.3.
  - These residuals are candidates for a later version only. The subgroups are small, so no direction is claimed.

## 4. The v0.5 rule

Module: `app/src/lib/sports/nba/eligibility-gate-v05.mjs` (`nba-eligibility-gate-v0.5`, pool `nba-roster-gated-pool-v0.5-eligibility`). Family: `v0.5`, model version `nba-experimental-v0.5-eligibility-gate`, `alignsWith: "v0.1"`. It uses the same roster gate, Elo, role-minutes layer (`minutes-model-v03.mjs`), engine (`game-sim-v03.mjs`) and cutoff as v0.3. The two v0.3 source files are not edited and stay sha-pinned.

1. **State** (as of the instant, current season, regular season only). Each rostered player is in exactly one state:
   - `NONE`: the team has not played yet, or the player's last box appearance this season was for another team. The multiplier is 1.
   - `NO_APPEARANCE`: the team has played, but the player is in none of this season's box scores, not even as a DNP.
   - `LAST_PLAYED`: he played in the team's last game. The multiplier is 1.
   - `MISSED_1_COACH` / `MISSED_1_OTHER`: he missed only the team's last game, by coach's decision or for any other reason (including absent from the box). This counts from his first box appearance with the team this season.
   - `MISSED_2PLUS_COACH` / `MISSED_2PLUS_OTHER`: he has missed 2 or more consecutive tenure games, split by the reason for the last one.
2. **Play probability:** q = v0.3 playRate × MULTIPLIER[state].
   - The gate only ever lowers q.
   - A player who played last time keeps v0.3's playRate exactly.
3. **Redistribution:** q replaces playRate in `prepareRosterV03`, unchanged.
   - Σ q·minutes = 240.
   - An over-full pool is water-filled on minutes^1.25 with the per-player cap `MAX_PLAYER_MINUTES` = 48.
   - An under-full pool keeps v0's bounded uniform factor of [0.5, 1.5].
   - q is also the engine's participation probability.
   - Minutes stay conditional on playing.
   - With every multiplier set to 1, v0.5 is byte-identical to v0.3. This is checked by test, and the replay reproduces all 54 frozen v0.3 receipts' `payloadSha256` before building v0.5.

## 5. Constants (FOUNDER APPROVAL REQUIRED before arming)

All five constants are ratios of empirical play rates in the **2025-26 regular season** (corpus season 2026, `data/internal/research/nba/boxscores/`), which is strictly before every 2026-27 forecast. `fitEligibilityTable` re-derives them, and `eligibility-gate-v05.test.mjs` ("RECOMPUTE") pins the cell counts and the multipliers exactly.

| Constant | Value | Cell n (played) | P(play) 2025-26 | Ratio to LAST_PLAYED 0.861 |
|---|---|---|---|---|
| `MULTIPLIERS.NO_APPEARANCE` | **0.025** | 5,059 (107) | 0.021 | 0.025 |
| `MULTIPLIERS.MISSED_1_COACH` | **0.574** | 1,847 (913) | 0.494 | 0.574 |
| `MULTIPLIERS.MISSED_1_OTHER` | **0.578** | 1,865 (929) | 0.498 | 0.578 |
| `MULTIPLIERS.MISSED_2PLUS_COACH` | **0.429** | 2,421 (894) | 0.369 | 0.429 |
| `MULTIPLIERS.MISSED_2PLUS_OTHER` | **0.157** | 6,454 (872) | 0.135 | 0.157 |
| (reference) `LAST_PLAYED`, `NONE` | 1 | 26,076 (22,461) | 0.861 | — |

**Fitting population.** 2025-26 has no roster captures. A player counts as "on the team" at game g when his next box appearance at or after g (any status) is with the team, and his previous appearance that season, if any, was also with the team. This is a labels-side stand-in for the roster gate.

**Known weakness of `NO_APPEARANCE`.** Late signings and mid-season call-ups are in that cell for every team game before their first appearance, so the fitted rate (0.021) is far below the 2026-27 descriptive rate for the cell (0.110, n 91, in-sample). That makes this multiplier aggressive.

The founder may instead:
- approve it as is;
- set `NO_APPEARANCE` to 1 (no gate for that state), at the cost of about 6 minutes per team-game of non-player mass staying in the pool;
- ask for a re-fit with a different population rule. That would be a new candidate version, decided **before** arming and never after a forward look.

No other new number exists. 240, 48, [0.5, 1.5], 1.25 and the v0.3 constants are reused frozen engine constants.

## 6. Leakage controls

- The state index reads only current-season regular-season box scores with `dateUtc` before the instant and `capturedAt` at or before it. The builder's `foldBoxscores` already refuses later captures. The gate filters again.
- The game being forecast, later games, late captures and prior-season games change nothing. This is checked by a mutation test ("NO LEAKAGE"): the same late-captured game, captured in time, *does* change the states.
- The multipliers come from 2025-26 only. No 2026-27 outcome enters any constant.

## 7. Descriptive replay, 10-22 … 10-28 (IN-SAMPLE, NOT EVIDENCE)

**Design disclosure.** The state rule and the choice of a *relative* multiplier were made **after** looking at the 2026-27 slates in this window. The variants looked at were:
- (A) relative multipliers (chosen);
- (B) absolute play-probability table (rejected: over-projected played minutes by about +1.5);
- (D) A with absent streaks set to 0;
- a split of LAST_PLAYED at 10 minutes (not adopted).

Only minutes were inspected for those variants. The table values themselves come from 2025-26 alone. Every number in this section is therefore **descriptive and in-sample**. It is never forward evidence, never a ledger row, and never counts toward any §6 sample.

Replay method: `replay-nba-v05-eligibility-candidate.mjs`.
- Each freeze instant takes the roster and injury git blobs whose sha256 its receipt hashed.
- All 54 v0.3 games re-derived their committed `payloadSha256` first.
- v0.5 was then built on the same inputs (10,000 sims, same seeds).

The sample is the same 910 paired played lane rows (54 games). ΔMAE: negative favours v0.5.

| Family | v0.5 bias (CI) | v0.5 MAE | Above-share | ΔMAE vs v0.1 (CI) | ΔMAE vs v0.3 (CI) |
|---|---|---|---|---|---|
| Minutes | −0.02 (−0.67, +0.62) | 5.45 | — | −1.55 (−1.91, −1.19) | −0.31 (−0.50, −0.10) |
| Pts | +0.27 (−0.11, +0.64) | 4.82 | 0.454 | −0.38 (−0.57, −0.15) | +0.01 (−0.06, +0.07) |
| Reb | −0.18 (−0.37, +0.00) | 1.98 | 0.487 | −0.22 (−0.30, −0.14) | −0.02 (−0.06, +0.01) |
| Ast | +0.02 (−0.11, +0.14) | 1.36 | **0.436** | −0.17 (−0.23, −0.11) | +0.00 (−0.02, +0.02) |
| 3PM | −0.02 (−0.09, +0.04) | 0.93 | **0.398** | −0.01 (−0.04, +0.02) | **+0.010 (+0.001, +0.018)** |
| PRA | +0.43 (−0.14, +0.95) | 6.33 | 0.462 | −0.91 (−1.19, −0.60) | −0.02 (−0.15, +0.10) |

**Pool and allocation:**
- **Pool:** non-player mass falls from 31.8 to 22.2 per team-game, 30% of it removed (25–37%). Played rows go from 217.3 expected to 235.1, against 239.0 actual.
- **Minutes bias by v0.5 expected-minutes bucket:** [0, 20) +0.20; [20, 28) −0.33; ≥ 28 +0.16.
- **Actual starters:** −1.65 (v0.3: −3.60). **Bench:** +1.90 (v0.3: +0.34).
- **Toward §6:** v0.5 has 634 rows with E ≥ 20.
- **Largest projected E:** 43.6, the same as v0.3. The cap of 48 never bound in this window.

**Honest reading (descriptive only):**
- The gate fixes the minutes **location**, and minutes MAE improves on v0.3.
- Stat-level MAE does **not** improve on v0.3. 3PM is very slightly worse, and that interval excludes 0.
- The stat **medians** now sit slightly high in the median sense:
  - pts above-share 0.454;
  - ast 0.436 and 3PM 0.398, both outside [0.45, 0.55].
  - The mean bias is near 0. The pts, ast and 3PM distributions are right-skewed, so a p50 matched to the mean minutes sits above the median outcome.
- Gate (e) may therefore fail on ast and 3PM in the forward shadow. That is a reason for the forward test, not for any tuning now.

## 8. Forward-shadow protocol (after arming only)

- **Freeze:** the code and constants above are frozen at the arming commit. Any change after that is a new candidate (new version strings, its own shadow).
- **First sample:** the first slate that v0.5 freezes at v0.1's cutoff **after** arming, at the same instant and on the same roster, injury and schedule inputs (`alignedCutoffRefusal`). This is never earlier than the 2026-10-30 slate. 2026-10-22 … 10-29 are never v0.5 samples.
- **Directory and ledger:** `experimental-v0.5/forecasts/`, graded by the same grader into `experimental-v0.5/ledger.json`, paired against v0.1 by the champion/challenger evaluator.

## 9. Promotion gate — all on forward games after the freeze

- **(a) Sample:** the §6 minimums of the V18 preregistration: 1,500 matched player-games with expectedMinutes ≥ 20 for pts, reb and ast; 800 for 3PM. Below that, the market is HOLD.
- **(b) §7 bars,** per family:
  - minutes MAE ≤ 6.0;
  - conditional MAE better than the season-mean-rate baseline by ≥ 5%;
  - p10–p90 coverage in [0.76, 0.84] (3PM [0.74, 0.86]);
  - ECE ≤ 0.05.
- **(c) Paired accuracy vs v0.1** (game-clustered bootstrap):
  - pts ΔMAE with its 95% CI entirely below 0;
  - reb, ast and 3PM not worse, meaning a CI upper bound ≤ +0.05.
- **(d) Bias:** |minutes bias| ≤ 1.0 and |pts bias| ≤ 0.5, each with a 95% CI that covers 0.
- **(e) Median calibration:** above-share in [0.45, 0.55] for each family.
- **(f) Founder decision:** a founder-approved entry in the PR 1154 promotion record (`data/internal/research/nba/promotion-record.json`) that cites a READY_FOR_FOUNDER_REVIEW verdict. Automation never appends.
- **(g) Comparison rule:**
  - any line comparison uses the official lane rows, one declared line rule, and graded outcomes;
  - closeness to a sportsbook line is never evidence of accuracy;
  - no sportsbook price is committed.

v0.5 is also compared with v0.3 on the same paired rows, for information only. Promotion is judged against the official v0.1.

## 10. Unchanged

- v0.1 stays official for players and Elo for the winner side.
- Team scores stay WITHHELD.
- Frozen receipts and published lanes are never regenerated or backfilled.
- There is one official forecast per game, player and market.
- No what-if feeds picks.
- No workflow, environment or repository variable changes.
- v0.4 (#1180) is untouched.
