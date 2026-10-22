# NBA projection coverage gap: measurement, causes and a forward candidate (2026-10-22)

**Status: INVESTIGATION. Nothing here merges without a founder decision.**
- No frozen receipt, published-lane file, ledger or official composition changes.
- v0.1 and v0.3 behave exactly as before. A test pins them byte for byte (§8.3).
- The proposed v0.4 candidate is in `CANDIDATE_FAMILIES` with `armed: false`. Until the founder arms it, it can only be written as a replay outside the repository.

**Sources.**
- The frozen v0.1 receipts `data/internal/research/nba/experimental-v0.1/forecasts/2026-10-20.json` and `2026-10-21.json`.
- The roster and injury git blobs those receipts hashed. All 14 games re-derive their `payloadSha256` from them.
- The corpus box scores.
- The fetched 2026-27 **preseason** box scores captured before each freeze.
- The aggregates of the points pilot report on PR 1179 (`data/internal/research/odds/nba/reports/POINTS_PILOT_REPORT_2026-10-21.md`). No private odds record is copied here.

**No 2026-10-20 or 2026-10-21 outcome was read for this investigation.**

Line numbers refer to this branch. Every file cited, except `experimental-forecast.mjs` and the builder's header comment, is unchanged from `origin/main` @ `70a8e07017`.

---

## 0. Summary

1. **The gap is real and mostly rookies.**
   - Under the stated pre-tip rule (§1.2), **28 of 264** active rotation players on 2026-10-21 have no v0.1 projection: **22 rookies and 6 returners**.
   - On 2026-10-20 it is **6 of 71**, all rookies.
   - No case is a roster/id mapping failure (cause c = 0 at the primary rule).
2. **v0.3 does not close any of it.** The v0.3 replay has exactly the same no-projection set on both slates. So do the frozen v0.2 and v1 receipts.
3. **For the official family the gap lasts all season.**
   - v0.1's data rule is `corpus-v1`. It never folds a 2026-27 box score (`experimental-forecast.mjs:69`; builder `build-nba-experimental-forecasts.mjs:150,157-163`).
   - So a 2026-27 rookie, or a player who missed all of 2025-26, has no v0.1 projection on any 2026-27 slate. This is not just a first-night effect.
   - v0.3 recovers a player once his first 2026-27 regular-season box score is folded (§3.5).
4. **The 11 pilot players:**
   - Boozer, Wagler, Acuff, Lendeborg, Peterson, Wilson and Brown are cause (a), rookies.
   - Irving, VanVleet, Lillard and Haliburton are cause (b), returners with no 2025-26 game.
   - None is cause (c) or (d).
   - 10 of the 11 meet the primary rotation rule. Brown does not: he has one preseason appearance.
5. **Recommendation** (§7):
   - **Candidate v0.4 = v0.3 + a lagged role prior.** If S−1 has fewer than 3 regular-season appearances, the prior comes from S−2. This adds one constant, `MAX_PRIOR_LAG = 2`, which needs founder approval.
   - It is prototyped here, unarmed. On the 10-21 inputs it covers **all 7 returners**, including the 4 pilot returners, and changes nothing in games without one.
   - **Rookies need a founder decision on data:** either a draft-slot capture (D-series approval) or a preregistration §3 amendment to let preseason minutes inform a rookie prior. Until then they stay `INSUFFICIENT_HISTORY` (null, never 0).

---

## 1. Method

### 1.1 Inputs are exactly the receipts'

`app/scripts/nba/research/measure-nba-projection-coverage.mjs` (new; writes only to stdout or to `--out-dir` outside the repository) does three things.

1. **Finds the receipts' inputs.** It finds the git blobs of `rosters/latest.json` and `injuries/nba/latest.json` whose sha256 equal each receipt's. This is the same method as PR 1178's replay.
2. **Proves them.** It rebuilds v0.1 from those blobs and the corpus box scores, and **refuses unless every game re-derives its committed `payloadSha256`**.

   | Slate | Freezes | Games re-derived |
   |---|---|---|
   | 2026-10-20 | 12:29:28Z (1 game) and 14:17:02Z (2 games) | 3 of 3 |
   | 2026-10-21 | 14:28:31Z | 11 of 11 |

3. **Classifies.** Every player on the captured roster for each side is one of:
   - **projected**: in `forecast.players`;
   - **Out**: per the injuries rule;
   - **no projection**: everyone else. All 62 such players are in the receipt's `pool.insufficientHistory`. None was modelled at 0 minutes.

The v0.3 and v0.4 rows are replays on the same inputs. Box scores are folded at the instant with `foldBoxscores`: 67 fetched docs at the 10-20 freezes and 70 at 10-21. They are **descriptive and never forward evidence**.

### 1.2 "Active rotation player": a pre-tip rule, no outcomes

A rostered player who is **not Out** is ROTATION under rule R(X, G) when:

- **History:** his most recent corpus **regular season** (phase 2 + cup final, any team) with ≥ G appearances averaged ≥ X minutes per appearance. Or:
- **No such season (rookies):** his 2026-27 **preseason** box scores captured before the freeze show ≥ 2 appearances averaging ≥ X minutes.

**PRIMARY = R(15, 10).** Everything this rule uses was known before the freeze:
- the roster capture (`experienceYears` only cross-checks "rookie");
- the injuries feed;
- the corpus;
- preseason box scores captured before the freeze.

A rookie's draft slot would be the natural rotation signal, but it is not in committed data (§6.B), so it could not be used. Sportsbook pricing was not used either: the first pilot capture was at 22:20Z, after the 14:28Z freeze.

---

## 2. Measurement

### 2.1 Every rostered player

| Slate | Sides | Rostered | Out (d) | Not Out | v0.1 projected | **No projection, not Out** | By cause |
|---|---|---|---|---|---|---|---|
| 2026-10-20 | 6 | 103 | 9 | 94 | 81 | **13** | 13 rookies (a) |
| 2026-10-21 | 22 | 380 | 46 | 334 | 285 | **49** | 41 rookies (a) · 7 returners (b) · 1 unresolved (c) |

The v0.3 replay projects exactly the same 81 and 285 players, with the same no-projection set. The frozen v0.2 and v1 receipts project none of these 13 / 49 either.

### 2.2 Active rotation players (PRIMARY rule)

| Slate | Active rotation | v0.1 projected | **No projection** | (a) rookie | (b) returner | (c) mapping / two-way | (d) Out, would be rotation (not a gap) | v0.3 replay: none | v0.4 replay: none |
|---|---|---|---|---|---|---|---|---|---|
| 2026-10-20 | 71 | 65 | **6** (8.5 %) | 6 | 0 | 0 | 5 | 6 | 6 |
| 2026-10-21 | 264 | 236 | **28** (10.6 %) | 22 | 6 | 0 | 31 | 28 | **22** |

- On 10-21, 16 of 22 sides have at least one active rotation player without a projection.
- Eleven of the 28 started at least half of their preseason games: 9 rookies and the 4 star returners, minus Wagler and Brown, who started fewer.
- By team (10-21): CHI, LAC and SAC 3 each; MIN, CHA, TOR, IND, DAL and GS 2 each; ATL, MIL, MIA, MEM, UTAH, HOU and POR 1 each.

### 2.3 Sensitivity to the rule

10-21 rows are shown as "none: a + b". 10-20 has no returners, so its count is all cause (a).

| Rule | 10-20 rotation | 10-20 none | 10-21 rotation | 10-21 none: a + b | 10-21 share | Out, would be rotation (10-20 / 10-21) |
|---|---|---|---|---|---|---|
| R(10, 10) + preseason | 81 | 10 | 306 | 33 + 7 = 40 | 13.1 % | 5 / 39 |
| **R(15, 10) + preseason (PRIMARY)** | 71 | 6 | 264 | 22 + 6 = 28 | 10.6 % | 5 / 31 |
| R(15, 5) + preseason | 71 | 6 | 263 | 22 + 6 = 28 | 10.6 % | 5 / 31 |
| R(15, 20) + preseason | 71 | 6 | 261 | 22 + 6 = 28 | 10.7 % | 4 / 30 |
| R(20, 10) + preseason | 51 | 4 | 201 | 13 + 5 = 18 | 9.0 % | 3 / 25 |
| R(25, 10) + preseason | 33 | 1 | 125 | 4 + 4 = 8 | 6.4 % | 1 / 15 |
| R(15, 10), 2025-26 season only (returners never rotation) | 70 | 6 | 256 | 22 + 0 = 22 | 8.6 % | 5 / 28 |
| R(15, 10), history only (rookies never rotation) | 65 | 0 | 239 | 0 + 6 = 6 | 2.5 % | 4 / 28 |
| every rostered, not-Out player | 94 | 13 | 334 | 41 + 7 (+1 c) = 49 | 14.7 % | 9 / 46 |

**How the counts respond to each part of the rule:**
- **The appearance floor G barely matters** (5, 10 or 20).
- **The minutes floor X matters a lot**, because most of the gap is rookies with 13–25 preseason minutes.
- **Whether preseason may identify rookie rotation players** decides most of the count: rookies are 0 to 41 of it. That is a definitional choice. The returner count (4–7) is stable under every rule that admits players whose last full season was 2024-25.

---

## 3. Causes, with the code that produces each

### 3.1 (a) Rookie: no NBA history at all

**Definition:** no corpus box-score row with minutes in any non-preseason phase, and roster `experienceYears` 0. Karim Lopez (MEM) has one corpus **preseason** row, from an exhibition against an overseas club; it is not NBA history.

How v0.1 reaches no projection:
1. `minutes-model.mjs:103-116` builds the team's player rows only from that team's box-score rows. A rookie has none.
2. `roster-gated-pool.mjs:61-76` (`lastAppearanceTeamIndex`) has no entry for him either, so the other-team lookup at `:126-132` finds nothing.
3. `roster-gated-pool.mjs:134` sets `modelled = false`. Then `:138` sets expectedMinutes **null**, `:150` sets `INSUFFICIENT_HISTORY`, and `:158` lists him in `pool.insufficientHistory`.
4. `game-sim.mjs:95-96` (`prepareRoster`) puts a null-minutes row in `noMinutes`, not in the simulated `pool`. So there is no `forecast.players` row.

How v0.3 reaches no projection:
1. `minutes-model-v03.mjs:176-177`: no record, so `est = null`.
2. `:180`: not modelled.
3. `:196`: `INSUFFICIENT_HISTORY`.

### 3.2 (b) Returner: history in earlier seasons, none in the trailing window

Seven players on 10-21:

| Player | Last corpus season | Situation in 2025-26 |
|---|---|---|
| Irving | 2024-25 | — |
| VanVleet | 2024-25 | — |
| Haliburton | 2024-25 | — |
| Lillard | 2024-25 | 39 POR rows, all DNP |
| Niang | 2024-25 | 7 DNP rows |
| Lyles | 2024-25 | — |
| Beekman | 2024-25 | — |

None of the seven played a 2025-26 regular-season or postseason game.

How v0.1 reaches no projection:
1. `minutes-model.mjs:97-98`: `seasonUsed` is the team's **newest** season (2025-26 for every side), and `seasonGames` keeps only that season. Earlier seasons never enter `byPlayer`.
2. **Same team** (Irving DAL, VanVleet HOU, Haliburton IND). There is no row in the current team's 2025-26 games. `roster-gated-pool.mjs:128` skips the other-team branch because his last team *is* the current team.
3. **Other team** (Lillard's last appearance was for MIL; Niang, Lyles and Beekman also). `:127-130` looks the player up on his last team. `minutesFor(lastTeam)` again reads **that team's newest season** only (`minutes-model.mjs:97-98`), where he does not appear. So `other = null`.
4. **DNP-only rows** (Lillard on POR; Niang). `minutes-model.mjs:110` excludes DNPs from every mean, and `:64` gives `mean([]) = null`. The row exists (`historyBasis: same-team` for Lillard) but `expectedMinutes` is null. So `roster-gated-pool.mjs:134` still reports not modelled.
5. The rest of the path is §3.1 steps 3–4.

How v0.3 reaches no projection:
1. `minutes-model-v03.mjs:71-78` keeps seasons **S = 2027 and S−1 = 2026 only**, so 2024-25 is never read.
2. No appearances means `W = 0` (`:124`), and `:127` gives expectedMinutes null.
3. `:180` and `:196`: `INSUFFICIENT_HISTORY`.

### 3.3 (c) Roster mapping, wrong id or team, two-way

**Zero cases at the primary rule.** The checks:

- **Id mismatch.** No no-projection player has a same-name corpus athlete under another id. Normalised names drop accents, suffixes and punctuation.
- **Ids are consistent across feeds.** 40 of 41 non-Out rookies on 10-21 (and 13 of 13 on 10-20) appear in the 2026-27 preseason box scores **under their roster id**.
- **Two-way status.** The free roster source does not expose it, so it is never inferred (`roster-gated-pool.mjs:21`). `roster-parse.mjs:37-55` keeps no two-way or draft field, and all 517 captured players are `rosterStatus: "Active"`.
- **One unresolved case:** Arthur Kaluma (LAL), with `experienceYears` 2 and no corpus minutes. This is probably two-way / G League time, but committed data cannot tell that from a corpus gap. He is not rotation under the primary rule (one preseason appearance).
- **Traded players are handled.** The last-team lookup (`roster-gated-pool.mjs:126-132`) carries history across teams: 85 `otherTeamHistory` rows on 10-21.

### 3.4 (d) Ruled out: correct, not a gap

`availabilityFromInjuries` marks a player Out when his injuries-feed status matches `/out/i` (`minutes-model.mjs:41-48`).
- `roster-gated-pool.mjs:122,133,138,150,157` then gives `OUT` with null minutes.
- `game-sim.mjs:94` lists him as `excludedOut`.

| Slate | Out | Out who would meet the primary rule | Out with no corpus history |
|---|---|---|---|
| 10-20 | 9 | 5 | 4 |
| 10-21 | 46 | 31 | 8 |

Ben Simmons (SAC) is Out and would be lagged under v0.4. He stays Out, which is correct.

### 3.5 Why the gap lasts all season for v0.1, and closes for v0.3

**v0.1 never closes it.** Its data rule is `corpus-v1` (`experimental-forecast.mjs:69`). The builder folds fetched box scores only when `dataRule !== "corpus-v1"` (`build-nba-experimental-forecasts.mjs:157-163`), and the corpus ends 2026-06-14. So for v0.1:
- every 2026-27 rookie stays `INSUFFICIENT_HISTORY` on every slate this season;
- so does every player whose last NBA game is before 2025-26.

The official player lane will therefore never show them. Changing that means changing the official composition, which only a founder-approved promotion can do. That is out of scope here.

**v0.3 closes it after the first game.** v0.3 folds the fetched 2026-27 box scores, and one regular-season appearance makes `expectedMinutes` finite (`minutes-model-v03.mjs:125-127,180`):
- the basis stays `insufficient` until 3 appearances;
- rates fall back to the team pool until then.

So from the first slate after a player's first 2026-27 game, v0.3 projects him from that game alone. The prior does not arrive until he has played.

### 3.6 An observability defect (reported, not changed)

The receipts' top-level `roster.playersOnRosterWithoutHistory` reads **0** on both slates, while `manifest.pool.playersInsufficientHistory` reads **49** on 10-21.
- The cause: `reconcileRoster` (`experimental-forecast.mjs:209-219`) compares the roster with the minutes rows, and for a roster-gated family those are the gated rows, which contain every rostered player.
- The field is a v0-era diagnostic. For roster-gated families, the true count is `pool.insufficientHistory`.
- Fixing it would change future receipt bytes, so it needs the same founder gate as any v0.1 change. It is not touched here.

---

## 4. The 11 pilot players

All are on the 10-21 captured roster and not Out. "PRIMARY" is the §1.2 rule.

| Player | Team | Cause | Evidence (pre-tip) | Code path | PRIMARY rotation | v0.3 replay | v0.4 replay |
|---|---|---|---|---|---|---|---|
| Cameron Boozer | MEM | (a) rookie | exp 0; preseason 4 apps, 20.3 mpg, 4 starts | §3.1 | yes | none | none |
| Keaton Wagler | LAC | (a) rookie | exp 0; preseason 3 apps, 27.0 mpg, 1 start | §3.1 | yes | none | none |
| Darius Acuff Jr. | SAC | (a) rookie | exp 0; preseason 4 apps, 24.0 mpg, 4 starts | §3.1 | yes | none | none |
| Yaxel Lendeborg | GS | (a) rookie | exp 0; preseason 5 apps, 23.2 mpg, 5 starts | §3.1 | yes | none | none |
| Darryn Peterson | UTAH | (a) rookie | exp 0; preseason 4 apps, 25.5 mpg, 4 starts | §3.1 | yes | none | none |
| Caleb Wilson | CHI | (a) rookie | exp 0; preseason 5 apps, 26.6 mpg, 5 starts | §3.1 | yes | none | none |
| Mikel Brown Jr. | BKN | (a) rookie | exp 0; preseason **1** app, 18 min | §3.1 | **no** (needs ≥ 2 preseason apps) | none | none |
| Kyrie Irving | DAL | (b) returner | 2024-25: 50 apps, 36.0 mpg (DAL); 2025-26: 0 rows | §3.2, same team | yes | none | **37.4 min** |
| Fred VanVleet | HOU | (b) returner | 2024-25: 60 apps, 35.2 mpg (HOU); 2025-26: 0 rows | §3.2, same team | yes | none | **27.7 min** |
| Damian Lillard | POR | (b) returner | 2024-25: 59 apps, 36.1 mpg (MIL); 2025-26: 39 DNP rows (POR) | §3.2, DNP-only same-team row; last team MIL | yes | none | **31.6 min** |
| Tyrese Haliburton | IND | (b) returner | 2024-25: 73 apps, 33.6 mpg (IND); 2025-26: 0 rows | §3.2, same team | yes | none | **28.2 min** |

The other 3 returners at 10-21 (Lyles, Niang, Beekman) and the other 34 rookies were not priced by the pilot.

---

## 5. Pilot context (descriptive; a line is not an outcome)

The PR 1179 report covers the 138 priced players who have an official projection, across all 11 games.
- The median of (v0.1 median − consensus line) is **−2.08 points**.
- **105 of 138** are below the line.

This is consistent with the PR 1178 minutes diagnosis, which the founder accepted: the uniform 240-minute rescale primarily, and the end-of-2025-26 trailing window secondarily.

**A line is not an outcome. This establishes nothing about accuracy.** The 11 players in §4 are outside that 138, because they have no projection to compare.

---

## 6. Options for a forward fix

All options follow v0.3's rules:
- a new family with structural rules only;
- no tuning on 10-20 or 10-21 outcomes;
- founder approval to arm;
- v0.1 and v0.3 byte-identical.

### A. Multi-season lookback for returners (lagged role prior)

**Prototyped as v0.4, §8.**

**Rule.**
1. The role-prior season is S−1 when the player has ≥ `MIN_GAMES_FOR_RATES` (3) regular-season appearances in it.
2. Otherwise it is the most recent of S−2 … S−`MAX_PRIOR_LAG` that has them.
3. Otherwise it stays S−1, which is v0.3 exactly.

The lagged season is used exactly as v0.3 uses S−1: worth `PRIOR_GAMES` = 10 appearances, blended toward the current season, with the coach's-decision play rate. There is no shrink or discount.

**Injury-gap rule.** The gap is bridged only when a whole season is missing or has fewer than 3 appearances. The 1–2 appearances of the skipped S−1 are dropped and recorded (`priorSeasonAppearancesSkipped`).

**Constants.**

| Constant | Status |
|---|---|
| `MAX_PRIOR_LAG = 2` | **New.** Structural: it bridges exactly one missed season, the observed returner pattern. corpus-v1 holds three regular seasons, so S−2 = 2024-25 is the oldest season that is only one season stale. Not fitted. **Needs founder approval.** |
| qualifying threshold 3 | Reuses the frozen `MIN_GAMES_FOR_RATES`. |
| prior strength 10 | Reuses v0.3's `PRIOR_GAMES`. |

**Data.** Committed only: corpus-v1 already holds 2023-24 and 2024-25. There is no new capture.

**Coverage on the 10-21 inputs:** 7 of 7 returners, 6 of 6 at the primary rule, and 4 of 4 pilot returners.

**Risks.**
- **Stale role after a major injury.** Lillard and Haliburton are back from Achilles injuries, Irving and VanVleet from ACL injuries. Minutes restrictions in a player's first weeks back are not modelled: the prior is the pre-injury role, and it washes out only as current-season games accrue.
- **Role change on a new team.** Lillard has moved MIL → POR. His history travels with him, as in v0.1.
- **Teammate redistribution.** Adding a 30–37 minute player to an over-full pool takes minutes from teammates through v0.3's water-fill. That is intended, but it changes their projections too (§8.4).
- **Age decline across two seasons** is not modelled.

### B. Rookie prior from draft slot

**Rule sketch.**
- The minutes and play-rate prior is the mean rookie-season regular-season minutes per appearance (and coach's-DNP rate) of earlier rookies in the same draft-slot bucket.
- Rates come from the rookie cohort, or from the existing team-pool fallback (`game-sim.mjs:100-106`).
- The prior is worth `PRIOR_GAMES` appearances, blended toward the current season.

**Data.** **Not committed.**
- The roster parser keeps no draft field (`roster-parse.mjs:37-55`), and raw roster payloads are not stored.
- ESPN's athlete endpoint is believed to expose draft year, round and pick. That is unverified here because this session used no network.
- The candidate needs draft slots for the 2026-27 rookies **and** for the 2023-24 … 2025-26 rookie classes, to fit the bucket means.
- That is a **new capture, so it needs founder / D-series approval**.

**Constants.**
- The bucket boundaries, for example picks 1–5, 6–14, 15–30, 31–60 and undrafted. These are **new and need founder approval**.
- The bucket means, derived from committed corpus data once draft slots exist. They need a recompute test, and they must be fitted on development seasons only.

**Risks.**
- Draft slot is not role. A lottery pick on a deep team plays less than a late pick on a rebuilding one: the 10-20 OKC rookies Mara, Stirtz and Dix all met the primary rule.
- Two-way and undrafted players get only the bucket mean.
- Three rookie classes are a small fit.

### C. Rookie prior from the 2026-27 preseason role

**Rule sketch.**
- The prior is the rookie's preseason minutes, mapped to regular-season minutes by a preseason → regular relation for earlier rookies.
- The relation is fitted on development seasons 2024 and 2025, and assessed on 2026.

**Data.** Committed and pre-tip: fetched 2026-27 preseason box scores, plus corpus preseason 2024–2026. On 10-21, 40 of 41 non-Out rookies have at least one preseason appearance; Joshua Jefferson has none.

**Governance blocker.**
- Preregistration §3 keeps preseason "a separate population end to end", including "its own minutes population".
- The founder's v0.3 decision also excluded preseason from the regular-season minutes estimate.
- Using preseason minutes as the input for a regular-season prior therefore needs a **§3 amendment**, even for players with no regular-season history.

**Constants.**
- The minimum preseason appearances (2 in the rotation rule here; **new**).
- The mapping's parameters (fitted, development seasons only, then frozen).

**Risks.**
- Preseason minutes are flatter: starters play 20–27 minutes.
- Coaches experiment in preseason.
- 4–5 games is a small sample.
- Exhibitions against overseas clubs are in the population. Karim Lopez's only corpus row is one.

### D. Depth chart or roster role

- **No NBA depth chart is committed.** The only depth-chart code is NFL (`app/scripts/nfl/acquire-depth-chart-research.mjs`).
- The roster capture holds position, jersey, `experienceYears` and `debutYear` (null for all rookies). None of these is a minutes signal.
- A depth-chart capture would be a new source, so it needs D-series approval. ESPN's NBA depth charts are editorial and can be stale.
- **Not recommended** as a first step.

### E. Role-blind cohort prior (rejected)

This would give every no-history player the same "rookie median" minutes. It is role-blind: the same number for the pick at slot 2 and for a two-way player. It would add a constant with no structural basis, and it would hide the gap instead of measuring it.

---

## 7. Recommendation

1. **Arm nothing tonight.** Record the measurement. Tell the founder about §3.5: the official v0.1 lane cannot project 2026-27 rookies or 2025-26 absentees at any point this season.
2. **Candidate v0.4 (option A), for a founder decision.**

   | | |
   |---|---|
   | Family | `v0.4` |
   | Model | `nba-experimental-v0.4-lagged-role-prior` |
   | Minutes model | `nba-minutes-model-v0.4-lagged-role-prior` |
   | Pool | `nba-roster-gated-pool-v0.4` |
   | Engine | `nba-sim-v0.3-conditional-minutes`, unchanged |
   | Alignment | `alignsWith: "v0.1"`, the same cutoff as v0.3 |

   - It inherits everything else from v0.3.
   - **One new constant, `MAX_PRIOR_LAG = 2`, needs founder approval. No new data.**
   - It is a successor challenger, so its forward shadow starts on its first frozen slate after arming. v0.3's shadow continues unchanged.
3. **Rookies: a founder decision on data before any design is frozen.**
   - **B (draft capture)** needs a new D-series capture authorization, with bucket constants approved.
   - **C (preseason role)** needs a preregistration §3 amendment.
   - My lean is B. It keeps §3 intact, and draft slot is a stable pre-season fact. Either way it would be a **separate** candidate (v0.5), so v0.4's attribution stays clean.
   - Until then, rookies stay `INSUFFICIENT_HISTORY` (null, never 0) in every family. v0.3 and v0.4 pick a rookie up after his first regular-season game (§3.5).
4. **Ask the release owner** whether to fix the receipt diagnostic in §3.6 in a separately versioned change. It is not part of this candidate.

---

## 8. The v0.4 prototype (unarmed)

### 8.1 Code

- **`app/src/lib/sports/nba/minutes-model-v04.mjs`** (new).
  - `indexRoleHistoryV04` calls v0.3's `indexRoleHistory` **unchanged**, then substitutes a lagged prior for athletes whose S−1 has fewer than 3 appearances.
  - `gatePoolV04` calls v0.3's `gatePoolV03` **unchanged** over that index, then re-stamps the versions and lists `gate.laggedPrior`.
  - `minutes-model-v03.mjs` and `game-sim-v03.mjs` are not edited. Their `FROZEN_SOURCES` sha256 test still passes.
- **`experimental-forecast.mjs`.**
  - `CANDIDATE_FAMILIES["v0.4"]` is added with `armed: false`.
  - `buildForecastArtifact` branches on `minutesRule === "v0.4-lagged-role-prior"`: the v0.4 index and pool, and the v0.3 engine.
  - **`FAMILIES` is unchanged**, so the pipeline, the forecast-window decision, the grader and the box-score fetch never see v0.4.
- **`minutes-model-v03.test.mjs`.** One assertion is updated. It said "CANDIDATE_FAMILIES is empty". It now says that v0.3 is not a candidate and that every candidate is unarmed. Nothing about v0.3's behaviour is asserted differently.
- **`build-nba-experimental-forecasts.mjs`.** A header comment is updated ("v0.4 today"). The logic is unchanged.
  - The existing guard refuses `--family v0.4 --write` without `--out`, and refuses an `--out` inside any `forecasts/`.

### 8.2 Tests (`minutes-model-v04.test.mjs`, 7)

- The frozen constant, the version strings and the unarmed spec. v0.4 is not in `FAMILIES`, and `owingFamilies` is unchanged.
- **The lagged prior** on synthetic history:
  - a player who missed S−1 takes S−2 (34 min, regular season only; a 48-minute playoff row and a 2-minute preseason row are excluded);
  - a thin S−1 (2 apps) is replaced;
  - S−3 is beyond the lag cap;
  - a rookie stays null;
  - a player with a qualifying S−1 gets v0.3's record and estimate field for field.
- **No leakage**: with the instant moved back, only games strictly before it count.
- **Byte identity, 10-20 and 10-21:**
  - every v0.1 game re-derives its committed `payloadSha256`;
  - every v0.3 replay game equals its sha256 computed **before** `minutes-model-v04.mjs` existed (origin/main @ `70a8e07017`, same committed inputs);
  - the v0.4 artifact carries the v0.4 stamps and v0.1's Elo.
- **The real builder:**
  - `--write` is refused (NOT ARMED);
  - `--out` into `experimental-v0.4/forecasts/` is refused, and nothing is created;
  - `--out` outside the repository writes a replay aligned with v0.1.
- **Isolation**: no lane, snapshot, product, route, Theater or component source names v0.4.

### 8.3 Byte identity of the official and challenger families

| Check | Result |
|---|---|
| v0.1, 14 of 14 committed games, `payloadSha256` | identical |
| v0.1 artifact head and every game's canonical JSON, before vs after (scratch run) | identical |
| v0.3 replay, 14 of 14 games, canonical-JSON sha256, before vs after | identical |
| v0.3 `FROZEN_SOURCES` (`minutes-model-v03.mjs`, `game-sim-v03.mjs`) | unchanged |

### 8.4 Descriptive replay on the 10-21 inputs

**REPLAY_NOT_PUBLISHED. Never forward evidence. Projection side only; no outcome.**

| Lagged player | Prior season | v0.4 expected minutes | v0.4 PTS p50 |
|---|---|---|---|
| Kyrie Irving (DAL) | 2024-25 | 37.4 | 25.0 |
| Damian Lillard (POR) | 2024-25 | 31.6 | 21.7 |
| Tyrese Haliburton (IND) | 2024-25 | 28.2 | 15.3 |
| Fred VanVleet (HOU) | 2024-25 | 27.7 | 10.8 |
| Georges Niang (GS) | 2024-25 | 22.5 | 9.9 |
| Trey Lyles (MIN) | 2024-25 | 17.1 | 5.2 |
| Reece Beekman (WSH) | 2024-25 | 9.0 | 1.0 |
| Ben Simmons (SAC) | 2024-25 | Out, not simulated | — |

**Teammates of a lagged player.**
- 95 of them shift by a median of −1.8 expected minutes. The largest shift is −6.4.
- This is v0.3's water-fill redistributing an over-full pool. It is intended, and it is a risk to watch.

**Opponents in the same game.**
- Their expected minutes are identical.
- Their PTS quantiles moved for 69 of 84 players. The cause is that the v0 draw model consumes one RNG stream per game across both sides, so a changed pool shifts the other side's draws. That is Monte Carlo noise, not a model change.
- This coupling exists in v0, v0.1 and v0.3 as well. It matters for any paired champion/challenger comparison.

**Games with no lagged player:** 106 projected players, identical in minutes and PTS p50. **On 10-20 no player is lagged**, so v0.4 equals v0.3 there.

---

## 9. Preregistration implications (DRAFT, not committed into the preregistration)

**Status of the dates.**
- 2026-10-20 and 2026-10-21 were **already an outcome look (look 8)**. Every v0.3 or v0.4 number for those dates is a replay, built after tip, so **never a forward-shadow sample** (§8).
- This investigation read **no outcome**: no final, no box score of a 10-20 or 10-21 game for evaluation, no grading.
- It read the receipts, their input blobs, the corpus, the pre-tip preseason box scores and the pilot report's **aggregates** of the 10-21 lines. A line is not an outcome.

**Disclosure.** The investigation was motivated by the market pilot: the 11 priced players without a projection.
- v0.4's rule was chosen on coverage and structure.
- Its one constant is the minimum lag that bridges one missed season.
- No rule or constant was changed after looking at any replayed projection.

### 9.1 Draft amendment text (§15)

> **§15. v0.4 lagged-role-prior candidate (founder decision YYYY-MM-DD; look 9).** Family `v0.4`, model version `nba-experimental-v0.4-lagged-role-prior`, minutes model `nba-minutes-model-v0.4-lagged-role-prior`, pool `nba-roster-gated-pool-v0.4` (`app/src/lib/sports/nba/minutes-model-v04.mjs`), engine `nba-sim-v0.3-conditional-minutes` (unchanged), `alignsWith: "v0.1"`.
>
> Everything in §14 applies unchanged except ONE rule: the role-prior season is S−1 when the athlete has ≥ `MIN_GAMES_FOR_RATES` (3) regular-season appearances in it; otherwise the most recent of S−2 … S−`MAX_PRIOR_LAG` that has them; otherwise S−1. The lagged season is weighted exactly as §14's S−1 (`PRIOR_GAMES` = 10). `MAX_PRIOR_LAG = 2` (structural: bridges one missed season; not fitted; approved by the founder for v0.4 ONLY).
>
> Rookies (no NBA history) remain `INSUFFICIENT_HISTORY` (null, never 0). A rookie prior is a separate candidate.
>
> **Frozen** at commit `<sha>` before its first forward slate; at arming, `minutes-model-v04.mjs`'s sha256 is added to `minutes-model-v04.test.mjs` (the v0.3 FROZEN_SOURCES practice). Any change is a new version. 2026-10-20 / 2026-10-21 are not v0.4 samples.
>
> **Arming** moves `v0.4` from `CANDIDATE_FAMILIES` to `FAMILIES`, with its own `experimental-v0.4/` forecasts and ledger and a reviewed workflow change. Its forward shadow starts on the first slate it freezes at v0.1's cutoff after arming. v0.3's shadow is unaffected.
>
> **Evaluation:** §6 minimums, §7 bars and §8 forward shadow, unchanged. The champion/challenger evaluator adds `v0.4` beside `v0.3` as a challenger to v0.1 on paired pre-tip rows. A direction is claimed only with a game-clustered interval excluding 0. Coverage is reported per family: players projected, `INSUFFICIENT_HISTORY` count, and played-but-unpredicted. Coverage is never folded into an accuracy bar.
>
> **No bar, threshold, metric, sample size, graded record or evaluation rule above changes.**

### 9.2 Draft look-log entry

> | 9 | 2026-10-22 | **No outcome; investigation (projection coverage gap) + proposed v0.4 candidate (§15, not armed).** Read: the frozen 2026-10-20 / 2026-10-21 v0.1 receipts (14 of 14 re-derived from their hashed roster / injury blobs); the corpus; the 2026-27 preseason box scores captured before each freeze; the PR 1179 pilot report's aggregates of the 10-21 PTS lines (a line is not truth). Finding: under a pre-tip rotation rule (prior regular-season ≥ 15 mpg over ≥ 10 apps, else ≥ 2 preseason apps ≥ 15 mpg), 6 of 71 (10-20) and 28 of 264 (10-21) active rotation players have no v0.1 projection: 22 + 6 rookies, 6 returners with no 2025-26 game, 0 mapping failures. v0.3 replays have the identical gap. v0.1's `corpus-v1` rule makes the gap season-long for the official family. v0.4's rule was chosen on structure; its one constant was not fitted to any outcome. 2026-10-20 / 21 were already an outcome look (look 8). | **No bar, threshold, metric, sample size, graded record or evaluation rule changed.** v0.1 and Elo stay official; nothing promoted; registry still `HISTORICAL_ONLY`. v0.4 is NOT ARMED. Its replays on 10-20 / 21 are descriptive and never samples. Investigation: `docs/nba/NBA_PROJECTION_COVERAGE_GAP_2026-10-22.md`. |

---

## 10. Risks and open items

1. **The official lane's gap lasts all season** (§3.5). This is a property of the frozen v0.1 data rule, not a bug that can be patched. Closing it means a promotion under §6–§8, or a separate founder decision on the official composition.
2. **Preregistration §9 availability HOLD.**
   - §9 holds a family whose availability misses exceed 15 % of its rows.
   - On 10-21, 49 of 334 not-Out rostered players (14.7 %) have no v0.1 projection.
   - If most of them play, played-but-unpredicted misses could approach that threshold for v0.1.
   - This was not computed: it would need outcomes, and none were read.
3. **A stale role for returners.** See §6.A. Watch v0.4's returners for over-projection in their first weeks back.
4. **Teammate redistribution and RNG coupling** (§8.4). Paired comparisons should cluster by game.
5. **The rotation rule is definitional.** Admitting preseason for rookies moves the count from 6 to 28 (§2.3). The primary rule is reported as one choice, not as truth.
6. **Kaluma (c)** is unresolved: two-way status is not captured.
7. **The workflows belong to the release owner.** If v0.4 is armed, its nightly build and grade lines are added in a reviewed workflow change, as for v0.3. No workflow is edited here.
8. **The v0.3 replay-identity reference depends on the committed fetched box scores** captured by each instant: 67, 67 and 70 docs, asserted in the test. If a fetched file is re-captured, the test's fold-count assertion reports it explicitly.

## 11. Reproduce

```
cd app
node scripts/nba/research/measure-nba-projection-coverage.mjs --dates 2026-10-20,2026-10-21 --out-dir <dir outside the repo>
npx tsx --test src/lib/sports/nba/minutes-model-v04.test.mjs
```
