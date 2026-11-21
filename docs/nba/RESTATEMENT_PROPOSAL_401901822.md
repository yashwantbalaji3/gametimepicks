# Restatement proposal — NBA 401901822 (CHA @ MEM, 2026-10-16 ET, 2026-27 preseason)

**Status: PROPOSAL ONLY. Nothing here is applied.** No committed file under `data/**` or `app/public/data/**`
was edited to write this. The game stays excluded pending verification, as the founder directed. Every
CORRECTION below is a draft for separate approval, and each one is append-only: it supersedes, it never
overwrites.

Founder direction (2026-10-20): *"keep excluded pending verification. Verify the authoritative final score and
player box score, document the original and corrected evidence, and show the exact affected grading records. Do
not silently rewrite historical results."*

Prepared 2026-10-20 on `origin/main` @ `fb19745ed2`. ESPN was re-checked read-only at **2026-10-20T23:52:33Z**.

---

## 1. Conclusion first

| Question | Answer |
|---|---|
| Which final does the evidence support? | **116–98 (MEM 116, CHA 98).** ESPN's current box score, linescore, scoreboard, summary header and core score all agree on it. |
| What is 117–98? | ESPN's **original** final. Our system first saw it at 2026-10-17T04:18:51Z, and it was the only value until at least 2026-10-18T00:15:54Z. |
| What changed? | Exactly one thing: **Zach Edey (MEM, athlete 4600663) went from FT 4-4 and 10 pts to FT 3-3 and 9 pts.** MEM's 3rd quarter went from 30 to 29 and MEM's team FT from 29-30 to 28-30. Nothing else in the 37-row box score changed. CHA is unchanged. |
| When did it change? | Between **2026-10-18T00:15:54Z and 2026-10-18T08:59:29Z**, about 22–31 h after ESPN's last play (2026-10-17T02:30:10Z). |
| Does the winner change? | **No.** MEM wins under both finals. |
| Confidence | **Supported, not independently confirmed.** ESPN's play-by-play still ends 117–98 and still has four made Edey free throws. The league's own CDN (cdn.nba.com) returned HTTP 403, so no second official source was obtained. |
| Recommendation | Treat **116–98 with the corrected box score** as authoritative, after one of these: (a) a human confirms against the NBA.com box score or game book, or (b) the founder accepts ESPN's corrected box score as the authority, which is the source the finals record already declares (`source: espn_scoreboard`). Until then the game stays excluded. |

The direction matters, because it is the reverse of what the record implies. The write-once finals record holds
**117** because it saw 117 first. The legacy grader's team-level numbers (from `results/latest.json`) already
use **116**, which the evidence supports. Its player rows, though, come from a box score fetched before the
correction (Edey 10). So the records that need a CORRECTION under the supported final are mainly the **finals
record row** and the **box score**, plus one player row per family. The team-level ledger numbers would only change if 117 were chosen (§5).

---

## 2. Committed evidence (every source in the repo)

All hashes are sha256 of the file bytes at `fb19745ed2`, unless marked as a historical blob.

### 2a. Schedule (pre-tip)

| Path | sha256 | Captured | Content for 401901822 |
|---|---|---|---|
| `app/public/data/nba/schedule/capture-2026-10-16T1355.json` (latest pre-tip capture of 33 that name the game) | `a19aea73331d96b07e2039e904a4a962aded2e9d896d2c0e32f6914171357168` | 2026-10-16T13:55:15Z | `STATUS_SCHEDULED`, tip `2026-10-17T00:00Z`, home MEM (team id 29), away CHA (30), FedExForum, seasonType 1 |

### 2b. Rolling results window (`app/public/data/nba/results/latest.json`), every commit that carries the row

| Commit | Commit time | Row `capturedAt` | Status | MEM–CHA | Blob sha256 |
|---|---|---|---|---|---|
| `3c92799fc7` | 2026-10-17T00:11:53Z | 00:11:52Z | IN_PROGRESS | 0–2 | `83faa560e1b7c7370a155ff6549cd73230c03b6acd267d80680a5b5fd58f6009` |
| `b74e72059b` | 2026-10-17T01:31:03Z | 01:31:02Z | IN_PROGRESS | 56–38 | `d3dbb1d4534eefdc459b7d747a2262122b74a1a88f308316fed5897c47f6c421` |
| `659bf0b23b` | 2026-10-17T04:18:52Z | 04:18:51Z | **FINAL** | **117–98** | `72024064656313ce63dcc0bbcabf3c970c3a59e5d2a71302c9b916c6646f9320` |
| `2c617c780c` | 2026-10-17T06:07:01Z | 06:07:00Z | FINAL | 117–98 | `d569a7941cff039bbc834a59e8e72662186867b0fb386cf5e4a3ce30a77c4220` |
| `d75e582c45` | 2026-10-18T00:15:55Z | 2026-10-18T00:15:54Z | FINAL | **117–98** (last) | `ecdfc9f5bc98446acec933237d269730e3cd7b0cc2fd1788905911c792caa09e` |
| `1a65a1aa9e` | 2026-10-18T08:59:30Z | 2026-10-18T08:59:29Z | FINAL | **116–98** (first) | `f2c60c20103d7c49e922334d0ad83f82a7d1e77cf3978ef6dcd36c17c18aebb6` |
| `754c466c4d` | 2026-10-19T00:27:25Z | 2026-10-19T00:27:24Z | FINAL | 116–98 | `09aa5aadddb64df67809ae9f0c082f7d246700a7172192f55d922c8ea31caf3f` |
| `11de662876` | 2026-10-20T00:04:31Z | 2026-10-20T00:04:30Z | FINAL | 116–98 | `9e544bf970ca92d0a3fdae8336c74ab98eb31158c8688f93f9f882a1c0cce064` |
| `9a9b42ab8b` | 2026-10-20T21:40:40Z | 2026-10-20T21:40:39Z | FINAL | 116–98 | `bab1952a11282aa6b6fe9d2cc880ea35f1dddc875be96c878b1d84d3eda3dd4f` (= current file) |

The command used was `git log -- app/public/data/nba/results/latest.json`, then `git show <c>:<path>` for each commit. Three FINAL observations say 117. All four later ones say 116. None goes back to 117.

### 2c. Write-once finals record (`app/public/data/nba/results/finals-2026-27.json`)

File sha256 now: `1989be8097ee042147af3b38a41962e98a2ce3b5315424641b8c784966d358cf`.

| Element | Content | Written by | Element sha256 (compact JSON, as stored) |
|---|---|---|---|
| `finals[61]` | `canonicalEventId nba:nba:2026-10-16:401901822`, `ftHome 117`, `ftAway 98`, `winnerSide home`, `statusRaw STATUS_FINAL`, `firstRecordedAt 2026-10-17T04:18:51Z`, `source espn_scoreboard`, phase PRESEASON | commit `659bf0b23b` (blob `d276e0bfa996de91e77928b6752dc5e6e49af514eeae338b480c1427b3c24c10`) | `b3d94c3f7700bedf87079fccf178efbd2e1d37d219dcef777c07670774cd609f` |
| `conflicts[0]` | `recorded 117–98`, `observed 116–98`, team ids 29/30 on both sides, `observedAt 2026-10-18T08:59:29Z`, note "the recorded final stands; review before any correction" | commit `1a65a1aa9e` (blob `b05ab456228ca3276bf9bf5da2c8b9270d5594ad31059c9fc8dd3cf260e6da5e`) | `04d16e5f296b2ac4a8d5fbe4e1716a3f4194dc9f8c6a3eb4f9a22d511ed7f366` |

### 2d. Box score (one copy only)

| Path | sha256 | Captured | Content |
|---|---|---|---|
| `data/internal/research/nba/experimental/boxscores/401901822.json` | `ff56514f8fe5aba38de192a2f607fb37455e98a02b64d22eaab63f3db1682574` (**verified**, matches the brief's `ff56514f…2574`) | `capturedAt 2026-10-17T12:55:18Z` (source `espn_summary`), committed `d0ae73829c` 2026-10-17T12:55:26Z | 37 player rows. Per-player points sum to **MEM 117 / CHA 98**, and 2·FGM + 3PM + FTM gives the same (MEM 37/14/29, CHA 31/10/26). Edey: 21 min, FG 3-5, FT **4-4**, **10 pts** |

No other copy exists. It is absent from the canonical corpus `data/internal/research/nba/boxscores/` (4,180 files),
from `experimental-v0.1/`, `experimental-v0.2/` and `experimental-v1/`, and there is no `boxscores/corrections/`
directory on main. The grader looks up all of them (`findBoxscore`), so all three families graded player rows from this one file.

### 2e. Other committed references (none of these is a grading record)

| Path | sha256 | What it says |
|---|---|---|
| `app/scripts/ops/fixtures/nba-finals-waiter/espn-nba-day-20261016.trimmed.json` (test fixture, recorded 2026-10-19T06:05Z) | `4dfb15de41ae7115dc64cb1f0775aa901d0737cc11d0450632b9ca8614f7f6e3` | 116–98. Its `_note` already names the conflict |
| `app/src/lib/ops/nba-finals-waiter.test.mjs` | — | asserts 116 from the fixture, and that the record holds the game AND has a conflicts entry (`held`) |
| `data/internal/research/nba/experimental/forecasts/2026-10-16.json` (v0) | `592467a8dacd7f75ad0c500ba292990a6e1c46caa28964c90b5252a8d2b0d148` | pre-tip forecast (inputAsOf 13:55:48Z). Inputs only, never restated |
| `data/internal/research/nba/experimental-v0.1/forecasts/2026-10-16.json` | `c0643568c53e21468ebe2a26fd71ff5f0e789ee1053d56c8a448534e62b1febc` | same |
| `data/internal/research/nba/experimental-v0.2/forecasts/2026-10-16.json` | `c99a6d24a716c08ed15eb9aecf06ca6068082b8e6d81fd502a0bce65fb7bbe3a` | same (inputAsOf 16:39:40Z) |

---

## 3. Read-only re-check against ESPN's free public endpoints

Retrieved **2026-10-20T23:52:33Z** with plain `curl`, no key. The responses were saved outside the repo, and only their hashes are recorded here.

| Endpoint | HTTP | Response sha256 | Final | Notes |
|---|---|---|---|---|
| `site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261016` | 200 | `d4a0e70382f6f74673afa2149ecf71d878a92cc452d69100caa43c7ef88f38af` | **MEM 116, CHA 98**, STATUS_FINAL | linescores MEM 23/27/29/37, CHA 20/18/24/36 |
| `site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401901822` | 200 | `1ccc0e7f02f76f048c4a22718f7d6c02671139dbf8ef9bb573b37adc9877c698` | header **116–98**, Final | see the breakdown below |
| `sports.core.api.espn.com/v2/.../events/401901822/competitions/401901822/competitors/29/score` | 200 | `ed2f954c0fdc64f8b4268ba81ee34636334d13363667573310c72abf289acbd7` | **116**, winner true | `source: Basic/Manual`. CHA's and two other games' scores show the same source, so it says nothing about this correction |
| `…/competitors/29/linescores` | 200 | `d4c93d42d60aac98805077017b066ba6c1ed19421378e0d048ef7d7182e876c2` | 23/27/**29**/37 | |
| `…/status` | 200 | `904253b38891bef54ef23e7565ec4fec351fc530d20f3ae7d7669a07f29c367a` | STATUS_FINAL, period 4 | no overtime |
| `cdn.nba.com/static/json/staticData/scheduleLeagueV2.json` (league source, tried for independent confirmation) | **403** | — | — | refused. No retry and no workaround was attempted |

**Summary breakdown (the same response):**

| Representation inside ESPN's summary | MEM | CHA | Agrees with |
|---|---|---|---|
| `header.competitions[0].competitors[].score` | 116 | 98 | 116 |
| Linescores (Q1–Q4) | 23 + 27 + **29** + 37 = 116 | 20 + 18 + 24 + 36 = 98 | 116 |
| Box score team totals (`PTS`, FT) | 116, FT **28-30** | 98, FT 26-30 | 116 |
| Sum of per-player `PTS` | **116** | **98** | 116 |
| Play-by-play: sum of `scoreValue` / End of Game row | **117** (Q3 = **30**) | 98 | 117 |
| Play-by-play: Edey free throws | 4 made (Q3 10:27 1-of-2 and 2-of-2; Q3 8:47 1-of-2 and 2-of-2) | — | 117 |
| `meta.lastUpdatedAt` | 2026-10-17T02:30:10Z, the last play's wallclock, so the play-by-play was not reprocessed | | |

**The full box score diff.** The current summary was re-parsed with the repo's own `parseSummary`
(`app/src/lib/sports/nba/boxscore-parse.mjs`), keeping the committed file's `capturedAt`, and compared field by
field with the committed box score. All 37 rows are present in both. **Exactly three fields differ, all on one
player:** Zach Edey `pts 10 → 9`, `ftm 4 → 3`, `fta 4 → 3`. That re-parse serialises (1-space JSON, as the
grader writes) to sha256 `2fb80f93f39825afe61374f89491bf4797f1a2511cb0254bcf63dfa16872dedc`. The real
correction file would carry its own `capturedAt` and therefore its own hash.

### Why 116 is the better-supported value

1. **Recency and direction.** 117 is ESPN's first value. 116 replaced it a day later, and every observation since (four committed captures over about 61 h, plus today's re-check) says 116. A correction made after the final, then held, is how box-score stat corrections behave. A transient glitch would be expected to revert.
2. **Internal consistency of the corrected record.** The header score, linescore, team totals, per-player sum and core score all move together: both FTM and FTA fall by one, in Q3, the quarter that holds both of Edey's trips. FG and 3P totals do not change. This is one coherent edit, not a stray digit.
3. **What disagrees is a stale view, not a competing correction.** The only ESPN representation still at 117 is the play-by-play, whose last update predates the correction. Play-by-play feeds are not normally restated after scorer corrections.
4. **What is missing.** There is no league-side source. NBA.com returned 403 and was not pursued. ESPN is one provider, and its play-by-play contradicts its box score. That is why the conclusion is "supported, not independently confirmed", and why a human check is asked for before anything is applied.

---

## 4. Exactly which committed grading records reference this game

The search covered every file in the repo. `git grep -l 401901822` returns 42 files: 33 schedule captures, 2 results files, 1 fixture, 1 test, 3 forecasts, 1 box score and **3 ledgers**. The ledgers were then checked by content.

| Ledger | sha256 | References | Location | Row sha256 (compact JSON) |
|---|---|---|---|---|
| `data/internal/research/nba/experimental/ledger.json` (family **v0**, PREREGISTERED_SHADOW) | `3078ed3c150e159618819c39078e7d1205d0036b96352b6f39d747e93c55093f` | **1 game row** | `entries[13]` (date key `2026-10-16`, gradedAt 2026-10-20T14:17:02Z) → `games[6]` | `c4ea9eba19ddf4b16d802499323d59e97096ed07f28d75ec0a1c96dacd1b8b1b` |
| `data/internal/research/nba/experimental-v0.1/ledger.json` (**v0.1**, CHAMPION) | `0a72708b53c9eced5311ffef2c4f49b424a200311923f2663758987d7f524941` | **1 game row** | `entries[13]` (`2026-10-16`) → `games[6]` | `1a2f3508044707b44396aa23e48ad7207066503947e8f7afd7b3ab74f2a8abbc` |
| `data/internal/research/nba/experimental-v0.2/ledger.json` (**v0.2**, CHALLENGER) | `cdba23acb3f764190b774d42f29ee6007a8713bf0c0a178f1be0bbb0e289d9a2` | **1 game row** | `entries[9]` (`2026-10-16`) → `games[6]` | `fa840bf08b9b4e1ec1468cb1d1e67c21763ee5364c695eb878a25b473b734fc8` |
| `data/internal/research/nba/experimental-v1/ledger.json` (v1) | `9d4171cb5acfff6d41c8e41ae9ef953f7b45b5c2787e97f0593b7b6a6ff7884b` | 0 | only a 2026-10-20 entry | — |
| `data/internal/research/nba/top-boards/v1/ledger.json` | — | 0 | all 40 entries are 2026-10-20 | — |
| `data/internal/research/nba/top-boards/v0.1/ledger.json` | — | 0 | all 40 entries are 2026-10-20 | — |
| `data/internal/research/nba/experimental-public-audit/2026-10-20.json` | — | 0 | 2026-10-20 games only | — |

**Count: 3 game-level grading records** (one per family v0, v0.1 and v0.2). Two kinds of derived aggregate
depend on each of them: that entry's `summary`, and the ledger's cumulative `validation` block. That makes 3 + 3
aggregates. The two source records under review are the finals row and the box score.

**Reproduction check.** For each of the three families, the committed forecast was re-graded with the repo's
`gradeForecastGame` (final 116–98 `results-capture` plus the committed box score). The result is byte-identical
to the committed row (`replayEqualsRecorded: true` ×3). So the what-if numbers below come from the same code that
wrote the ledgers. The re-grade ran in memory and nothing was written.

**What each row was graded from today:** `final: {ftHome: 116, ftAway: 98, source: "results-capture"}`, which
is `latest.json` and **not** the finals record. Player rows come from the pre-correction box score (Edey 10 pts).
**On main this game is not excluded from these three ledgers.** It is `graded: true` and counted in each summary
and validation block. Exclusion exists today only in the finals waiter (`held`, `nba-finals-waiter.mjs`) and in
unmerged PR 1154 (`underReviewIds` / `isDisputedFinal`, which keeps the game out of new entries and out of metrics).

### 4a. Fields per record that would change

The winner does not change in any family under either final (`y = 1`, every Brier, log loss and hit is unchanged).

**Under the supported final: 116–98 with the corrected box score (Edey 9 pts, FT 3-3)**

| Record | Field | Now | Would become |
|---|---|---|---|
| v0 `entries[13].games[6]` | `players.playedButUnpredicted[2].pts` (Edey, not predicted) | 10 | 9 |
| v0 | team score, intervals, summary, validation | — | **no change** (already graded at 116) |
| v0.1 `entries[13].games[6]` | `players.playedButUnpredicted[1].pts` (Edey) | 10 | 9 |
| v0.1 | everything else | — | **no change** |
| v0.2 `entries[9].games[6]` | `players.rows[3]` (Edey, predicted) `conditional.pts` | 0.5462 | **1.5462** |
| v0.2 | `players.rows[3].unconditional.pts` | 3.59 | **2.59** |
| v0.2 | `players.rows[3].inside80.pts` / `atOrAboveMedian.pts` | 1 / 1 | 1 / 1 (no change) |
| v0.2 `entries[9].summary["NBA PRESEASON — EXPERIMENTAL"].players` | `conditionalMAE.pts` | 3.5516 | 3.5547 |
| v0.2 | `unconditionalMAE.pts` | 4.6871 | 4.6840 |
| v0.2 `validation` | — | — | **no change** |
| finals record `finals[61]` | `ftHome` (margin 19 → 18, total 215 → 214; winnerSide stays home) | 117 | 116 (by CORRECTION, §6) |
| box score | Edey `pts` / `ftm` / `fta` | 10 / 4 / 4 | 9 / 3 / 3 (by correction file, §6) |

**Under 117–98 (the recorded final, as the brief asked), committed box score unchanged**

| Record | Field | Now (116) | Under 117 |
|---|---|---|---|
| v0 `games[6]` | `final.ftHome` | 116 | 117 |
| | `score.homeErr` / `homeAbsErr` (sim home mean 117.48) | 1.48 / 1.48 | 0.48 / 0.48 |
| | `score.marginErr` / `marginAbsErr` (sim margin −8.39) | −26.39 / 26.39 | −27.39 / 27.39 |
| | `score.totalErr` / `totalAbsErr` (sim total 243.36) | 29.36 / 29.36 | 28.36 / 28.36 |
| | `intervals.margin.actual` / `intervals.total.actual` | 18 / 214 | 19 / 215 |
| | `intervals.total.inside80` (p10 = 215) | **0** | **1**, the only categorical flip |
| v0 `entries[13].summary` | homeMAE / marginMAE / marginBias / totalMAE / totalBias | 9.7225 / 13.655 / −6.0517 / 16.4175 / −3.9458 | 9.6392 / 13.7383 / −6.135 / 16.3342 / −4.0292 |
| v0 `validation.byLabel[PRESEASON]` | margin.mae / margin.bias / total.mae / total.bias / **total.coverage80** | 13.7654 / −1.5265 / 18.6939 / 3.1094 / **0.8148** | 13.7839 / −1.545 / 18.6754 / 3.0909 / **0.8333** |
| v0.1 `games[6]` | homeErr / marginErr / totalErr (abs the same magnitude) | 5.18 / −5.92 / 16.28 | 4.18 / −6.92 / 15.28 |
| | margin.actual / total.actual (inside80 stays 1 / 1) | 18 / 214 | 19 / 215 |
| v0.1 `entries[13].summary` | homeMAE / marginMAE / marginBias / totalMAE / totalBias | 10.8533 / 14.2525 / −0.6975 / 21.2075 / 0.4225 | 10.77 / 14.3358 / −0.7808 / 21.1242 / 0.3392 |
| v0.1 `validation` | margin.mae / margin.bias / total.mae / total.bias | 18.2615 / −1.8106 / 22.1862 / 10.2813 | 18.2804 / −1.8294 / 22.1674 / 10.2625 |
| v0.2 `games[6]` | homeErr / marginErr / totalErr | 6.31 / 11.51 / 1.11 | 5.31 / 10.51 / 0.11 |
| | margin.actual / total.actual (inside80 stays 1 / 1) | 18 / 214 | 19 / 215 |
| v0.2 `entries[9].summary` | homeMAE / marginMAE / marginBias / totalMAE / totalBias | 12.1533 / 14.1892 / −8.3958 / 11.9758 / −7.5075 | 12.07 / 14.1058 / −8.4792 / 11.8925 / −7.5908 |
| v0.2 `validation` | margin.mae / margin.bias / total.mae / total.bias | 35.5582 / −3.705 / 110.4761 / −106.6045 | 35.5318 / −3.7313 / 110.4497 / −106.6308 |

(Player rows do not change under "117 + committed box", because the box score is already the 117 version.)

The combined case "117 with a 117 box" is the committed box, so the table above covers it. The inconsistent case
"116 team score with the 117 box" is what the ledgers hold **today**. Both corrections in §6 fix that mismatch
in one direction.

---

## 5. Why not restate to 117

Restating to 117 would mean overriding four consecutive ESPN observations and today's re-check with ESPN's
first, superseded value. It would make the ledgers' team scores disagree with the provider's current box score,
and the v0 total interval would flip from a miss to a hit (coverage 0.8148 → 0.8333) on the strength of a free
throw the provider has since removed. That direction is not supported unless a league source shows 117.

---

## 6. The proposed restatement (append-only CORRECTIONs, draft, not applied)

### Preconditions (each is its own approval)

1. **Verification.** Option (a): a human confirms 116–98 and Edey FT 3-3 against NBA.com's box score or game book. Option (b): the founder records that ESPN's corrected box score is authoritative for this game. The evidence fields below must cite whichever was used.
2. **An append-only path exists.** On main the v1 grader *replaces* a date's entry when it re-grades (`grade-nba-experimental-forecasts.mjs`, "re-grading a date replaces its entry"). Running it now **would be exactly the silent rewrite the founder forbade.** The ledger CORRECTIONs below therefore require PR 1154's schema 2: frozen legacy `entries`, an append-only `gradeEntries` list with `INITIAL / PENDING_RESOLVED / CORRECTION` lineage, `supersedes`, the `BOXSCORE_CORRECTION` cause, and `<family>/boxscores/corrections/<id>.<hash12>.json` beside an original that is never rewritten. PR 1154 says it does not restate 401901822 and leaves it to the founder.
3. **A finals-record correction mechanism.** None exists on main or on any branch reviewed here. `finals-record.mjs` is write-once with `conflicts` only, and `finalFor` answers `FINAL_UNDER_REVIEW` for this game. The proposal below adds a `corrections` array. It needs a small reviewed code change so that `finalFor` returns the superseding value and the conflict resolves. That change is not part of this PR.

### C-1 · Finals record CORRECTION (appended to a new `corrections` array; `finals[61]` stays byte-identical)

```json
{
  "kind": "FINAL_CORRECTION",
  "correctionId": "nba-final-correction:401901822:1",
  "providerEventId": "401901822",
  "canonicalEventId": "nba:nba:2026-10-16:401901822",
  "supersedes": {
    "path": "app/public/data/nba/results/finals-2026-27.json",
    "element": "finals[61]",
    "rowSha256": "b3d94c3f7700bedf87079fccf178efbd2e1d37d219dcef777c07670774cd609f",
    "recorded": { "ftHome": 117, "ftAway": 98, "winnerSide": "home", "firstRecordedAt": "2026-10-17T04:18:51Z" }
  },
  "corrected": { "ftHome": 116, "ftAway": 98, "winnerSide": "home" },
  "resolvesConflict": { "element": "conflicts[0]", "sha256": "04d16e5f296b2ac4a8d5fbe4e1716a3f4194dc9f8c6a3eb4f9a22d511ed7f366" },
  "reason": "Provider post-game correction: one Zach Edey (4600663) free-throw attempt removed (FT 4-4 → 3-3, 10 → 9 pts; MEM Q3 30 → 29). Observed 117 from 2026-10-17T04:18:51Z to 2026-10-18T00:15:54Z, 116 from 2026-10-18T08:59:29Z onward.",
  "evidence": [
    { "ref": "latest.json @ d75e582c45 (last 117)", "sha256": "ecdfc9f5bc98446acec933237d269730e3cd7b0cc2fd1788905911c792caa09e" },
    { "ref": "latest.json @ 1a65a1aa9e (first 116)", "sha256": "f2c60c20103d7c49e922334d0ad83f82a7d1e77cf3978ef6dcd36c17c18aebb6" },
    { "ref": "latest.json @ 9a9b42ab8b (116, 2026-10-20)", "sha256": "bab1952a11282aa6b6fe9d2cc880ea35f1dddc875be96c878b1d84d3eda3dd4f" },
    { "ref": "ESPN scoreboard 20261016, retrieved 2026-10-20T23:52:33Z", "sha256": "d4a0e70382f6f74673afa2149ecf71d878a92cc452d69100caa43c7ef88f38af" },
    { "ref": "ESPN summary 401901822, retrieved 2026-10-20T23:52:33Z", "sha256": "1ccc0e7f02f76f048c4a22718f7d6c02671139dbf8ef9bb573b37adc9877c698" },
    { "ref": "independent confirmation (precondition 1)", "sha256": null }
  ],
  "approvedBy": null,
  "approvedAt": null,
  "appliedAt": null
}
```

### C-2 · Box score correction (new file beside the original; the original is never rewritten)

- **Store at:** `data/internal/research/nba/experimental/boxscores/corrections/401901822.<hash12>.json`, the PR 1154 layout. This is the fresh ESPN summary parsed by `parseSummary` with its own `capturedAt`.
- **Log entry** (PR 1154 `boxscoreCorrections`):
  - `oldSha256 ff56514f8fe5aba38de192a2f607fb37455e98a02b64d22eaab63f3db1682574`
  - `newSha256` = the stored file's hash
  - `diff`: `[["4600663","pts",10,9],["4600663","ftm",4,3],["4600663","fta",4,3]]`
  - `cause BOXSCORE_CORRECTION`
- **Verification:** today's same-`capturedAt` re-parse hashes to `2fb80f93…dedc`, and the stored file's diff must equal exactly these three fields.

### C-3 · Ledger CORRECTIONs, one per affected record (3), in PR 1154 `gradeEntries`

Each is appended with `lineage: "CORRECTION"` and `supersedes: <seq of that game's INITIAL gradeEntry>`. Those seqs come
into existence only when PR 1154 migrates the legacy entries. Until then, each one is pinned by its legacy
coordinates and row hash:

| Family | Supersedes (legacy coordinates · row sha256) | cause | Payload change (exactly) | Evidence |
|---|---|---|---|---|
| v0 | `experimental/ledger.json` `entries[13].games[6]` · `c4ea9eba…8b1b` | `BOXSCORE_CORRECTION` (+ final source → `finals-record:2026-27` via C-1) | `playedButUnpredicted[2].pts` 10 → 9. Team-level fields stay identical (116) | C-1, C-2 |
| v0.1 | `experimental-v0.1/ledger.json` `entries[13].games[6]` · `1a2f3508…abbc` | same | `playedButUnpredicted[1].pts` 10 → 9 | C-1, C-2 |
| v0.2 | `experimental-v0.2/ledger.json` `entries[9].games[6]` · `fa840bf0…fc8` | same | `rows[3].conditional.pts` 0.5462 → 1.5462, `rows[3].unconditional.pts` 3.59 → 2.59. Derived: summary `conditionalMAE.pts` 3.5516 → 3.5547, `unconditionalMAE.pts` 4.6871 → 4.6840 | C-1, C-2 |

Every CORRECTION carries `reason` (as in C-1), `evidence` (the C-1 hashes plus the C-2 old and new hashes),
`gradedAt` (the apply time) and `graderVersion` (`nba-experimental-grader-2`). Aggregates (`summary` and
`validation`) are recomputed from the superseding rows, never edited in place.

**Apply check (for the session that applies it):**

- The legacy `entries` arrays are byte-identical before and after.
- Exactly 3 `gradeEntries` are appended, plus 1 finals correction and 1 box score correction file.
- `experimentalLedgerAppendOnlyViolations` is empty.
- The re-grade of the corrected inputs reproduces the "would become" column of §4a exactly.

---

## 7. What does NOT change

- **The winner, in every record and family.** MEM wins under both finals. Every winner Brier, log loss, hit and accuracy, for Elo and sim alike, is unchanged.
- **The forecasts.** All three 2026-10-16 forecast artifacts are pre-tip inputs and are never restated.
- **`finals[61]`, `conflicts[0]` and every historical `latest.json` blob.** They stay byte-identical, because they are observations. The correction sits beside them.
- **The committed box score file** (`ff56514f…`). A correction is added next to it.
- **The v1 family, both top-board ledgers and the public-audit file.** None of them references this game.
- **The two CHA-side figures and every other player row.** Only Edey's three fields differ.
- **Anything public.** These are PRIVATE_RESEARCH, `productEligible: false` ledgers. No published page, pick or receipt depends on this game.
- **Exclusion.** The game stays excluded until the founder approves the restatement. This proposal recommends that the grader on main stop counting it until then. PR 1154 already does that: "a final under review gets no entry and is excluded everywhere".

## Addendum: NBA.com check (2026-10-21, about 00:25Z, read-only in a browser)

This was read by the coordinator session in the in-app browser, from NBA.com's own game page data. NBA game id is `0012600059`, the page is https://www.nba.com/game/cha-vs-mem-0012600059/box-score, and the status reads "Final".

| Field | NBA.com value | Sums to |
|---|---|---|
| Headline score | MEM **116** – CHA 98 | n/a |
| MEM period scores | 23 / 27 / 30 / 37 | **117** |
| MEM player points (sum of player rows) | n/a | **117** |
| Zach Edey | **10** pts, FT **4 / 4** | n/a |
| MEM team FT | 29 / 31 | n/a |
| CHA periods and player sum | 20 / 18 / 24 / 36 | 98, consistent |

**Reading:**
- NBA.com is **internally inconsistent**. Its headline says 116, while its own periods and box score sum to 117 and match our committed box score (sha256 `ff56514f…2574`).
- ESPN has since moved its box score to 116 (Edey 9 pts, 3 / 3 FT).
- So no source gives an internally consistent 116. NBA.com does **not** independently confirm 116–98.

**Recommendation:** keep 401901822 on HOLD (excluded from metrics, nothing restated). Ask for a human check of the official NBA game book or stats correction notice, or a founder ruling on which source is authoritative, before any correction is drafted for application. The winner (MEM) is the same either way.
