# NBA v0.1 low projected minutes: investigation and forward candidate (2026-10-21)

**Status:** founder decision of **2026-10-22**, recorded in the PR 1116 decision register and relayed by the release owner. It is recorded in the preregistration as look 8 and §14 (`docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md`).

1. **The diagnosis is ACCEPTED.**
   - Primary cause: the uniform 240-minute rescale.
   - Secondary cause: the trailing window holds last season's final games, playoffs included.
   - Not preseason.
   - The frozen forecasts stay unchanged.
2. **v0.3 is APPROVED as a FORWARD-SHADOW CHALLENGER only.**
   - v0.1 stays official for players, and Elo for winners.
   - 10-20 and 10-21 stay frozen and immutable. The replays below are descriptive and never forward evidence.
   - v0.3 is frozen and registered before its first forward slate.
   - It uses the SAME information cutoff as the official forecast: same instant, same inputs.
   - It is graded against real results on errors, calibration, coverage, availability handling and minutes accuracy.
   - The preregistered promotion rules are kept. There is no automatic promotion, and no new official value without separate approval.
3. **Constants approved for v0.3 ONLY:** prior strength = 10 games, and bench-first power = 1.25 (reused from v1). No tuning after 10-20/21. Any change during the test means a new candidate.

**Moving closer to sportsbook lines does NOT establish better accuracy.** A line is not an outcome, and one night is not a sample.

What is unchanged:
- **Official composition.** Elo side + v0.1 players (`app/src/lib/consistency/official-snapshot.mjs`) is untouched.
- **Frozen data.** No frozen forecast, receipt, ledger or published-lane file is changed.
- **v0.3's status.** It is a registered shadow family (`FAMILIES["v0.3"]`, `experimental-v0.3/`) aligned to v0.1's cutoff. It is never official.
- **Promotion path.** Promotion goes only through the founder and the promotion record of PR 1154 (`data/internal/research/nba/promotion-record.json`, `app/src/lib/sports/nba/promotion-record.mjs`).

The sections below are the investigation as presented for the decision. §3 and §5 are updated to the armed state.

**The finding being investigated** was relayed by the release owner. It covers one night, and a market line is not truth.

- On the 2026-10-21 slate, the official v0.1 PTS medians sit below the sportsbook consensus: median (v0.1 − line) −3.0 pts, 23 of 25 players below the line.
- The release owner's hypothesis was that preseason games had entered the minutes window.

Line numbers below refer to `origin/main` @ `c17255f3fd`.

---

## 1. Mechanism (confirmed in code and on the committed receipts)

### 1.1 Preseason is NOT in the v0.1 window

The hypothesis is **refuted** for the official family.

- **v0.1 never reads a 2026-27 box score.** Its data rule is `corpus-v1` (`app/src/lib/sports/nba/experimental-forecast.mjs:55`). The builder loads only the corpus box scores (`app/scripts/nba/build-nba-experimental-forecasts.mjs:104-105`). The season fold of fetched box scores runs only when `dataRule !== "corpus-v1"` (`:109`). Every 10-20 and 10-21 receipt records `boxscores.docs = 4179`, the corpus count, with no `fetchedBoxscores`.
- **The minutes model drops phase 1 for a regular-season forecast.** The filter is `(d.phase === 1) === wantPre` (`app/src/lib/sports/nba/minutes-model.mjs:56`). The same filter is in the roster gate's last-team index (`roster-gated-pool.mjs:67`).
- **Measured on the receipts:** 0 preseason appearances are used, out of 909 (10-20) and 3,469 (10-21) appearances behind the projected rows.

### 1.2 What "trailing10" is

The window is chosen in `minutes-model.mjs:93-123`:

1. `teamGames` takes the team's box scores in the population, strictly before `now`, newest first (`:51-59`).
2. `seasonUsed` is the newest season with any such game (`:97`).
3. The window is that season's last `TRAILING_N = 10` **team** games (`:98-99`, `:29`).
4. Each player gets one of three bases:
   - `trailing10` with ≥ 3 appearances in those 10 games;
   - otherwise `season` (all his appearances for the team that season) with ≥ 3;
   - otherwise `insufficient` (`:121-123`).

   `gamesUsed` is the player's appearance count in the chosen set (`:67`).
5. Minutes are the mean over **appearances**. DNPs are excluded, never zero-filled (`:110-114`).

The roster gate does not change this. It looks a player up on his current team, or else on his last team (`roster-gated-pool.mjs:107-131`). A traded player therefore carries his old team's window.

### 1.3 What this means on a 2026-27 regular-season forecast

The corpus ends 2026-06-14 (`season-fold.mjs:5-7`). So for every side on both slates:

- `seasonUsed = 2026`, the 2025-26 season;
- the "trailing 10" is the team's **last 10 games of 2025-26**;
- "4–10 gamesUsed" means 4–10 appearances in those 10 team games. It is not a small preseason sample.

Two defects follow. Item b is the larger one.

**a. The window is the end of last season, and it includes play-in and playoff games.**

- The "regular" population is `phase !== 1` (`minutes-model.mjs:56`), so phases 3 (playoffs) and 5 (play-in) are inside it.
- **10-20:** of the 909 appearances used, 559 are playoff games, 349 regular and 1 play-in. All six 10-20 teams were 2025-26 playoff teams.
- **10-21:** of 3,469 appearances, 2,778 are regular, 595 playoff and 96 play-in.
- For non-playoff teams the window is late March to mid April: rest, shutdowns and injury returns. Trae Young's row is his 5 games for WSH on 2026-03-06…03-16, at 20.6 min.

**b. One uniform rescale to 240 shaves every starter.**

`prepareRoster` sums the per-appearance minutes of every available rostered player. It then multiplies everyone by `240 / sum`, bounded to [0.5, 1.5] (`app/src/lib/sports/nba/game-sim.mjs:98-99`, applied at `:112`).

A 9–16-player pool's per-appearance minutes sum to 197–384, because deep-bench players are counted at the minutes they get on the nights they play. The factor that results:

| Slate | Factor min / median / max | Sides below 0.80 |
|---|---|---|
| 2026-10-20 | 0.715 / 0.846 / 0.980 | 2 of 6 |
| 2026-10-21 | 0.625 / 0.819 / 1.216 | 8 of 22 |

The factor is lowest for NO 0.625, MIL 0.652, HOU 0.699 and WSH 0.734.

### 1.4 Decomposition: window or rescale?

Projected starters are the top 5 by v0.1 expected minutes per side.

- "Raw" is the expected minutes before the rescale (stored ÷ factor).
- "Prior full season" is the player's whole 2025-26 regular season (phase 2 + cup final, all teams) per appearance.
- **Window effect** = raw − prior full season. **Rescale effect** = stored − raw.

| Slate | Group | n | v0.1 stored | Raw | Prior full season | Window effect | Rescale effect |
|---|---|---|---|---|---|---|---|
| 10-20 | starters | 30 | 28.2 | 33.9 | 30.6 | +2.7 | **−5.2** |
| 10-20 | bench | 51 | 9.1 | 11.6 | 18.4 | −2.7 | −1.5 |
| 10-21 | starters | 110 | 26.1 | 31.1 | 29.3 | +1.2 | **−5.5** |
| 10-21 | bench | 175 | 15.1 | 18.9 | 18.9 | −0.2 | −3.0 |

All values are medians in minutes.

**The rescale is the dominant cause of the low starter minutes.** On 10-20 the playoff window even pushed starters *up*.

**The named players (10-21 receipts):**

| Player (team now) | v0.1 stored | Raw | Factor | Basis · gamesUsed | History | Window (phases) | 2025-26 full regular season |
|---|---|---|---|---|---|---|---|
| Tyler Herro (MIL) | 21.4 | 32.9 | 0.652 | trailing10 · 8 | other team (MIA) | 03-27→04-14 (7 reg, 1 play-in) | 31.2 mpg, 33 apps |
| Trae Young (WSH) | 15.1 | 20.6 | 0.734 | season · 5 | same team | 03-06→03-16 (5 reg) | 25.5 mpg, 15 apps |
| Anthony Davis (WSH) | 22.9 | 31.2 | 0.734 | season · 20 | other team (DAL) | 10-23→01-09 (20 reg) | 31.2 mpg, 20 apps |
| Franz Wagner (ORL) | 26.2 | 28.9 | 0.907 | trailing10 · 7 | same team | 04-12→04-28 (1 reg, 4 playoff, 2 play-in) | 30.0 mpg, 34 apps |

Herro and Davis lose 8–12 minutes almost entirely to the rescale. Young's window is an injury-return stretch, and the rescale then takes another 5.5 minutes.

### 1.5 Reconstruction check

All 14 v0.1 games re-derive their committed `payloadSha256` from reconstructed inputs: 1 + 2 games at the two 10-20 freezes, and 11 at 10-21. The inputs are:

- the roster and injury git blobs whose sha256 equal the receipts';
- the corpus box scores.

So every number above is computed from the receipts' exact inputs.

---

## 2. 10-20 expected vs actual minutes (descriptive, one night, 3 games)

The comparison uses the committed final box scores in `data/internal/research/nba/experimental/boxscores/` (phase 2).

- Of the 81 v0.1 rows, 63 played, 13 were DNP and 5 were absent from the box score.
- Starter/bench is the box score's starter flag.
- Errors are actual − expected.

| Group | n | v0.1 expected (median) | Actual (median) | Median (actual − expected) | MAE | \|err\| ≥ 10 |
|---|---|---|---|---|---|---|
| actual starters | 30 | 27.1 | 32.0 | +3.7 | 5.1 | 3 |
| actual bench | 33 | 10.6 | 17.0 | +1.0 | 4.1 | 4 |
| all who played | 63 | 20.7 | 24.0 | +2.7 | 4.6 | 7 |

This is consistent with the release owner's +2.7. Among the DNPs, v0.1 projected Rayan Rupert (PHI) at 25.2 minutes; he did not play.

10-21 has no finals yet, so only projection-side facts are reported for it.

---

## 3. Options (judged on structure, not on 10-20/10-21 outcomes)

| Option | Assessment |
|---|---|
| (a) exclude preseason from the minutes/rates window | **Already true for v0.1** (§1.1): a no-op for the official family. Kept as an explicit, pinned rule in the candidate, because the candidate reads fetched 2026-27 box scores (67 of the 70 fetched as of 10-21 are preseason). |
| (b) down-weight preseason | Rejected. v0.1 uses none, so this would *add* preseason. Preseason rotations (starters at 20–25 min) are structurally not regular-season rotations, and prereg §3 keeps the populations separate. |
| (c) regular-season-only window with a prior-season fallback below N games | Rejected as a hard switch. A switch at N is the same failure class as v0's `seasonUsed` switch: the whole team flips seasons after one game, rates go null, and v0.2's team scores were 0–0 on 2026-10-13 (`sim-v1-profile.mjs:4-11`). |
| (d) role prior from the prior regular season, blended toward the current season | **Chosen**, together with a fix for the normalisation (§1.4 shows that is the larger cause). |

**Recommendation: candidate `v0.3`** (`nba-experimental-v0.3-role-minutes`, minutes model `nba-minutes-model-v0.3-role-prior`, pool `nba-roster-gated-pool-v0.3`). Its rules are in `app/src/lib/sports/nba/minutes-model-v03.mjs`.

1. **Population.** Regular = phase 2 + cup final only. Preseason, play-in and playoffs are excluded. This reuses the existing frozen rule `sim-v1-profile.mjs` `inPopulation`.
2. **History by athlete, across teams.** This is v0.1's traveling-history rule, over seasons S and S−1, strictly before the forecast instant.
3. **Role prior.** The player's whole S−1 regular season, per appearance, not the last 10 team games.
4. **Blend.**
   `minutes = (w·Σ prior + Σ current) / (w·n_prior + n_current)`, with `w = min(1, PRIOR_GAMES / n_prior)`.
   - Rates, starter share, minutes SD and play rate use the same weights.
   - There is no switch point.
   - `PRIOR_GAMES = TRAILING_N = 10` reuses the frozen v0 window length. It is not a fitted number.
5. **Play rate.** Appearances ÷ (appearances + COACH'S DECISION DNPs). An injury DNP is availability, which comes from the injuries feed. This is the `sim-v1-profile.mjs` rule.
6. **Normalisation** (`game-sim-v03.mjs` `prepareRosterV03`; the frozen v0 engine `game-sim.mjs` is not edited and stays pinned byte-for-byte by `game-sim-v1.test.mjs`):
   - Minutes stay **conditional on playing**, which is what a line and the grader compare against.
   - The team sums to 240 **in expectation** (Σ playRate·minutes = 240).
   - An over-full pool is water-filled on minutes^1.25, so the excess comes mostly from short-minutes players. 1.25 is `V1_PARAMS.MINUTES_POWER`, frozen at look 4 and fitted on 2023-24 only. No new constant.
   - A pool at or under 240 keeps v0's uniform bounded factor.
   - The v0 engine counts a player's points toward the team total with probability playRate, from a separate RNG stream.
7. **Unchanged from v0.1:** the roster gate (fail closed), the injuries rule, INSUFFICIENT_HISTORY (null, never 0), Elo, the per-draw model and the seed.
8. **Data rule** `corpus-v1+boxscores-2026-27`. The fetched box scores fold, so the current season can accrue. The finals record does not, so **v0.3's Elo is v0.1's**, and any difference from v0.1 is the minutes layer alone.

**Why not just use v1?** v1 (`nba-sim-v1-coherent`) already has a two-season blend, play rate and water-filling, but in a different engine. v0.3 isolates the minutes layer under v0.1's gate, Elo and per-draw model, so the attribution is clean.

For the named players the two land close together on 10-21 (v1's frozen receipt vs the v0.3 replay):

| Player | v1 receipt | v0.3 replay |
|---|---|---|
| Herro | 24.6 | 25.5 |
| Davis | 27.0 | 26.4 |
| Young | 19.8 | 20.5 |
| Wagner | 25.5 | 29.5 |

Neither is a validation.

**Design history (disclosed for the looks log).**

1. The first draft of v0.3 normalised by one uniform factor on Σ playRate·minutes.
2. Its replay was inspected on the **projection side only**: rescale factors and starter minutes, no outcomes. It still took about 4–5 minutes from starters.
3. It was replaced by the water-fill above, reusing the frozen v1 power.
4. The 10-20 actual-vs-expected comparison for v0.3 (§4.3) was computed after that final design. No rule or constant was changed after any outcome was seen.

The investigation was *motivated* by the release owner's outcome-derived shadow grading and by market lines (see §5).

### Code

- **`app/src/lib/sports/nba/minutes-model-v03.mjs`** (new). Index, role estimate and gated pool.
- **`app/src/lib/sports/nba/game-sim-v03.mjs`** (new). The v0 draw model (it reuses game-sim.mjs's seed, PRNG, constants and draw order) with `prepareRosterV03` (conditional minutes, `weightedWaterFill`) and the separate participation stream. Model version `nba-sim-v0.3-conditional-minutes`. A test pins that, with every play rate 1 and a pool of exactly 240, its player distributions and team totals equal the v0 engine's.
- **`app/src/lib/sports/nba/game-sim.mjs` is NOT modified.**
- **`app/src/lib/sports/nba/experimental-forecast.mjs`.**
  - After the founder decision, `v0.3` is in `FAMILIES`: role CHALLENGER, `alignsWith: "v0.1"`, its own `experimental-v0.3/` directory and ledger. The promotion record therefore recognises it.
  - `CANDIDATE_FAMILIES` (empty) and `unarmedWriteRefusal` keep the unarmed-candidate mechanism for future candidates.
  - `alignedCutoffRefusal` is the same-cutoff rule.
  - `decide-nba-forecast-window.mjs` `owingFamilies` does not count an aligned family as owed; it follows its anchor.
- **`app/scripts/nba/build-nba-experimental-forecasts.mjs`.**
  - `--family v0.3` is accepted. A v0.3 game is frozen only where v0.1's receipt for it has `generatedAt` = `--now` and the same roster, injury and schedule inputs (`NOT_ALIGNED` otherwise). The receipt records `alignedWith`.
  - Research replays may pass `--schedule-file`, `--rosters-file` and `--injuries-file` only with `--out` outside the repository.
  - An unarmed candidate's `--write` without `--out` is still REFUSED, and so is an `--out` inside any `forecasts/` directory.
  - Box-score-only fold for v0.3. v0.1, v0.2 and v1 take the same branches as before.
- **`app/scripts/nba/research/replay-nba-v03-minutes-candidate.mjs`** (new). The replay. It refuses an `--out-dir` inside the repo, and refuses unless every v0.1 game re-derives its payload hash.
- **`app/src/lib/sports/nba/minutes-model-v03.test.mjs`** (new). 19 tests, including:
  - frozen constants and source hashes;
  - the same-cutoff rule (pure, plus the real builder on the committed 10-21 inputs);
  - the promotion record accepting v0.3;
  - lane, snapshot, product and route isolation;
  - **v0.1 byte-identity**: every committed 10-20 and 10-21 v0.1 game re-derives its `payloadSha256` with this code.
  - Roster inputs are the dated captures `rosters/2026-10-19|20|21.json`, which equal the hashed `latest.json` blobs.
  - Injury inputs are exact copies of the hashed blobs, in `data/internal/research/nba/v0.3-candidate/fixtures/` (sha256-checked in the test).

---

## 4. Replay (REPLAY_NOT_PUBLISHED)

The replay was run with:

`npx tsx scripts/nba/research/replay-nba-v03-minutes-candidate.mjs --dates 2026-10-20,2026-10-21 --out-dir <scratch outside the repo>`

- **Same inputs as the receipts.** The replay uses each receipt instant and the exact roster and injury blobs the receipts hashed. Box scores are folded at the instant with `foldBoxscores`: 67 fetched docs at the 10-20 freezes and 70 at 10-21. All of them are preseason, except the three 10-20 finals, whose teams do not play on 10-21.
- **v0.1 reproduced first.** v0.1 re-derived 14 of 14 payloads before v0.3 was built.
- **Nothing published.** Outputs were written only to a scratch directory outside the repo. Nothing was written under `data/`.

### 4.1 Starters and bench (projection side)

Projected starters are the top 5 by v0.1 expected minutes per side. Values are medians.

| Slate | Group | n | Minutes v0.1 | Minutes v0.3 | PTS p50 v0.1 | PTS p50 v0.3 |
|---|---|---|---|---|---|---|
| 10-20 | starters | 30 | 28.2 | 28.0 | 12.1 | 14.9 |
| 10-20 | bench | 51 | 9.1 | 14.7 | 2.6 | 4.8 |
| 10-21 | starters | 110 | 26.1 | 27.3 | 13.0 | 13.6 |
| 10-21 | bench | 175 | 15.1 | 15.4 | 5.1 | 5.5 |

On 10-21, 18 of 22 sides are over-full under v0.3 (median Σ playRate·minutes = 271) and are water-filled.

### 4.2 Named players (10-21)

| Player | Minutes v0.1 → v0.3 | PTS p50 v0.1 → v0.3 | Consensus line (release owner) |
|---|---|---|---|
| Tyler Herro | 21.4 → 25.5 | 11.7 → 16.5 | 22.5 |
| Trae Young | 15.1 → 20.5 | 11.0 → 13.7 | 19.5 |
| Anthony Davis | 22.9 → 26.4 | 14.25 → 16.45 | 21.5 |
| Franz Wagner | 26.2 → 29.5 | 14.8 → 19.5 | 21.5 |

### 4.3 10-20 vs actuals (descriptive context only)

Actual − expected; 63 players who played.

| Group | Family | Median minutes error | Minutes MAE | \|err\| ≥ 10 | Median (actual − PTS p50) | Share actual ≥ PTS p50 |
|---|---|---|---|---|---|---|
| actual starters (30) | v0.1 | +3.7 | 5.1 | 3 | +0.9 | 0.57 |
| actual starters (30) | v0.3 | +3.9 | 4.7 | 2 | −2.4 | 0.37 |
| actual bench (33) | v0.1 | +1.0 | 4.1 | 4 | +0.2 | 0.52 |
| actual bench (33) | v0.3 | −1.1 | 4.7 | 3 | −1.6 | 0.39 |
| all (63) | v0.1 | +2.7 | 4.6 | 7 | +0.6 | 0.54 |
| all (63) | v0.3 | +1.7 | 4.7 | 5 | −1.8 | 0.38 |

Lower MAE is better. **No interval was computed, and with 3 games and 63 rows one cannot be meaningful.** These rows show neither model is better.

On this one night, v0.3's PTS medians sat above the actual more often than v0.1's. That is a reason to watch v0.3 for over-projection in forward shadow, not a conclusion.

### 4.4 10-21 vs the market (descriptive context only; a line is not truth)

The 25 players with a PTS line in the committed private capture are `data/internal/research/odds/nba/props/2026-10-21T2220Z.json` (ATL@ORL, MIL@WSH). Consensus is the median line across books.

| | Median (median − line) | Players below the line |
|---|---|---|
| v0.1 | −3.0 | 22 of 25 |
| v0.3 | −1.3 | 21 of 25 |

This reproduces the release owner's −3.0. They reported 23 of 25 below; the difference is probably the consensus rule.

v0.3 narrows the gap and does not close it.

**One or two nights cannot validate anything.** No claim is made that v0.3 is better than v0.1, or than the market, on any market.

---

## 5. Preregistration implications

The relevant sections of `docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md` are §6 minimum samples, §7 promotion bars, §8 forward shadow, §12 looks log and §13 amendments.

**Do 10-20 and 10-21 count as looks? Yes, as one outcome look (look 8). As forward-shadow samples for v0.3, no.**

This investigation read three kinds of data:

- the 10-20 and 10-21 v0.1 receipts;
- the 10-20 final box scores (3 games, 63 matched player rows), for both v0.1 and the v0.3 replay;
- the 25 committed 10-21 PTS lines.

The release owner's relayed shadow grading is also outcome-derived. §8 requires an artifact written **before tip**, and the v0.3 replays were built afterwards. So neither date can enter any v0.3 sample, bar or evaluator pair. The v0.3 forward shadow starts on the first slate frozen after arming.

**What promotion would take (unchanged rules):**

- **Minimum samples (§6).** 1,500 matched player-games with expectedMinutes ≥ 20 for PTS, REB and AST each, and 800 for 3PM.
- **Bars (§7).** For the PTS row: minutes MAE ≤ 6.0; conditional MAE ≥ 5 % better than the season-mean-rate baseline; p10–p90 coverage in [0.76, 0.84]; ECE ≤ 0.05.
- **Forward shadow (§8).** Pre-tip artifacts only.
- **Evaluator.** The champion/challenger evaluator (`champion-challenger.mjs`) must return READY_FOR_FOUNDER_REVIEW on paired rows, with an interval excluding 0.
- **Promotion record.** A founder-approved record in the PR 1154 file. `promotion-record.mjs` validates against `FAMILIES`, which now includes v0.3. A test pins this.

### 5.1 Amendment text as drafted for the decision

The committed version is preregistration §14, with the founder's conditions.

> **§1 addition: v0.3 candidate (minutes layer), founder decision YYYY-MM-DD.** Family `v0.3`, model version `nba-experimental-v0.3-role-minutes`, minutes model `nba-minutes-model-v0.3-role-prior`, pool `nba-roster-gated-pool-v0.3` engine `nba-sim-v0.3-conditional-minutes` (`app/src/lib/sports/nba/minutes-model-v03.mjs`, `app/src/lib/sports/nba/game-sim-v03.mjs`).
>
> v0.1's roster gate, Elo (corpus-v1, no finals fold), the v0 per-draw model and seed, and the injuries rule are unchanged. Only the minutes layer and its normalisation differ:
> - the regular-season population is phase 2 + cup final;
> - the role prior is the whole prior regular season by athlete, blended toward the current regular season with the prior worth `PRIOR_GAMES = 10` appearances (= `TRAILING_N`);
> - play rate counts coach's-decision DNPs only;
> - normalisation keeps minutes conditional on playing, sums the team to 240 in expectation, and water-fills an over-full pool on minutes^1.25 (= `V1_PARAMS.MINUTES_POWER`, frozen at look 4).
>
> **Frozen** at commit `<sha>` before any further look. No rule or constant may change after arming. Any change is a new version string with its own shadow. No outcome-informed tuning beyond the structural rule recorded here.
>
> **Role:** CANDIDATE_SHADOW. It never replaces v0.1 (N1) or the Elo side (N2) automatically, is never a lane source, and is never a product source.
>
> **Arming** moves `v0.3` from `CANDIDATE_FAMILIES` to `FAMILIES`. Its nightly build and grade are added in a reviewed workflow change. Its ledger is `experimental-v0.3/ledger.json`. Its forward shadow starts on the first slate frozen after arming. Replays of earlier slates (2026-10-20, 2026-10-21) are not samples.
>
> **Evaluation:** §6 minimums, §7 bars and §8 forward shadow, unchanged, market by market. The champion/challenger evaluator adds `v0.3` as a challenger to v0.1 on paired pre-tip regular-season rows (expectedMinutes ≥ 20 in both). A direction is claimed only with a game-clustered interval excluding 0. Promotion only by a founder-approved PR 1154 record citing READY_FOR_FOUNDER_REVIEW.
>
> **No bar, threshold, metric, sample size, graded record or evaluation rule above changes.**

### 5.2 Looks-log entry as drafted

The committed version is look 8, with the accepted diagnosis wording.

> | 8 | 2026-10-21/22 | **Outcome look (investigation, v0.1 minutes).** Read: the frozen 2026-10-20 / 2026-10-21 v0.1 receipts (all 14 re-derived from their hashed inputs); the 2026-10-20 final box scores (3 games, 63 matched rows) for v0.1 and for a REPLAY of the v0.3 candidate; the 25 committed 2026-10-21 PTS lines (private capture; a line is not truth); the release owner's relayed v0.1 shadow grading. Finding: v0.1's minutes window is the last 10 games of 2025-26 (playoffs and play-in included, preseason excluded); the uniform 240 rescale takes a median 5.2–5.5 min from projected starters. The v0.3 rule was chosen on structural grounds. One design revision was made after a projection-side replay inspection and before any outcome was computed (uniform play-rate factor → water-fill with the frozen v1 power). | **No bar, threshold, metric, sample size, graded record or evaluation rule changed.** v0.1 and the Elo side stay official. Nothing promoted; registry still `HISTORICAL_ONLY`. 2026-10-20/21 are not v0.3 forward-shadow samples. Investigation: `docs/nba/NBA_V01_PRESEASON_MINUTES_INVESTIGATION_2026-10-21.md`. |

---

## 6. Risks and open items

1. **Starters are still compressed under v0.3.** The 10-21 starter median is 27.3, and over-full pools remain (Σ playRate·minutes median 271). Per-appearance minutes earned in other contexts stay in the pool: a bench player covering injuries, or a starter on his old team. Fixing that needs a lineup-context minutes model, which would be separate research. No stronger power was tried: that would be tuning toward the visible gap.
2. **The power was fitted elsewhere.** `MINUTES_POWER = 1.25` was fitted for the v1 engine on 2023-24. It is reused here, unvalidated for the v0 engine.
3. **The prior constant needs a source.** `PRIOR_GAMES = 10` reuses `TRAILING_N`. Founder approval is needed (methodology constants need a source).
4. **Single-season prior.** An injury-shortened 2025-26 gives a thin prior. Trae Young has 15 appearances at 25.5 mpg, which includes ramp-ups. An S−2 fallback would be a further structural rule, and it is not included.
5. **Play rate cannot see everything.** It counts coach's decisions only. Inactive players not listed in a box score, and G League assignments, are invisible.
6. **Possible over-projection.** On the one 10-20 night, v0.3's PTS medians were above the actual more often than v0.1's (0.38 vs 0.54 share at or above). Watch for this; no conclusion can be drawn.
7. **Team scores stay withheld.** The v0 team score ignores the opponent. v0.3's participation makes the team total consistent with 240 in expectation, but it is not a candidate output (§13).
8. **v0.2 has a separate defect, not fixed here.** v0.2 folds 2026-27 box scores into the v0 minutes model, so a team switches `seasonUsed` after its first regular-season game: every player falls below 3 appearances and the rates go null. This is already documented in `sim-v1-profile.mjs:4-11`. Not fixed here; v0.2 is untouched.
9. **The workflows are the release owner's.** v0.3 is armed in code. Its nightly build (both workflows, right after v0.1, same `--now`) and its grading line are given in PR 1178's body for the release owner to add. Until they are added, no v0.3 forecast is frozen. The window's decision does not count v0.3 as owed, so nothing re-fires.
