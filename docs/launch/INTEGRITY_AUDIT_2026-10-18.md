# Data-integrity audit: Production after the 10-18 release

- **Production:** `https://gametimepicks.yashwantbalaji.com`. `/data/build-info.json` reports commit `05c9deea4f383bb19578e4537417e292cbaa07e3`, built `2026-10-18T04:51:24Z` (ET day 2026-10-18).
- **Repo reference:** `origin/main` = `05c9deea4f` (fetched for this audit). The commit just before the release is `5fbf5889ec`.
- **Audit time:** about 05:20Z on 10-18. Every page and JSON file was fetched once.
- **Method:** read-only. The audit used `curl` against public pages and `/data/...` files, `git show`/`git log` on `origin/main`, and Python recomputation in a temporary directory. It ran no builds, tests, workflows or `/api/ask`.
- **Release scope:** `git diff --name-only 5fbf5889ec 05c9deea4f` changes 126 files and **0** files under `data/`, `app/public/data/` or `pipeline/validation/`. This confirms that the release changed no data paths.

## Summary

| # | Check | Verdict | One-line evidence |
|---|---|---|---|
| 1 | Forecast Record page vs ledger | **PASS** | The page shows 16,319 published, 12,574 measured (77.0%), 32 not final and 3,713 void or not measurable. Recomputing from `v1/*.jsonl` gives exactly the same figures, and all 5 sport sub-lines and 10 pick-record lines match. |
| 2 | Historical immutability | **PASS** | The ledger is byte-identical between `5fbf5889ec` and `origin/main`. Across 16 ledger states (10-10 to 10-18) there were 0 missing rows and 0 frozen-field changes. The only mutations were 20 `PENDING→SETTLED` and 751 `PROVISIONAL→CANONICAL`. |
| 3 | No post-event information in pregame records | **PASS** (with a coverage caveat) | 0 of 15,314 timestamped rows have `publishedAt ≥ eventStart`, and 0 of 823 rows settled since 10-11. `frozenAt` is null on every ledger row, and 1,005 rows have no `publishedAt` (see the caveat). |
| 4 | Pending is never a loss | **PASS** | No PENDING row carries a W/L. TB@CLE 849816 (10-17) is not graded on any surface: it is absent from the ledger, the game-call grades, settled leans, `/results/` and `/results/date/2026-10-17/`. |
| 5 | Void and postponed handling (10-16) | **PASS** (one LOW display defect, D-2) | `model-rows/2026-10-16.json` shows 41 rows, all `void`, with W 0, L 0. `/results/date/2026-10-16/` shows 0–0 · 41 void. 10-16 adds only to the void count in every window. |
| 6 | Results pages agree with records (MLB, NFL) | **PASS** | MLB game calls: 7-day 9–9, Season 1,313–1,098–38 pushes. NFL winners: 7-day 1–1, Season 70–50, 3 void. Both match the public JSON exactly. |
| 7 | Ask GameTime consistency | **FAIL, LOW** (D-1) | MLB, UFC and the full forecast record (25 families) match. EPL does not: Ask's headline cell shows **27–33**, while `/results/` Season and All show **27–34**. |
| 8 | NFL and UFC | **PASS** | NFL: next game HOU@JAX 401872996 at 13:30Z, and all 13 forecasts were frozen at 22:55:19Z before kickoff. Lifecycle: 13 UPCOMING, 1 SETTLED. UFC: the 10-17 card is labelled FOUGHT, and its grading is pending the 08:00Z job. |

## Flagged items

### D-1: FAIL (LOW): The EPL headline record disagrees across public surfaces (Check 7)

- **What:** Newcastle United v Aston Villa (10-17, kickoff 16:30Z, graded LOSS at `22:49:24Z` by the `7597ffecab` matchweek refresh) is missing from `app/public/data/epl/graded-picks.json`. That file was generated `2026-10-17T18:01:05Z` by nightly-settle `0331be422a` and contains 60 picks: 27 hits, 33 misses.
- **Surfaces showing 27–33 (60 graded):**
  - Ask `/data/ask/v1/results.json` cell `forecast:epl:-:LIVE_LEDGER:graded-picks` (won 27, lost 33, asOf 18:01:05Z);
  - Ask `recent.epl`, which lists only four 10-17 matches;
  - `/results/picks/epl/` ("27 hit · 33 missed", without the Newcastle row);
  - `/data/epl/graded-picks.json`.
- **Surfaces showing 27–34 (61):**
  - `/results/` overview, Season and All windows, built from `graded-forecasts.jsonl` through `resultsV2Populations()`. The 7-day window shows 2–4.
  - `/results/date/2026-10-17/`, which shows 2–3 with Newcastle v Aston Villa as a Loss;
  - Ask's own `days[2026-10-17]`, which also lists 5 matches. Ask therefore contradicts itself.
- **Not affected:** No outcome is wrong; the issue is lag. The Forecast Record (ledger built 18:02Z) does not include 10-17 EPL at all, which is consistent with its documented one-cycle lag.
- **Severity: LOW.** One decisive match is involved, and no outcome is misreported. The gap fixes itself when the next nightly-settle rebuilds `graded-picks.json`, about 09–13Z on 10-18. It will recur every matchday on which a match is graded after that day's nightly settle, typically a late Saturday kickoff.
- **Proposed fix (proposal only):**
  - Rebuild the EPL `graded-picks.json` (`app/scripts/sports/build-graded-picks.mjs`, EPL only) in the same workflow step that appends to `graded-forecasts.jsonl`, i.e. the epl matchweek refresh and epl-settle.
  - Alternatively, have the Ask build derive its EPL cell from the same `eplPicks()` owner the `/results/` overview uses at build time, rather than from the committed aggregate.
  - Add a build-time assertion that the `graded-picks.json` counts equal the `resultsV2Populations()` all-window counts for each sport.

### D-2: Display defect (LOW): `/results/mlb/` labels void rows as "Push" and a postponed game as "final" (related to Check 5; the check itself passes)

- `/results/mlb/` (source `app/src/app/mlb/results/page.tsx`, about lines 172–177) maps every outcome other than Win or Loss to `"push"`. As a result, the 41 postponed-game rows render as "Push 849817", even though the owner row says `"outcome": "Void"` and the by-game summary on the same page says "41 void".
- The stat panel shows "Final games settled 1 of 1 on slate · Pending games 0 · all final" for a game that was postponed, not played. "Stat unavailable 1 · player didn't appear" is also misleading.
- The owner rows in `pipeline/validation/mlb_settled_leans.jsonl` carry `voidReason: "no plate appearance (DNP / 0-AB)"` for all 41. For a postponement, that reason is inaccurate.
- **Counting is correct:** W 0, L 0, nothing added to any denominator.
- **Severity: LOW.** The labels are wrong, but no number is.
- **Proposed fix:**
  - Map `Void` to its own `"void"` result in that page's row mapper, rendered as "Void".
  - Count postponed games separately from finals in the comparison-report stat panel.
  - Have `settle_mlb_results.py` write a postponement `voidReason` when the game status is Postponed.

## Details and evidence

### 1. Forecast Record (`/results/forecasts/`) vs the ledger: PASS

- **How the page gets its data:** `app/src/app/results/forecasts/page.tsx` → `forecastRecordView()` (`app/src/lib/results/v2/forecast-ledger-reader.ts`) reads `data/internal/forecast-ledger/v1/*.jsonl` at build time → `statusCounts()` in `forecast-record.mjs`.
- **Definitions** (`statusCounts`):
  - **measured** = rows with `measurement.type` set. Every one of them is `SETTLED`: 12,574 SETTLED and measured, with no other state measured.
  - **not final** = `PENDING` and unmeasured.
  - **void** = `VOID`.
  - **not measurable** = the rest, i.e. `NO_MEASUREMENT`.
  - The page's "void or not measurable" tile is VOID + NO_MEASUREMENT = 3,038 + 675 = 3,713. "Measured" therefore does not include VOID pushes, even though those pushes appear in pick records as the third number.

| Figure | Page (Production) | Recomputed from `origin/main` ledger | Manifest |
|---|---|---|---|
| Forecasts published | 16,319 | 16,319 | 16,319 |
| Measured | 12,574 (77.0%) | 12,574 (0.7705) | SETTLED 12,574 |
| Not final | 32 | 32 | PENDING 32 |
| Void or not measurable | 3,713 | 3,038 + 675 | VOID 3,038 · NO_MEASUREMENT 675 |
| Sports · types | 5 · 25 | 5 · 25 | — |
| Last settled | Sat, Oct 17 | `2026-10-17T16:38:04Z` | — |

Per-sport sub-lines on the page are identical to the recomputation:

| Sport | Measured | Not final | Void or not measurable |
|---|---|---|---|
| NFL | 3,912 | 25 | 755 |
| MLB | 5,104 | 7 | 77 |
| EPL | 3,460 | 0 | 2,880 |
| Ligue 1 | 28 | 0 | 0 |
| UFC | 70 | 0 | 1 |

All 10 pick-record lines on the page are equal to the directional counts recomputed from the ledger:

| Family | Record(s) |
|---|---|
| Receptions | 229–209 |
| Receiving yards | 215–222–1 |
| Rushing yards | 84–67 |
| Game winner | 61–44 (historical model-favored) and 9–6 (published pick) |
| Moneyline | 418–400 |
| Run line | 510–300 |
| Total runs | 380–395–38 |
| Run line (posted) | 5–3 |
| UFC | 44–26 |

The public projections the page links to also match:
- `/data/forecast-record/v1/mlb-mlb-moneyline.csv` has 818 rows and `nfl-nfl-game-winner.csv` has 128. In both, the forecastId set equals the ledger's, with 0 probability mismatches and 0 `publishedAt` mismatches.
- `/data/ask/v1/forecast-record.json` kpis match all of the above, and all 25 per-family count blocks match the ledger (0 mismatches).

### 2. Historical immutability: PASS

- **Release boundary:** all five `v1/*.jsonl` files are byte-identical between `5fbf5889ec` and `origin/main` (`cmp`).
- **7-day first-parent history:** the audit used every ledger-writing commit on first-parent `origin/main` since 10-10 (`git log --first-parent -- data/internal/forecast-ledger/v1/`) as sample points, 16 states in all. They were: `0a5100c84f` (10-10 11:39 ET, the baseline before the window), `d2fd7ffcc3`, `bd40e3d2be`, `c7e361d8ec`, `3e7d358432`, `825f9de8e3`, `3ab571e45d`, `5de15b75ea`, `0a021cf57c`, `a5269d86a9`, `932a766f65`, `0c7d0e2085`, `5f88633538`, `467814c3ec`, `4a6f8b2713` (10-17 14:02 ET), and `5fbf5889ec` → `origin/main`.
- **What was compared:** each consecutive pair, keyed by `forecastId`, over all 29 `IMMUTABLE_FIELDS` from `contract.mjs`, publication status, settlement outcome, finality, `settledAt`, `source`, `corrections`, measurement, display and metadata fields.
- **Results:**
  - Missing rows: **0** in every step. Rows grew from 13,792 to 16,319 (+2,527, append only).
  - Frozen-field changes, including forecast values, `publishedAt`, `frozenAt` and `modelVersion`: **0**.
  - `PENDING → SETTLED`: 5 + 5 + 5 + 5 = **20** rows, at `825f9de8e3`, `3ab571e45d`, `0a021cf57c` and `467814c3ec`.
  - `PROVISIONAL → CANONICAL`: 591 + 54 + 50 + 56 = **751** rows. The last 56 (at `4a6f8b2713`) are all SEA@DEN 401872995. All 61 SEA@DEN rows are now CANONICAL (51 SETTLED, 10 NO_MEASUREMENT).
  - Any other mutation (outcome rewrite, settledAt or source change, measurement change, display change): **0**. There is nothing to quote verbatim.
- **Endpoint check:** every one of the 13,792 rows present at 10-10 is byte-identical on `origin/main`.

### 3. No post-event information in pregame records: PASS (with a coverage caveat)

Tested on **all** rows, not just a sample:

| Population | Checked | Violations |
|---|---|---|
| All rows with both `publishedAt` and `eventStart` | 15,314 | **0** |
| Rows settled or voided since 10-11, by sport | NFL 743 (lead time min 4.8 min, median 6.9), MLB 48 (min 12.7 min), EPL 32 (min 4.7 min), UFC 11 | **0** |

Other cross-checks:
- **MLB game-call owner:** `forecastGeneratedAt ≥ firstPitchUtc` on 0 of 2,449 rows.
- **EPL owner:** `forecastGeneratedAt ≥ kickoffUtc` on 0 of 61 rows.
- **UFC** (no `eventStart` in the ledger): the latest `publishedAt` for each card is on or before the card date for all 8 cards (date-level check). The 10-17 card's last snapshot was at 14:03Z, before the 21:00Z prelims.
- **NFL Week 6:** `sideDecision.frozenAt = 2026-10-17T22:55:19Z` for all 13 games, the earliest kickoff being 13:30Z on 10-18.

**Coverage caveat** (not a violation, but it limits what this check can prove):
1. `frozenAt` is **null on all 16,319 ledger rows**. The schema field is never populated, so the check rests on `publishedAt`. NFL receipts do carry a freeze time (`sideDecision.frozenAt`), but the ledger does not copy it.
2. 1,005 rows have **no `publishedAt`**: 285 MLB Homer Nukes (`OWNER_SETTLED_UNFROZEN`, which also lack `eventStart`) and 720 NFL Weeks 1–2 props (`OWNER_GRADED_LOG`). For these rows the pre-start property cannot be verified from the ledger. This is consistent with their documented recoverability class.

### 4. Pending is never a loss: PASS

**Ledger:**
- PENDING rows with a `directionalResult` or a `measurement.type`: **0** of 32.
- LOSS rows whose state is not SETTLED: **0**.
- Rows settled at or before `eventStart`: **0**.
- `directional()` in `forecast-record.mjs` counts only SETTLED rows, plus VOID rows that are pushes.

**Owners behind the Results pages:**

| Owner | Check | Result |
|---|---|---|
| MLB game calls (2,449 rows) | LOSS without a final score | 0 |
| MLB game calls | graded before first pitch | 0 |
| NFL `graded-picks.json` | loss without an actual result | 0 of 60 |
| EPL `graded-forecasts.jsonl` | rows not `FULL_TIME` | 0 of 61 |
| `mlb_settled_leans.jsonl` (52,860 rows) | Loss with `actual: null` | 0 |

**TB@CLE 849816 (10-17, finished 7–3, not yet settled):**
- No rows in the ledger. The game started after the 18:02Z ledger build, and rows enter only once a game has started.
- No rows in `game-predictions-graded.jsonl` (latest date there is 10-15) or in `mlb_settled_leans.jsonl` (latest date 10-16).
- `/results/` day list: Sat Oct 17 shows only "Premier League 2–3". `/results/date/2026-10-17/` has no MLB section. MLB's 7-day window is 9–9 and comes only from 10-12 to 10-15.
- `/mlb/` shows "Sat, Oct 17 · 8:08 PM ET Started TB (model favourite) @ CLE", a status from the build snapshot. That is a "started" state, not a grade.

**Pending rows that are not losses but are long-lived (observation, not a failure):**
- NFL 25 PENDING rows come from 5 preseason games (401873285–288 and 401873613, Aug 20–21). This is owner defect §8.2 in `docs/FORECAST_LEDGER.md`: they show as "not final" months after the games were played.
- MLB 7 PENDING rows are Homer Nukes: 5 for postponed 849817 (10-16) and 2 for 824785 (09-22). The prop leans for 849817 were voided, but the Homer Nukes rows remain PENDING until `settle-homer-nukes` acts.

### 5. Void and postponed handling (10-16 TB@CLE 849817): PASS

| Surface | Observation |
|---|---|
| `/data/mlb/results/model-rows/2026-10-16.json` | Byte-identical to `origin/main`, generated at 10-17T18:01:44Z. 41 rows, all `"outcome": "void"`; `wins 0, losses 0, pushes 0, voids 41, decisive 0, games 1`. |
| `pipeline/validation/mlb_settled_leans.jsonl` | 52,860 rows. 41 rows for gamePk 849817, all `Void`, `graded: true`. |
| `/results/date/2026-10-16/` (the day page that renders 10-16) | "MLB 0–0 … TB v CLE · Final score not on file · No public game call graded … Player-prop leans … 0–0 · 41 void". Each row is labelled "Void". |
| `/results/` day list | "Fri, Oct 16 · No public forecast graded · MLB player-prop leans · market context 0 0 0 41". |
| Denominators | For the mlb-props population: 7-day 120–118 with 51 void, Season 24,940–24,666 with 3,197 void. These equal `graded-picks.json` (hits 24,940, misses 24,666, voided 3,197). The 41 rows add only to the void count. |
| `/results/picks/mlb/` | "2026-10-16 … TB v CLE … VOID" for each row. |
| `/results/mlb/` | By-game "TB @ CLE 0–0 · 0 dec · 41 void". Per-row labels say "Push". See **D-2**. |

### 6. Results pages agree with records (MLB, NFL): PASS

- **Loader:** `/results/` → `resultsV2Populations(today)` (`app/src/lib/results/v2/overview.ts`) → `population()` / `windowsFrom()` (`populations.mjs`).
- **MLB game-call owner:** `app/public/data/mlb/results/game-predictions-graded.jsonl`.
- **NFL owner:** `makeGradedPickOwners().nflPicks()` over `data/internal/nfl/experimental-settlement/`, published as `app/public/data/nfl/graded-picks.json`.
- **How the windows are produced:** the static HTML prints the 7-day window computed for the build day (2026-10-18). The other windows are computed in the browser from the serialized `days[]`, which the audit extracted from the RSC payload.
- **Production files:** `/data/mlb/results/game-predictions-graded.jsonl`, `/data/nfl/graded-picks.json`, `/data/epl/graded-picks.json` and `/data/ufc/graded-picks.json` are byte-identical to `origin/main`.

| Population | Window | `/results/` (HTML or serialized days) | Recomputed from public JSON |
|---|---|---|---|
| MLB game calls | 7 days | "9–9 · 50% of 18 decided" | 9–9 |
| MLB game calls | 30 days | 243–193, 7 pushes | 243–193, 7 pushes |
| MLB game calls | Season / All | 1,313–1,098, 38 pushes | 1,313–1,098, 38 pushes. Also equals the ledger: moneyline + run line + posted + total = 1,313–1,098–38. |
| NFL game winners | 7 days | "1–1 · 50% of 2 decided" | 1–1 |
| NFL game winners | Season / All | 70–50, 3 void | `graded-picks.json` counts: hits 70, misses 50, voided 3. By basis 61–44 + 9–6, which equals `/results/picks/nfl/` and the ledger. |

**Notes:**
- The NFL week page `/results/nfl/` shows "Week 6: 1 final game". It lists the other 13 games as "not final yet and will be added when they finish".
- `index.json`'s `experimentalRecord` (regular season only, 79 decisive) is a different scope from the Results record, which includes preseason. They are not expected to be equal.
- `/data/mlb/graded-picks.json` returns **404** on Production. This is by design: `scripts/prune-internal-routes.mjs` removes `/data` files that no shipped page references. The file is read at build time only.

### 7. Ask GameTime consistency: FAIL (LOW), see D-1

**Contract:** `app/src/lib/results/v2/results-ask-parity.test.mjs` asserts that every day in Ask's `public/data/ask/v1/results.json` matches the `/results/date/<d>/` owners: the same lanes and legs (`productReceiptsFor`) and the same events, finals and graded calls (`resultsDay`). `data/ask-projection/v1/manifest.json` lists `results.json` and `forecast-record*.json` as `dailyFiles`, which are built at build time and not committed.

**Day parity:** PASS for every day Ask ships (10-14 to 10-17).
- 10-17: 5 EPL matches with the same grades as the day page (Newcastle L, Fulham W, Man City W, Brentford L, Everton L).
- 10-16: TB v CLE with final `null` and no calls, which equals "Final score not on file · No public game call graded".
- 10-15: MLB 3–3 (TB@CLE L/L/W, MIL@LAD L/W/W) and NFL SEA@DEN DEN WIN, which equals the `/results/` Oct 15 row "MLB 3–3, NFL 1–0".

**Headline cells vs `/results/` (all-time and season):**

| Sport | Ask cell | `/results/` | Verdict |
|---|---|---|---|
| MLB prop leans | `forecast:mlb:-:LIVE_LEDGER:graded-picks` 24,940–24,666, void 3,197 | Season 24,940–24,666, 3,197 void | match |
| MLB lifetime | `forecast:mlb:-:LIVE_LEDGER:lifetime-summary` 24,940–24,666 | `/results/mlb/` "49,606 decisive · 50.3%" | match |
| UFC | `forecast:ufc:-:LIVE_LEDGER:graded-picks` 44–26, void 1 | Season 44–26, 1 void | match |
| EPL | `forecast:epl:-:LIVE_LEDGER:graded-picks` **27–33** | Season **27–34** | **mismatch (D-1)** |
| NFL | no headline cell (`bySport.nfl: null`) | 70–50 | not compared |

**Forecast record:** `/data/ask/v1/forecast-record.json` matches the ledger exactly. The kpis are 16,319 / 12,574 / 32 / 3,038 / 675, all 25 family count blocks match, and the pick records (including NFL `pickRecords` 61–44 and 9–6) are identical.

### 8. NFL and UFC: PASS

**NFL** (one fetch each of `/nfl/` and `/`):
- **Next game:** `/nfl/` lists "Sun, Oct 18 · 9:30 AM ET Upcoming HOU @ JAX … JAX 62.1%" first. The ESPN id 401872996 appears in the HTML of both `/nfl/` and `/`.
- **Home NFL card:** "NFL Live today · 12 game forecasts today · Week 6: 13 published … HOU Houston Texans @ JAX Jacksonville Jaguars Sun 9:30 AM ET Winner JAX 62%".
- **Index:** `app/public/data/nfl/index.json` (generated 10-17T22:55:19Z) has `nextKickoffUtc 2026-10-18T13:30Z`, `nextForecastMatchup "HOU @ JAX"`.
- **Probabilities:** all 13 favourite probabilities on `/nfl/` equal `index.json` `winProbability` (0 mismatches).
- **Frozen forecasts:**
  - `app/public/data/nfl/forecasts/latest.json` holds 13 forecasts, each with `sideDecision.frozenAt = 2026-10-17T22:55:19Z`, before every kickoff (earliest 13:30Z).
  - Add-only receipts are committed under `data/internal/nfl/forecast-receipts/2026-10-17/`: a base file plus revisions at 1602Z, 1729Z, 1749Z and 2255Z for each event from 401872996 to 401873008.
  - `forecasts/frozen-latest.json` holds only SEA@DEN, the only game that has kicked off. This is correct: a game is frozen into that file at kickoff.
- **Event-window states** (`index.json` `events[].lifecycle`, written by the event-window run `02fffca99a` at 10-17T22:55Z): 13 `UPCOMING` and 1 `SETTLED` (SEA@DEN). `counts`: forecastsUpcoming 13, forecastsStarted 1, settled 1. No event is currently in a started-but-unsettled or unavailable state, and the states are kept separate.
- **Minor wording:** `/nfl/` still shows "SEA @ DEN · kicked off Thu 8:15 PM ET · Follow live →" for a game that is already settled and graded HIT lower on the same page. This is a cosmetic issue, not a data issue.

**UFC** (one fetch of `/ufc/`):
- **Status:** the page shows "UFC Fight Night: Buckley vs. Malott … Last card · pregame predictions · 0 scheduled … This card has been fought. These are the frozen pregame forecasts, unchanged; graded results appear under Results once the card is officially settled". Elsewhere it says "Last card FOUGHT — the next card's read publishes when it is built". The finished card is not shown as upcoming.
- **Results:** pending. `/results/` UFC 7-day says "Nothing graded in this window". `data/internal/research/ufc/model-vs-market/graded.jsonl` was last written by `a32aeae45a` (10-14) and ends with the 10-10 card.
- **Next settlement:** the `ufc-post-card` workflow (cron `0 8 * * *`) will grade the card. The ledger has 71 UFC rows, none of them from 10-17 yet.

## Other observations (not check failures)

- **Home MLB card copy:** "1 game today on the official schedule · the model board for today is not published yet … Every game on today's slate has started". The last sentence describes the 10-17 slate under a 10-18 heading. This is cosmetic.
- **`frozenAt` in the ledger:** the column is never populated (Check 3, caveat 1). Copying the owners' freeze time, such as NFL `sideDecision.frozenAt`, into the ledger would let this audit check freeze time and not only publication time. It is a candidate for a future ledger-schema task.
- **Raw vs reported lean counts:** the raw settled-leans file has 24,950 W / 24,674 L / 3,236 Void. The reported numbers are 24,940 / 24,666 / 3,197. The difference is the documented forecast-of-record de-duplication in `lib/results/mlb-leans-of-record.mjs` (the 824785 make-up game), not drift.

Temporary files were written only under this session's scratchpad (`audit1018/`) and were deleted after the audit.
