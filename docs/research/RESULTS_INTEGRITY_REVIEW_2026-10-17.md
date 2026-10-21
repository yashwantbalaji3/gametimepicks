# Results / settlement integrity review — 2026-10-17

- **Scope.** Cross-sport review of results and settlement integrity for MLB, NFL, NBA, EPL/soccer and UFC.
- **Baseline.** `origin/main` at `2c617c780c` (2026-10-17 06:07Z). Committed data, the code, and the rendered pages of the combined UX release export (`gametimepicks-wt/s16-relmerge/app/out`, built about 00:05Z).
- **Constraints.** Nothing was merged, deployed or dispatched. No committed data, grades or forecasts were changed.
- **Fix branch.** `claude/results-integrity-fixes`, pushed with no PR, in worktree `gametimepicks-wt/integrity`.
  - `bbfb0fe490`: MLB join guard test.
  - `ad520a62c1`: results presentation and computation fixes.

## How this was checked

- **Guard tests on `origin/main`.** I ran 127 targeted guard test files (every `*.test.mjs` under `app/src` that mentions VOID, WITHDRAWN, denominator, noMeasurement, coin flip or "never a loss"):
  - 1,425 tests, 1,417 pass, 8 fail.
  - 7 of the failures are post-build-only RX research-page tests. They need `out/` and are expected to fail in a unit run.
  - 1 failure is real: `mlb-pregame-settlement-join-guards` **16d**. It is fixed below.
- **Forecast ledger scan.** I scanned every row of `data/internal/forecast-ledger/v1` (15,957 rows) for state and measurement combinations:
  - 0 PENDING rows with a measurement.
  - 0 VOID rows with a WIN or LOSS.
  - 0 WITHDRAWN rows with a measurement.
  - 0 legacy p=0.5 rows without `observed`.
- **Per-sport recomputation.** For each sport, the public numbers were recomputed from committed data and compared with the export text.

## Per-sport verdicts

| Check | MLB | NFL | NBA (archive + preseason) | EPL | UFC |
|---|---|---|---|---|---|
| 1. Denominators = W/(W+L); push/void/pending reported separately | PASS (one surface fixed: 09-22 board banner) | PASS | **DEFECT: duplicate rows inflate n (founder decision)** | **DEFECT: two models pooled under the live model (founder decision)** | PASS |
| 2. Pending never a loss; VOID/DRAW/WITHDRAWN excluded | PASS | PASS | PASS (void *labelled* pending, minor) | PASS (a 1X2 draw is a loss for a H/A pick, consistent and disclosed) | PASS |
| 3. Forecast of record = pre-start; nothing post-start graded | PASS | PASS | PASS | PASS | PASS |
| 4. Missing measurement never converted to zero | **DEFECT: Homer Nukes (founder decision)** | PASS | PASS | PASS | PASS |
| 5. Market/edge framing; log loss and Brier wording | PASS for game calls; **"Edge" label on graded prop rows (founder decision)** | PASS | **"edge" on archive rows; About-page NBA claim stale (founder decision)** | PASS | PASS |
| 6. Every % has a denominator and a small-sample caveat | **DEFECT, fixed** (/results cards) | **DEFECT, fixed** (/results cards, week report) | PASS (apart from the inflated n) | **DEFECT, fixed** (/results card) | **DEFECT, fixed** (/results card) |
| Cross-cutting: label and guard fixes | **fixed**: lifetime "early sample" note; 16d guard | **fixed**: forward-test "player-games" label | — | — | — |

### Evidence for each PASS

**MLB**
- **Lifetime record.**
  - `lifetime_summary.json` has 24,940 W, 24,666 L and 0 pushes. Its hit rate is 0.5028 = W/(W+L).
  - Recomputed through `mlbLeansOfRecord`: 52,762 rows, of which 3,156 void and 57 superseded; 0 late; 0 conflicting.
  - /mlb, /results/mlb and model-audit all show 50.3% on 49,606, with the 3,156 voids shown separately.
- **Game predictions.**
  - Totals: 775 = 380 + 395, with 38 pushes excluded (ledger `mlb_total` VOID with directional PUSH).
  - Moneyline: 818 = 418 + 400.
  - All 3,267 game-prediction and projected-score rows have `forecastGeneratedAt` before first pitch.
- **Home claim.** "57.9% of 38 decisive" equals `model-rows/2026-10-11.json`: 22–16, with 2 voids excluded. `decisive == wins + losses` holds in all 123 model-rows files.
- **Box-score gaps (Python settler).**
  - The settler returns None for a missing stat.
  - A suspended game, or a batter with 0 plate appearances, becomes Void (`pipeline/mlb/settle_mlb_results.py:381-405, 466-492`).
  - A non-Final game is skipped as pending (`:409-411`).
- **Wording.**
  - Winner calls are shown as "not yet distinguishable", which is correct: log-loss difference +0.007, interval −0.005 to +0.020.
  - Totals are shown as "below a coin flip", which is correct: difference +0.035, interval +0.016 to +0.054, so the whole interval is above zero.
  - "Lower is better" appears throughout (`logLossVerdict`).

**NFL**
- **Denominators.**
  - `summariseWeek` and `nflFamilyRecord` count HIT and MISS only. VOID, NO_PICK, NO_LINE and PUSH are kept apart.
  - Season figures equal the export: winner 48/79 with 1 void; receptions 779/872 with 138 void.
  - The /results card shows 9–5 on 14 decided with 1 void, which matches the d7 recomputation.
  - Season 70–50 with 3 voids = 61–44 historical + 9–6 frozen.
- **Ties.** The 3 ties are `hit: null` and count as VOID.
- **Forecast of record.**
  - The builder takes the latest receipt with `generatedAt < kickoffUtc` and refuses one generated at or after kickoff.
  - 0 graded games were generated at or after kickoff.
  - Weeks 5–6: all 29 graded picks equal the frozen `publishedSide`.
- **Props.** A player with no box line gets `actual: null` and is VOID. `?? 0` applies only to players present in the box. The ledger keeps `noMeasurement` outside the decided rows.
- **Preseason rows.** 25 preseason ledger rows (5 games, Aug 21–22) are still PENDING. They are disclosed as "25 not final" and are not counted. This is a stale-settlement gap, not a counted loss.

**NBA**
- **Freezing.** All 187 game forecasts were committed before tip. There are only 3 revisions, all made before tip. The ledger shows preTip 51/51.
- **Missing stats.** DNP and missing stats become `stats_unavailable` or are skipped. None of the 3,635 decisive rows has a null `finalStat`.
- **Preseason disclosure.** The hub says preseason "never count[s] as model evidence". There are no "beats" claims.

**EPL**
- **1X2 rule.** The shared contract (`soccer/settlement-contract.mjs:65`) grades a home or away pick that ends in a draw as a LOSS. This is not draw-no-bet; the rule is consistent and rows say "draw (2-2) MISS".
- **Forecast of record.**
  - 0 of 56 rows have `forecastGeneratedAt ≥ kickoff`.
  - `eplMatchesOfRecord` gives 66 matches: 56 graded, 10 pending, 4 not forecast. 0 late, 0 conflicts.
- **Correct score.** It is labelled "top-1 exact-score hit rate": 5/56 = 8.9%. Its log loss of 2.415 is shown beside the uniform 2.398 with no claim of beating it.

**UFC**
- **Record.** 44/(44+26) = 62.9%. The 1 draw (Kareckaite–Gatto) is VOID and outside every denominator; model-health n = 70.
- **Withdrawn bouts.** They are logged and never graded.
- **Forecast of record.** 0 of 36 snapshots were captured at or after the card start.
- **Live record wording.** +0.026 (interval −0.083 to +0.170), "cannot yet be told apart". This matches model-health.

**Ask**
- `tools/results.mjs` copies the owner's `decisive` and `hitRate` and never invents a rate.
- A pending lane stays pending.
- `results-ask-parity` tests pass.

## Defects fixed on `claude/results-integrity-fixes` (presentation and computation only)

All of these are presentation or computation changes. None of them changes a grade, a forecast, a committed artifact or a canonical metric.

1. **Rates without a small-sample caveat on the /results population cards.**
   - File: `components/results/results-overview.tsx`.
   - Before: the export printed "NFL 64.3% of 14 decided", "EPL 50% of 10", "UFC 50% of 10" and "MLB 45.8% of 24" with no caveat. The Today window can show "100% of 1".
   - After: every rate carries the site's one small-sample rule (`sampleStateFor`): under 30 decided reads "Far too few decided to judge accuracy."; under 200 reads "Still a small sample…". The hubs already apply this rule.
2. **NFL week report quoted 1/1 rates bare.**
   - Files: `sports/nfl/week-report-data.ts` and `app/results/nfl/page.tsx`.
   - Before: "Week 6: the team we favored won 1 of 1 games", and the table showed 100.0% (1/1) and 0.0% (0/1).
   - After:
     - `headlineDetail` adds "N graded games is far too few to judge the winner record on its own." This also reaches the /results card.
     - Table rows under 30 checks show "too few to judge" after the count. It is placed there so `week-report-rendered` still reads "<rate> <hits>/<checks>".
3. **The MLB archived board banner counted raw rows.**
   - File: `components/mlb/mlb-board-body.tsx`, using the new `mlbDayRecordOfRecord` in `data-mlb-results.ts`.
   - Before: `/mlb/board/2026-09-22` showed 283–266 on 549, taken from the raw comparison report, which includes the superseded copies of 824785.
   - After: it shows the leans of record, 273–258 on 531. That is the number `/results/date/2026-09-22` and `/results/model-audit` already show.
   - 09-22 is the only one of 123 dates where the two sources differ, so no canonical metric moves.
4. **Mislabelled denominator.**
   - File: `command-center/model-status.ts`.
   - Before: /models printed "3104 player-games graded so far". That figure is the sum of `n` over five `nfl_forward_*` families (769 + 769 + 419 + 129 + 1018), so a player-game counts up to five times.
   - After: it is labelled as forecasts across families.
5. **Lifetime audit note always said "still on an early sample".** That text appeared beside 49,606 decisive picks on /results/mlb.
   - File: `results-audit-notes.ts`.
   - After: the sentence now follows `sampleStateFor`. A large sample still says the hit rate is "not evidence the model out-predicts the market price".
6. **`main` was red: guard 16d.**
   - File: `mlb-pregame-settlement-join-guards.test.mjs`.
   - Cause: gamePk 849817 was postponed from 10-16 to 10-18. Its 10-16 join is `pending` with `officialDate` 10-18 and 0 settled-eligible rows, so it grades nothing.
   - Why this is safe: the writer turns such a join `superseded`, never `joined`, once the game is final.
   - Change: the scan now covers only joins that can grade. A negative control was added: the 849817 shape passes while pending and is caught once it carries settled rows.

**Tests**
- New `src/lib/results/results-integrity-2026-10-17.test.mjs`: 5 tests, all 5 fail on `origin/main` and all 5 pass here.
- `results-overview.test.mjs` and `week-report-headline.test.mjs` each gain 1 test, and each fails before the fix.
- `npx tsc --noEmit -p .` is clean.
- Targeted run of 163 files: 1,691 tests, 1,686 pass. The 5 failures are post-build-only, because there is no `out/` in the worktree:
  - `export-leak` EX1.
  - `week-report-rendered` (4 tests).
- **Before merging:** run `suite:built` after a build. In particular, `week-report-rendered` against the new table cell (expected to pass, because the note comes after the count).

## Founder decisions (not implemented — each would change a public metric)

1. **NBA archive: duplicate settled rows (largest impact).**
   - Data: `app/public/data/results/settled_leans.jsonl` has 4,592 rows, of which only 2,830 are unique. 1,762 are byte-identical copies.
   - Cause: for example, the 2026-05-18 board has 83 leans, but its settlement has 166 rows, each lean twice.
   - Code: `pipeline/export_results.py` (`build_lifetime_summary`) and the archive readers count rows with no dedup.
   - Published: **1,784–1,851 on 3,635 (49.1%)**. After exact dedup: **1,176–1,210 on 2,386 (49.3%)**.
   - Per-date distortions: 05-26 shows 146–164 (should be 95–115); 06-13 shows 193–267 (should be 106–154).
   - Per-market: PTS 47.3% becomes 49.6%; AST 45.1% becomes 43.0%.
   - Further undisclosed issue: the same prop at two books counts as two picks. Dedup by player, market, side and line gives 457–431 on 888 (51.5%).
   - Surfaces affected: /results/nba (hero, KPIs, per-game scorecard), the /results "NBA projections · archive 49.1% 1,784 of 3,635" line, and /results/model-audit (per-date table, sparkline, per-market).
   - **Options:**
     - (a) Dedup exact copies at read and disclose.
     - (b) Also collapse cross-book duplicates.
     - (c) Leave as is and disclose the duplication.
2. **EPL: two model versions pooled and credited to the live model. Time-sensitive.**
   - Code: `lib/sports/graded-pick-owners.mjs:78-116` (`eplPicks`) and `scripts/ops/build-model-health.mjs:71` (`epl_result`) read every row of `graded-forecasts.jsonl` with no `modelId` filter.
   - Data: v1 `epl-model-v1-split-poisson` has 36 rows, 15 hits, log loss 1.0586. v2 `epl-model-v2-elo-poisson` has 20 rows, 10 hits, log loss 1.0392.
   - Published:
     - `/epl` "56 graded … 44.6%" (25–31).
     - Model health "Live record · 56 graded" with log loss 1.0516, shown under the v2 "Match model" card.
     - `/results/forecasts` 1X2 log loss 1.052 on n=56.
     - The Ask cell (`modelOrPolicyVersion: null`).
     - The same page correctly says "20 graded under this model".
   - **Timing:** `epl_result` has `minN: 60`. About four more MW7 matches (Oct 17–19) will produce a verdict over the two pooled models, labelled as the live model's record.
   - **Options:**
     - (a) Split by `modelId`. v2 alone is 10–10, 50.0%, n=20, log loss 1.0392: too small, and resets the gate to INSUFFICIENT_SAMPLE.
     - (b) Keep the pooled record but label it "all EPL 1X2 forecasts (v1 + v2)" and keep it away from the v2 card.
3. **MLB Homer Nukes: a missing box-score stat is graded as a miss.**
   - Code: `app/scripts/mlb/settle-homer-nukes.mjs:56,76`. `p.stats?.batting ?? {}` and then `homeRuns ?? 0`.
   - Cause: the box score lists bench players with an empty batting object, so a scratched player grades as a "miss".
   - Data: 9 of 202 misses are players whose same-game batter props are Void with `actual: null` under the 0-plate-appearance rule. The other players in the same games graded normally.
     - 08-17 Colson Montgomery
     - 08-25 Jac Caglianone
     - 09-02 Dillon Dingler
     - 09-08 Dillon Dingler
     - 09-11 Brandon Lowe
     - 09-12 Yordan Alvarez
     - 09-12 Ben Rice
     - 09-13 Hunter Goodman
     - 09-17 Victor Mesa Jr.
   - Published: **37 of 239 homered vs 54.32 expected, Brier 0.1365**. Excluding the 9: **37 of 230 vs 52.14 expected, Brier 0.1395**.
   - Related rule mismatch (not reproduced on committed data): `scripts/settle-mlb-player-props.mjs:69-78` and `scripts/parlays/settle-lab-cards.mjs:236-247` grade a batter with 0 plate appearances and an all-zero line (for example, a pinch runner) as actual 0. The model ledger voids those.
   - **Options:**
     - (a) Forward fix: void when there is no plate appearance, plus re-grade the 9 historical rows.
     - (b) Forward fix only.
4. **"Edge" label on graded market-context rows.**
   - Where:
     - /results/mlb and /mlb/results rows: "Edge +5.3%", "edge 20.4%", "Edge quartile", "|Edge| range". Code: `mlb/results/page.tsx:131`, `settled-game-detail.tsx:198`.
     - NBA archive: "+20.7% edge" (`per-game-scorecard.tsx:234`), `settled-player-accordion.tsx:372`, and "Edge ≥ 25%" (`anomaly-guardrail-panel.tsx:92,107`).
     - The audit note "Edge-band … strongest so far".
   - The conflict: the same pages state that the model loses to the market on Brier and log loss, and the repo's own rule elsewhere is "difference, never edge".
   - **Suggested wording:** "model − market" or "gap vs market". This is copy-only, but it touches many pinned components, so it should be one deliberate copy pass.
5. **About page NBA claim is stale.**
   - Where: `app/about/page.tsx:205-213`, "NBA points + assists — barely above coin flip on a large sample".
   - The claim comes from a May 24 snapshot: 51.8% on 546 rows, duplicates included. The archive now shows PTS+AST at 46.3%.
   - "Stable signal on REB" has no interval.
   - **Options:** remove the claim, or restate it with n and an interval.

## Minor and latent findings (no wrong public number today)

- **NBA player audit labels voids as pending.**
  - Code: `settled-player-summary.ts:86-91` with `normalizeResult`. `invalid` and `stats_unavailable` are counted as "pending". For example, De'Aaron Fox shows "30 pending" on a retired archive.
  - The rows are correctly kept out of denominators, and 957 void rows are never shown as their own count.
  - Not changed, because an existing test pins `stats_unavailable` → pending on purpose for live boards.
  - Suggested fix: a separate `voids` bucket for a retired archive.
- **Home "57.9% of 38 decisive projections · 1 MLB games"** has a denominator but no small-sample note (`recap/yesterday-card.tsx`). It is low-risk to add the same `sampleStateFor` note.
- **EPL pending count.** `results/projection-core.mjs:730` computes `pending = total − counted − voided` over a graded-only ledger. For EPL and UFC this is always 0, which turns "unknown" into zero. Ask suppresses the 0 today.
- **UFC grader freeze guard.** `grade-ufc-model-vs-market.mjs:41-47` takes the newest snapshot with no `capturedAt < startUtc` guard. It is safe today only because of the capture-side fight-day freeze.
- **/nfl log-loss sentence.** "0.629 … better than … 0.642 and a coin flip's 0.693" is supported by the committed receipt (season bootstrap Δ −0.0129, 95% CI −0.0167 to −0.0092). The page does not show the interval, unlike the EPL card. This is a wording nit.
- **MLB prop timing.** Prop timing is day-precision. 21,026 rows are `timingUnverified` because 593 games have no StatsAPI first pitch. This is not shown publicly.
- **NFL preseason.** 5 preseason games from Aug 21–22 are still pending in the forecast ledger. They are disclosed as "not final" and counted nowhere. They should either be settled or closed as not settleable.
