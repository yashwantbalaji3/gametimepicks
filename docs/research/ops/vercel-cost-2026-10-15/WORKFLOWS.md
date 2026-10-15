# Bot commits vs the Vercel Ignored Build Step (read-only analysis)

**Data:** origin/main @ `f5c7d4fb9d` (2026-10-15 04:31Z).
**Window:** first-parent commits from 2026-10-01 ~05:00Z to 2026-10-15 04:31Z (14 days; 1,321 commits). The stamp heuristics cover the last 7 days.
**Build-input test:** the `BUILD_INPUTS` / `NON_BUILD_INPUTS` arrays from `git show origin/main:app/scripts/vercel-ignore-build.sh`, applied with `git diff --name-only <sha>^1 <sha> -- <pathspecs>`.
**Push grouping:** pushes come from GitHub's repo activity API (`activity_type=push`, ref `main`). That API lists PR merges separately, as `pr_merge`. Vercel deploys once per push, so the push-level columns are the closer proxy for builds.

Files:
- `rows.json`: per-commit rows, per-push rows and `summary_by_workflow`.
- Scripts: `analyze.py`, `extended.py`, `loose.py`, `jdiff.py`.
- `wf/`: the workflow files as they are on main.

All times below are **EDT (UTC−4)**, which applies until 2026-11-01; after that, subtract one more hour.

---

## 1. Inventory: workflows that commit to `main`

"BI?" means the staged paths include Vercel build inputs: `app/**` except `app/public/data/ops/`, `data/*-projection/`, and the four `data/internal` paths.

| Workflow | Triggers (UTC → EDT) | Paths it `git add`s (abridged) | BI? | Subject pattern | Existing gate beyond `git diff --cached --quiet` |
|---|---|---|---|---|---|
| **nfl-event-window** | `0 15` 11:00 · `0 21` 17:00 · `30 14` 10:30 daily; `0 13` Fri/Sat/Sun 09:00; dispatch (from nfl-kickoff-refresh, nfl-pregame-free-refresh) | `app/public/data/nfl/`, `admin/nfl-lane.json`, `data/internal/nfl/` (incl. forecast-receipts), research odds/injuries/replay/role-shares; then settlement receipts, `nfl/interval-calibration.json`, `reconciliation/`, `live-props/` | yes | `auto: nfl event window <ts> [skip ci]` + `auto: nfl settlement receipts [skip ci]` | Stage A (10-09): both commits go out in **one push** |
| **mlb-lineup-refresh** | `30 15…23`, `30 0`: hourly 11:30–19:30 and 20:30 (10/day); dispatch | `mlb/full-game-simulations`, `mlb/predictions`, `ops/`, `data/internal/mlb/prediction-snapshots` (BI), engine-level-shadow, input-snapshots | yes | `auto: mlb lineup refresh <date> [skip ci]` | none. **Draft PR #1088** proposes a stamp gate |
| **daily-products** | workflow_run ← mlb-daily-production (success); `41 11` 07:41; dispatch (+tick) | `mr-dub/`, `admin/`, `products/availability`, `parlays/risk-ladder`, `mlb/season-state.json`, `lab-ledger.json`, `coverage-matrix.json`, `data/*-projection/` (BI), `data/internal/products/*`, `platform/v1` | yes | `auto: daily products <date> [skip ci]` (commit-generated.sh) | **Per-file stamp drop**: unstages JSON files whose only difference is the top-level `generatedAt`. Projection builders write only on a content-hash change |
| **mlb-daily-production** | workflow_run ← morning-projections (success); `17 11` 07:17; dispatch (publication-slo recovery) | tier-grid, `mlb/{team-markets,player-props,home-run-props,homer-nukes,game-simulations,full-game-simulations,predictions,schedule}`, `ops/`, `admin/`, prediction-snapshots (BI), production-history | yes | `auto: mlb daily production slate <date> [skip ci]` | forbidden-path assert only. **Draft PR #1088** |
| **nightly-settle** | `17 5` 01:17 · `43 6` 02:43 · `11 8` 04:11 · `37 9` 05:37; dispatch | ~45 allowlisted paths: `results/`, `mlb/results/`, `parlays/{graded,optimizer-graded,…}`, `mr-dub/*`, `audit/`, `learning/`, `research/`, `ops/`, `admin/`, `data/internal/*`; then `data/internal/forecast-ledger/` (BI) as its own commit | yes | `auto: nightly settle <ET> [skip ci]`; `auto: forecast ledger <ET> [skip ci]` | Settlement is idempotent, but no stamp gate. The ledger writes nothing on an unchanged night |
| **nba-results-refresh** | `41 *` hourly; `11,26 0-7` 20:11–03:26 twice an hour; workflow_run ← publication-watchdog; dispatch | `app/public/data/nba/results/` | yes | `auto: nba results capture <ts> [skip ci]` | **COST-001 Stage A `results-publishable` gate**: restores `latest.json` when only stamps or in-progress state moved |
| **epl-matchweek** | 18 weekly crons (Thu–Mon; e.g. `0 21` Thu–Sun 17:00, Sat `30 10`/`0 13`/`30 15`…) | `soccer/epl`, `parlays/tier-grid`, `admin/epl-lane.json`, `risk-ladder-epl`, `data/internal/research/epl/*` | yes | `auto: epl matchweek refresh <date> [skip ci]` | none |
| **sport-schedules** | `7 9` 05:07; dispatch | Separate commits: `{nfl,nba,ufc}/schedule` + `admin/schedule-cadence.json`; `soccer/epl/results`; `nfl/results`; `ufc/results` (BI). Internal only: `research/nba/rosters`, `research/injuries`, `research/nba/experimental{,-v0.1}` | mixed | `auto: schedule capture:<sports>`, `auto: {epl,nfl,ufc} results capture`, `auto: nba roster capture…`, `auto: injuries facts capture`, `auto: nba experimental forecasts…` | **Stamp gates** on schedules (strips `generatedAt`/`windowDays`/row `capturedAt`/`source.url`) and on injuries (`generatedAt`/`sourceAsOf`). The cadence receipt is always committed |
| **weather-capture** | `10 13` 09:10 · `10 20` 16:10 | `research/{mlb,nfl}/weather`, `app/public/data/nfl/weather/` | yes | `auto: pregame weather capture [skip ci]` | none |
| **soccer-leagues** | `15 9` 05:15 daily; `0 15` Fri 11:00; `0 9` Sat/Sun 05:00 | `research/soccer/*/corpus…`, `app/public/data/soccer/` | yes | `auto: soccer league forecasts [skip ci]` | none |
| **epl-settle** | `0 23` 19:00 | `soccer/epl/results`, research corpus/learning | yes | `auto: epl settle <date> [skip ci]` | none |
| **ufc-post-card** | `0 8` 04:00 | `app/public/data/ufc/`, `research/ufc/model-vs-market` | yes | `auto: UFC post-card grading + backtest [skip ci]` | none |
| **morning-projections** | workflow_run ← nightly-settle (success); `47 10` 06:47; dispatch (afternoon-topup, SLO recovery) | `boards/`, `mlb/{boards,schedule,power}`, `board.json`, `slate.json`, `odds_props.json`, `players.json`, `trends.json`, `meta.json`, `parlays/{optimizer,snapshots}`, `pipeline/validation/leans_log.jsonl` | yes | `auto: morning projections <ET> [skip ci]` | none |
| **ufc-fight-week** | `0 11` Tue/Thu/Sat 07:00; `0 13` Sun/Mon/Wed/Fri 09:00 | `tier-grid/ufc-*`, `ufc/{schedule,card-latest,odds-latest,…}`, `risk-ladder-ufc`, `admin/ufc-lane.json`, research/odds ufc | yes | `auto: ufc fight-week refresh <date> [skip ci]` | none |
| **results-top-boards** | `15,45 10-23` Sep–Jan: every 30 min, 06:15–19:45 (28/day) | `results/top-boards/`, `results/top-board-withdrawals/` | yes | `auto: freeze daily top boards <ts> [skip ci]` | **Append-only/write-once assert**, so it commits only on a new freeze |
| **auto-refresh** | `0 12,14,16,18,20,22,0,2,4`: 08:00–00:00 every 2h (9/day); dispatch | `app/public/data/` + `pipeline/validation/` (three commit steps: props-only, projections, zero-credit) | yes in principle; observed commits touch only `ops/` | `auto-refresh: <ET> (props-only\|projections\|zero Odds API credits)` (**no** `[skip ci]`) | none. Paid steps are off, so in practice it writes only `ops/` |
| **cron-watchdog** | `53 10` 06:53 · `30 14` 10:30 daily; `30 9` Sat/Sun 05:30 | `ops/{cron-slot-watchdog,lane-staleness,cron-punctuality,feed-health}.json`, `research/ops/availability-audit.json` | **no** | `auto: cron-slot coverage <date> [skip ci]` | none |
| **mlb-pregame-capture** | `0 11` 07:00; `0 15,17,19,21,23` 11:00–19:00 every 2h; `30 22` 18:30; `0 1` 21:00 (8/day) | `data/internal/mlb/pregame-archive/` | **no** | `auto: mlb pregame archive metadata (N files) [skip ci]` | size guard, scope assert |
| **nba-forecast-window** | `17 *` hourly; workflow_run ← publication-watchdog; dispatch | `research/nba/experimental*`, `research/injuries/nba/latest.json` | **no** | `auto: nba pre-tip forecast window <ts> [skip ci]` | receipt verification |
| **nfl-sim-v2-shadow** | workflow_run ← nfl-event-window; `41 *` Sep–Feb (hourly) | `research/nfl/sim-v2/shadow/` | **no** | `auto: nfl sim v2 shadow receipts <ts> [skip ci]` | append-only assert |
| **soccer-dc-shadow** | `45 9` 05:45 | `research/soccer/*/…shadow-dc-v2…` | **no** | `auto: soccer Dixon-Coles v2 shadow <date> [skip ci]` | none |
| **nfl-depth-charts** | `12 8` Wed/Sat 04:12 | `research/nfl/depth-charts/` | **no** | `auto: nfl depth-chart snapshots <ts> [skip ci]` | none |
| **nfl-props-forward-shadow** | `30 13` Sep–Jan 09:30; `0 20` Thu 16:00 | `research/nfl/replay/player-props-share-level-forward/` | **no** | `auto: P300 player props forward shadow [skip ci]` | none |
| **nflverse-weekly** | `30 11` Tue 07:30 | `research/nfl/{nflverse,snap-counts}/` | **no** | `auto: nflverse weekly capture [skip ci]` | none |
| **nfl-live-props** | `*/15`: Sun 09:00–00:45, Mon 16:00–19:45, Thu 16:00–00:45 | `nfl/live-props/`, `nfl/live-markets/`, `data/internal/nfl/prop-settlement/`, research odds | yes | `auto: nfl live props <ts> [skip ci]` | none (**0 commits** in the window) |
| nfl-live-props-free, nfl-odds-capture, odds-canary, nba-market-probe, daily-refresh, ufc-{fighter-stats,odds,pre-card,results}-refresh | dispatch only | various `app/public/data/...` (BI) or research | mostly yes | see `wf/` | none |

Workflows that do not commit: daily-lifecycle (dispatch; full-roll recovery), data-contract-check, mlb-afternoon-topup (dispatches morning-projections), mlb-research-integration, nfl-kickoff-refresh and nfl-pregame-free-refresh (both dispatch nfl-event-window), publication-watchdog (its SLO action dispatches recovery), quality-gate, ops-alert-test and ufc-prop-discovery.

---

## 2. Attribution, last 14 days

"bt" means the commit's diff touches at least one build input. "Pushes" exclude PR merges.

| Workflow | commits | commits/day | bt commits | bt commits/day | avg files/commit | pushes | **bt pushes/day** |
|---|---:|---:|---:|---:|---:|---:|---:|
| human (PR merge) | 198 | 14.1 | 182 | **13.0** | 10.6 | (199 pr_merge) | ~13.0 |
| **nfl-event-window** | 218 | 15.6 | 218 | 15.6 | 51.5 | 162 | **11.6** |
| **mlb-lineup-refresh** | 126 | 9.0 | 126 | 9.0 | 7.4 | 126 | **9.0** |
| **daily-products** | 98 | 7.0 | 98 | 7.0 | 29.4 | 98 | **7.0** |
| **mlb-daily-production** | 89 | 6.4 | 89 | 6.4 | 15.4 | 89 | **6.4** |
| **nightly-settle** | 82 | 5.9 | 82 | 5.9 | **313.3** | 83 | **5.9** |
| nba-results-refresh | 51 | 3.6 | 51 | 3.6 | 1.5 | 51 | 3.6 |
| epl-matchweek | 35 | 2.5 | 35 | 2.5 | 26.7 | 35 | 2.5 |
| sport-schedules | 96 | 6.9 | 33 | 2.4 | 2.9 | 96 | 2.4 |
| weather-capture | 27 | 1.9 | 27 | 1.9 | 4.5 | 28 | 2.0 |
| soccer-leagues | 20 | 1.4 | 20 | 1.4 | 3.0 | 20 | 1.4 |
| epl-settle | 14 | 1.0 | 14 | 1.0 | 3.2 | 14 | 1.0 |
| ufc-post-card | 14 | 1.0 | 14 | 1.0 | 7.1 | 14 | 1.0 |
| morning-projections | 14 | 1.0 | 14 | 1.0 | 4.0 | 14 | 1.0 |
| ufc-fight-week | 12 | 0.9 | 12 | 0.9 | 14.8 | 12 | 0.9 |
| results-top-boards | 7 | 0.5 | 7 | 0.5 | 1.0 | 7 | 0.5 |
| nfl-live-props-free / ufc-odds-refresh / unattributed | 5 | 0.4 | 4 | 0.3 | n/a | 5 | 0.3 |
| mlb-pregame-capture | 68 | 4.9 | 0 | 0 | 56.4 | 69 | 0 |
| auto-refresh | 47 | 3.4 | 0 | 0 | 2.8 | 47 | 0 |
| cron-watchdog | 31 | 2.2 | 0 | 0 | 5.0 | 31 | 0 |
| nfl-sim-v2-shadow | 29 | 2.1 | 0 | 0 | 4.4 | 27 | 0 |
| nba-forecast-window | 26 | 1.9 | 0 | 0 | 2.9 | 26 | 0 |
| soccer-dc-shadow, nfl-depth-charts, nfl-props-forward-shadow, nflverse-weekly | 13 | 0.9 | 0 | 0 | n/a | 13 | 0 |

**Totals (14 days):**
- 1,069 bot pushes, of which 790 were build-triggering (**56.4/day**).
- 279 bot pushes (~20/day) ran the Ignored Build Step and skipped.
- 182 build-triggering PR merges (13/day). Merges ran 30+/day on 10-01, 10-02 and 10-05, and 2–11/day in the last week.

Build-triggering bot pushes run at a steady ~48–65/day; see the daily breakdown in `rows.json` → `pushes`.

---

## 3. Stamp-only estimate (HEURISTIC; last 7 days; upper bound for a gate, not a design)

Three tiers, each looser than the one before:
- **strict** is exactly the brief. It recursively deletes keys named `generatedAt|updatedAt|checkedAt|capturedAt|lastRunAt|builtAt|fetchedAt|observedAt|asOf|refreshedAt|priceAgeDays|ageHours|ageMinutes|etTime|runAt|now`, then compares canonical JSON. Non-JSON files and added or deleted files count as real.
- **extended** also deletes any key ending in `At`, `_at`, `Stamp`/`stamp` or `AsOf`, plus `fitThrough`, `hoursAway` and `age*`. It also replaces ISO timestamps inside strings with `<TS>`.
- **loose** is extended, plus three changes: it ignores **added** per-run snapshot files (`snapshot-<digits>.json`, `*/capture-*.json`); it ignores internal-only `admin/*` other than `model-health.json`; and it parses `.jsonl` line by line.

| Workflow | bt pushes (7d) | strict | extended | **loose** | Biggest remaining "real" diff under loose |
|---|---:|---:|---:|---:|---|
| nfl-event-window | 72 | 0 | 7 | 7 (10%) | `end-zone-vault/<date>`, `forecasts/<date>` (often **only `model.inputHash`**), reconciliation, interval-calibration |
| **mlb-lineup-refresh** | 63 | 0 | 0 | **49 (78%)** | `full-game-simulations/<date>` (e.g. `frozenPregame` added) |
| daily-products | 54 | 5 | 5 | 10 (19%) | `coverage-matrix.json` (prose such as "3.1 → 3.2 days old"), `compare-projection/readiness.json` (`researchContentSha256`), `season-state.json` |
| **mlb-daily-production** | 48 | 0 | 0 | **40 (83%)** | `full-game-simulations/<date>` |
| nightly-settle | 49 | 0 | 0 | 0 | `admin/model-health.json` (`changes`), `lab-ledger.json` (age prose), forecast-ledger manifest |
| nba-results-refresh | 28 | 0 | 0 | 0 | real finals (already gated) |
| epl-matchweek | 17 | 0 | 0 | 3 | `risk-ladder-epl`, forecasts |
| sport-schedules | 16 | 0 | 0 | 0 | results / schedule content (already gated) |
| weather-capture | 14 | 0 | 0 | 0 | real forecast values (tempF, wind, precip) |
| soccer-leagues | 10 | 0 | 0 | 0 | ligue-1 dated forecasts |
| epl-settle | 7 | 0 | 4 | 4 (57%) | `graded-derived-markets.jsonl` |
| ufc-post-card / morning-projections / ufc-fight-week / results-top-boards | 7 / 7 / 6 / 3 | 0 | 0 | 0 / 0 / 1 / 0 | real |
| **Total** | **402** | **5 (1.2%)** | **16 (4.0%)** | **114 (28%)** | |

The commit-level numbers match the push level, except nfl-event-window: 40 of its 126 bt commits are stamp-only under extended, but they ship paired with a real commit.

**Why strict finds almost nothing:**
1. Every MLB run adds a new `data/internal/mlb/prediction-snapshots/<date>/snapshot-<ts>.json`. That path is a build input, and an added file counts as real. This happened in 63/63 lineup commits and 48/48 production commits.
2. Many time fields are outside the brief's key list. Examples: `gradedAt`, `forecastAt`, `stampedAt`, `sourceGeneratedAt`, `latest*At`, `hoursAway`, and timestamps embedded in prose.
3. Per-run capture files are added under public paths: `nfl/rosters/capture-*` (63 of 126 nfl-event-window commits), `soccer/epl/player-projections/snapshot-*` (17/17 epl-matchweek), and `*/schedule/capture-*`.

**Cross-check:** PR #1088's replay found 157 → 52 MLB build-triggering commits over 10 days (67% suppressed, with a heartbeat). Loose gives 78–83% for MLB, which is consistent with loose being an upper bound.

**Spot check, nightly-settle `ef5b43e1`:**
- It changes 426 files, 334 of them build inputs.
- `model-rows/`, `research/row-lineage/` and `optimizer-graded/` differ only in `generatedAt`/`gradedAt`. `optimizer-graded/2026-05-25.json` has 308 `gradedAt` lines rewritten.
- `mlb/results/settled_leans.jsonl` is rewritten byte for byte across 52,694 lines but parses identical.
- A handful of genuinely moving fields keep it "real": model-health `changes`, and age prose in lab-ledger.

---

## 4. Workflows / paths the public site never reads (candidates, not certain)

**Already invisible to Vercel (0 build-triggering commits):**
- mlb-pregame-capture, auto-refresh (in practice), cron-watchdog, nba-forecast-window, nfl-sim-v2-shadow, soccer-dc-shadow, nfl-depth-charts, nfl-props-forward-shadow, nflverse-weekly.
- sport-schedules' internal lanes: nba rosters, injuries, nba experimental.

Each of their pushes still invokes the Ignored Build Step (~20/day). PR #1088 assumes about 16 CPU-min per ignored build (COST-001 §2.4). If that holds, batching or consolidating these pushes is a cost lever separate from build gating.

**Build-input paths with no public reader found (grep of `app/src` and the build-step scripts, excluding `/ops`, `/launch`, `/preview` and `lib/launch/*`):**
- `app/public/data/admin/` files other than `model-health.json`: `status.json` (already moved to `NON_BUILD_INPUTS` in #1088), `evidence-ledger.json`, `nfl-lane.json`, `epl-lane.json`, `ufc-lane.json`, `schedule-cadence.json`.
  - Readers are `/ops`, `/launch` (pruned), `lib/launch/*`, `lib/ops/daily-owners.mjs` and the builder scripts.
  - `admin/model-health.json` **is** public; `lib/top-reads.ts` and `lib/command-center/model-status.ts` read it.
  - In 14 days, **no** commit's build-input set was admin-only. Excluding these files saves nothing by itself. They matter only because they churn every run and would defeat a content gate.
- `app/public/data/nfl/rosters/capture-*.json` (246 files). The public code reads only `nfl/rosters/latest.json` (`lib/follow/entity-registry.ts`).
- `app/public/data/soccer/epl/player-projections/snapshot-*.json`. No reader was found by path.

A directory-scanning reader could still exist. The proper check is the `internal-route-exclusion.test.mjs` guard against a real build.

---

## 5. Summary

**Top build-triggering sources (14d, per day):** PR merges 13.0, nfl-event-window 11.6, mlb-lineup-refresh 9.0, daily-products 7.0, mlb-daily-production 6.4, nightly-settle 5.9, nba-results-refresh 3.6, epl-matchweek 2.5, sport-schedules 2.4, weather-capture 2.0. Bot total: 56.4/day.

**Already gated:**
- nba-results-refresh: publishable gate.
- daily-products: top-level `generatedAt` per file.
- sport-schedules: schedule and injuries stamp gates.
- results-top-boards and nfl-sim-v2-shadow: write-once.
- nfl-event-window: single push per run.

**Most stamp-only (loose heuristic) build-triggering pushes, 7d:** mlb-lineup-refresh 49, mlb-daily-production 40, daily-products 10, nfl-event-window 7, epl-settle 4, epl-matchweek 3.

**Share covered by PR #1088 (MLB lineup + daily production):**
- 111 of 402 bot bt pushes in 7 days (28%).
- 89 of 114 loose stamp-only pushes (78%).
- After #1088, loose stamp-only bt pushes elsewhere total about 25 per 7 days (~3.6/day).

**Candidates for new gates, in order of likely value:**
1. **nightly-settle** (5.9/day; ~330 build-input files per commit). The four slots are redundant retries, and each re-run rewrites `generatedAt`/`gradedAt` across hundreds of historical files plus a parse-identical `settled_leans.jsonl`. A gate of "commit only if settlement content changed" (strip `gradedAt`/`generatedAt`, and compare parsed JSONL) would mostly collapse the re-runs. Today a few fields still move each run: model-health `changes`, and age prose in lab-ledger.
2. **daily-products** (7.0/day). Widen the existing gate from top-level `generatedAt` to nested `asOf`/`now`/`ageHours`. Also stop baking relative-age prose ("3.1 days old") into committed artifacts (`coverage-matrix.json`, `lab-ledger.json`) and compute it at render time.
3. **nfl-event-window** (11.6/day; the largest bot source). Mostly real content. Two churn sources are worth fixing: `forecasts/<date>.json` changes where only `model.inputHash` moved, and the per-run `nfl/rosters/capture-*` files under a build-input path with no public reader found.
4. **epl-matchweek / epl-settle** (3.5/day combined). A per-run `player-projections/snapshot-*` is added under `app/public/data` every run, and epl-settle is 57% stamp-only under extended.
5. **weather-capture** (2/day). The changes are real weather updates; gate only on displayed-value thresholds if that is acceptable to the product.

---

## Caveats

- **Pushes ≠ deployments.** Vercel diffs against `VERCEL_GIT_PREVIOUS_SHA`, the last *successful* deploy, not the push's `before`. Failed or cancelled deploys and queue coalescing can make the true build count differ. No Vercel API was queried.
- **Attribution is by subject regex.** Four `auto: nba results capture [skip ci]` commits without a timestamp are attributed to nba-results-refresh, assumed to come from an older version of the workflow. Two bot commits are unattributed.
- **"Stamp-only" is a heuristic in all three tiers.**
  - strict follows the brief exactly.
  - extended and loose are my additions and over-count. Some stripped fields are shown to readers (e.g. "updated at" lines, ages, `hoursAway`), and suppressing them changes what the page says.
  - Loose additionally assumes added per-run snapshots are unread, which is not verified; `prediction-snapshots` *is* read at build for `/today`.
  - Loose is an upper bound for any gate, not a gate design.
- **First-real-file reporting** names only the first non-stamp file found per commit (early exit), not every real file.
- **Window composition.** The 14 days include unusually heavy PR-merge days (10-01, 10-02, 10-05), and they straddle the 10-09 COST-001 Stage A change (nba gate, NFL single push).
- **Reader search is grep-based** (`app/src`, `app/scripts`, tests excluded), so a dynamic or directory-scanning reader could be missed.
