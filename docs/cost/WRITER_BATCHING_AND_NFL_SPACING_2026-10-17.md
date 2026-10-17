# Writer batching and NFL event-window spacing: two cost analyses (2026-10-17 ~06:30–09:00Z)

**Status:** analysis plus one local prototype on its own branch.
- Nothing was merged, deployed, dispatched or built, and no paid API was called. The main checkout was not touched.
- I made 6 GitHub API reads (workflow run lists).
- Everything else came from local git history and the data already fetched for `COST_REDUCTION_PACKAGE_2026-10-17.md`.

**Builds on, without redoing:**
- `COST_REDUCTION_PACKAGE_2026-10-17.md`: item 2 (batch the non-input writers) and item 3 (NFL publish spacing);
- `BUILD_BASELINE_2026-10-16.md`;
- the replay outputs `push-replay.json`, `push-refined.json` and `vstat-nodep.tsv`.

**Window and predicate:** the same window as the package, 2026-10-09 00:14Z → 2026-10-17 01:04Z (**8.03 days**), and the same build-input predicate, parsed from `origin/main:app/scripts/vercel-ignore-build.sh`. That predicate is `BUILD_INPUTS` minus `app/public/data/ops/`, minus `app/**/*.test.mjs`, `app/e2e/**` and `app/scripts/ci/**`.

**Rule for numbers:**
- **MEASURED** = counted from GitHub/Vercel statuses and git.
- **REPLAY** = a counterfactual computed on that real history.
- **ESTIMATE** = CPU-minutes from COST-001's per-event figures: ≈35–49 CPU-min per completed build and ≈16 per Ignored-Build-Step skip (one sample; both pre-date the worker cap).
- No dollar figure is claimed.

---

## 0. Summary

### Analysis 1: per writer
"Solo" pushes are pushes that contain only that writer's commits. All figures are per day.

| Writer | Solo pushes (MEASURED) | Recommendation | Avoided completed builds (REPLAY) | Avoided ignored skips (REPLAY) | Max added latency | Approval |
|---|---|---|---:|---:|---|---|
| **auto-refresh (ops)** | 3.74: 27 ignored, 2 completed, 1 canceled | **A′: content gate.** Push only when a reader-visible field moves, with a 6 h heartbeat floor. **Prototype built** (§1.6). | **0.25** | **2.12** (+0.12 canceled) | Public fields: **0**. Ops clocks on main: ≤ ~1 h (replay max 0.9 h). | Founder (protected workflow) |
| **nfl sim v2 shadow** | 2.99: 17 completed, 4 canceled, 3 ignored | **D: do nothing.** Plus a founder decision on a predicate gap (§1.2a). | 0 | 0 | 0 | Founder (only for the predicate question) |
| **mlb pregame archive metadata** | 5.11: 26 ignored, 9 completed, 6 canceled | **D for the 2026 postseason.** The value ends with the World Series in about 2 weeks. **B (data branch)** is designed for the 2027 season. | 0 now. B: 0.75 | 0 now. B: 3.24 | B: 0 for readers that fetch the branch | Founder (2027) |
| **nba pre-tip window** | 2.86: 9 ignored, 7 completed, 7 canceled | **D before launch.** **B after launch**, with a GitHub-status witness. Volume will grow with the regular season. | B: 0.62 now (more in season) | B: 1.12 now | B: 0; pre-tip proof preserved (§1.5) | Founder |
| **cron-slot coverage** | 2.12: 6 ignored, 7 completed, 4 canceled | **D.** The observer's report must reach main; that was the P253 lesson. | 0 | 0 | 0 | none |
| **soccer DC v2 shadow** | 0.75: 4 completed, 2 canceled | **D.** Isolated by design; evidence-producing; once a day. | 0 | 0 | 0 | none |

**Recommended now (only the prototype):**
- **−0.25 completed builds/day, −2.12 ignored skips/day, −0.12 canceled/day.**
- ESTIMATE: ≈ 43–46 CPU-min/day.

**This revises the package's item 2 down from "−4.2 builds/day and −9.6 skips/day", for three reasons (§1.2):**
1. The sim-v2 shadow's "redundant" builds are **not redundant**. A public page reads those receipts at build time.
2. Pushing every Nth run **loses data**, because runners are ephemeral. Pushing to a data branch moves the evidence trail.
3. The MLB archive's value expires with the season.

### Analysis 2: NFL event-window spacing

The replay covers 10-09 → 10-17, with 70 window pushes and 62 completed builds. Spacing must be implemented as an **ignore-step deferral**:
- the commit still lands on main;
- the build is deferred, and the content rides the next build of anything.

A workflow-side "skip the push" would throw away paid odds captures and delay content up to 13.8 h (§2.3).

| Variant (ignore-step deferral) | Builds avoided/day (REPLAY range*) | Max data delay | Material pre-kickoff changes that miss the kickoff cutoff |
|---|---:|---:|---:|
| 60 min everywhere | 4.5 – 10.2 | 116 min | **6** (2 forecast-level: BAL @ ATL win 44.9→45.1 at T−9 min; injury inactives at T−53 min) |
| 120 min everywhere | 5.6 – 11.0 | 116 min | **6** |
| 60 min, none within T−3h | 0.8 – 4.2 | 33 min | 0 |
| **120 min, none within T−3h** | **1.1 – 4.9** | **43 min** | **0** |
| 60 min, none within T−6h | 0.6 – 3.7 | 33 min | 0 |
| 120 min, none within T−6h | 1.0 – 4.2 | 43 min | 0 |

\* The **low** end is the package's push-level model: deferred content waits for the next window publish. The **high** end is the ignore-step model: deferred content rides the next build of anything, and NFL-only race builds are also deferred. Treat the high end as an upper bound (§2.4).

**Recommendation: forecast quality before cost.**
- **Do not** adopt spacing near kickoff, and do not adopt it before the Oct 20 launch.
- After launch, the only variant I would put to the founder is **"120 min, none within T−3h of any NFL kickoff, never when live-props changed"**, implemented in the ignore step. It fails open. It runs for 2 weeks in **log-only mode** first.
- Game-day inactives land at **T−90 to T−60 min**. In the replay, 175 injury-status changes on playing teams arrived **< 1 h** before kickoff. Any rule that defers inside that band changes the forecast of record.

---

## 1. Analysis 1: writer batching

### 1.1 Measured baseline per writer (8.03 days, `writer-pushes.mjs`)

| Writer | Commits | Solo pushes | Completed: prev completed (redundant) | Completed: prev canceled/failed (carried a predecessor) | Canceled | Ignored | Pushes mixed with other writers |
|---|---:|---:|---:|---:|---:|---:|---:|
| nfl sim v2 shadow | 27 | 24 | 14 | 3 | 4 | 3 | 3 (all completed) |
| mlb pregame archive metadata | 42 | 41 | 6 | 3 | 6 | **26** | 1 |
| nba pre-tip window | 23 | 23 | 5 | 2 | 7 | 9 | 0 |
| cron-slot coverage | 17 | 17 | 1 | 6 | 4 | 6 | 0 |
| auto-refresh (ops) | 30 | 30 | 2 | 0 | 1 | **27** | 0 |
| soccer DC v2 shadow | 6 | 6 | 2 | 2 | 2 | 0 | 0 |
| **All six** | 145 | 141 | **30** | 15 | 24 | **71** | |

- These agree with the package's figures: 34 redundant builds there includes 4 mixed pushes, and 77 ignored there includes 6 from other writers.
- A "completed, previous canceled" build delivered a predecessor's content. Removing the writer's push does **not** save that build; the predecessor would have completed instead. It saves one canceled build.

**Run reliability (GitHub API, same window).** Every run of all six workflows concluded `success`:

| Workflow | Runs |
|---|---:|
| sim shadow | 67 |
| archive | 44 |
| nba-forecast-window | 100 of 240 listed |
| cron-watchdog | 18 |
| auto-refresh | 30 |
| soccer DC shadow | 8 |

The risk to batching is therefore **not** run failure. It is **cron delivery**:
- `mlb-pregame-capture` delivered 44 of 64 scheduled slots (69%);
- `auto-refresh` delivered 30 of 72 (42%);
- `cron-watchdog` delivered 18 runs (about every slot), but up to 8 h late (its 10:53Z and 14:30Z slots pushed between 15Z and 22Z).

A batching rule that waits for "the Nth run" or "the 01:00Z run" waits for a run that often never arrives.

### 1.2 Three findings that change the package's item 2

**(a) The sim-v2 shadow receipts are read at build time by public pages.**
- `app/src/app/nfl/simulation/[eventId]/page.tsx` and `components/nfl/simulation-v2-link.tsx` (rendered on `/nfl/game/[eventId]`) call `readShadowReceipts(<repo root>)` on `data/internal/research/nfl/sim-v2/shadow/` at build.
- `route-inventory.mjs` classifies `/nfl/simulation/[eventId]` as **public** (founder P0 2026-10-05). The page is live: `/nfl/simulation/401872983/` returns 200, and 30 pages are in the s16 export.
- Every receipt in the 37 shadow commits since 10-05 has `runCount = 10000` and `SHADOW` state, so each new pre-kickoff receipt becomes that game's showable "receipt of record".
- That directory is **not** in `BUILD_INPUTS`. The script's own comment says everything else under `data/internal` "is read only by pipeline scripts that are not build steps", and that is false for this path.

Consequences:
- The 14 "redundant" sim-shadow builds are the builds that **put the new receipt on the public page**.
- Of 6 receipts committed within ~1 h (up to 7 h) of kickoff, 4 reached Production through their own build before kickoff. The other 2 were ignored skips; their receipts went live with the next unrelated build, which happened to land before kickoff.
- Batching the shadow would delay or drop pre-kickoff receipts from the public page. Some receipts would then be selected as "record" after kickoff without ever having been served before it. That is the Option B tension the founder already ruled on for forecasts.
- **Founder decision needed, as a correctness item, not a cost item:** should `data/internal/research/nfl/sim-v2/shadow/` become a declared build input?
  - Cost: +3 builds per 8 days (the ignored ones), about +0.4/day.
  - Benefit: the predicate becomes honest.

**(b) What the pre-kickoff proof actually is.**

None of the three evidence-producing writers proves pre-start existence with git time:

| Writer | What decides "pre-start" |
|---|---|
| sim v2 shadow | `simulationOfRecord()` takes the latest receipt with `receipt.generatedAt < receipt.eventStart`. Write-once (`wx`); the commit step refuses any non-`A` status. |
| nba pre-tip | `forecast-receipt.mjs` sets `preTip: now < dateUtc`, and the grader counts `timing.preTip`. Write-once, verified against `HEAD` (main) before commit. |
| soccer DC shadow | The preregistration scores only matches "forecast before kickoff". The runner refuses (exit 3) if the frozen documents change. |

All three proofs are **self-attested embedded timestamps**. The per-run push to main adds three things:
1. **Durability.** A runner's files vanish when the job ends.
2. **Immutability against main.** Write-once checks run against main's tree.
3. **Third-party witnesses of existence before the start time:**
   - the `Vercel` commit status created on the pushed head;
   - for the sim shadow, the READY Production deployment that served the receipt (Option B-grade);
   - Actions run logs, which expire after 90 days.

Batching that moves a push past kickoff or tip removes witnesses (1)–(3) for exactly the record that matters. Any batching of these writers must therefore **push before the event's start**. A data branch must replace the Vercel witness with an equivalent one (§1.4 B).

**(c) "Push every N runs" is not a configuration change.**
- Runners are ephemeral, so an unpushed commit is lost when the job ends, not when a later run fails.
- Option A therefore needs **carry-forward**: download the previous run's artifact (archive: `mlb-pregame-archive-<run_id>`, 7-day retention), or regenerate.
- Regeneration is impossible for point-in-time captures (lineups, injuries at T−x). For write-once shadows it changes which artifact is the record.
- With carry-forward, observed run failures are 0, so loss is limited to an artifact-chain break. Unpushed work then piles up on runs that never arrive (69% / 42% delivery above).

### 1.3 Writer profiles (origin/main at 2c617c780c)

| Writer | Triggers | Writes (paths) | Readers | Public or build reader? | Evidence-producing? | Ordering needs | Push / race behaviour | Isolation |
|---|---|---|---|---|---|---|---|---|
| `nfl-sim-v2-shadow.yml` | `workflow_run` after `nfl-event-window` (completed); hourly `41 * * 9-12,1,2 *` fallback | `data/internal/research/nfl/sim-v2/shadow/<date>/<eventId>-<inputHash>.json` (add-only) | **`/nfl/simulation/[eventId]`, `/nfl/game/[eventId]` link (build)**; `/preview/simulation-v2` (internal) | **Yes, at build; not a trigger** | **Yes** (receipt of record = latest `generatedAt` < kickoff) | Must read the window's committed outputs; must land before kickoff | Own group `nfl-sim-v2-shadow`; 4 attempts, **merge** origin/main (never rebase) | **Deliberate:** own job and commit; red blocks nothing |
| `mlb-pregame-capture.yml` (opt-in commit step) | 8 crons (11, 15, 17, 19, 21, 23, 22:30, 01Z) + dispatch | `data/internal/mlb/pregame-archive/**` (≤128 KiB per file; large payloads gitignored, kept as artifacts for 7 days) | `nightly-settle` (row-lineage, 05:17–09:37Z), `mlb-research-integration` (12:40Z), research builders. `/markets` reads only the **precomputed** `public/data/research/row-lineage/index.json`. | No | Research eligibility `capturedAt < eventStartTime` (embedded) | Before 05:00Z for nightly-settle | Own group; `pull --rebase` once; push failure swallowed (artifact kept) | Step is `continue-on-error`; never blocks |
| `nba-forecast-window.yml` | hourly `17 * * * *`; `workflow_run` on publication-watchdog; dispatch from daily-products `tick` | `data/internal/research/nba/experimental{,-v0.1,-v0.2}/forecasts/**` + `research/injuries/nba/latest.json` | Its own `decide` step (**"has every family forecast this game?" reads main**); `sport-schedules`; `grade-nba-experimental-forecasts` | No | **Yes** (preregistration §8: only pre-tip forecasts count) | Must land before tip; the next run must see it (else re-forecast) | Own group; re-plans on new main up to 3× | Own group, deliberately not the shared writer group |
| `cron-watchdog.yml` (coverage step) | `53 10`, `30 14` daily, `30 9` weekends | `app/public/data/ops/{cron-slot-watchdog,lane-staleness,cron-punctuality,feed-health}.json`, `data/internal/research/ops/availability-audit.json` | `cron-punctuality.mjs`, `publication-slo.mjs`, `daily-owners.mjs` (scripts); `/ops` (pruned) | No (`app/public/data/ops` is pruned from the export) | No (monitoring) | None hard | 3× `pull --rebase` + push; **fails red** on purpose (P253) | Last step of the watchdog job |
| `auto-refresh.yml` | `0 12,14,16,18,20,22,0,2,4 * * *` (42% delivered) | `app/public/data/ops/{publication-slo,daily-owner-slo,heartbeat}.json` | **`publication-slo.json` top-level `state/platformState/publishDeadlineUtc/date/reason` is read at build by 7 public pages** (`read-publication-slo.ts`; a non-input that rides the next build); heartbeat → `check-heartbeat.mjs` (26 h), `build-admin-status.mjs` (36 h) | Yes (5 fields; not a trigger) | No | None | Shared `gtp-generated-artifacts`; 5× `pull --rebase` | Shares the writer queue |
| `soccer-dc-shadow.yml` | `45 9 * * *` | `data/internal/research/soccer/{laliga,serie-a,bundesliga}/{corpus,history,shadow-dc-v2}/…`, `shadow-dc-v2-summary.json` | `dixon-coles-shadow.mjs --grade` (itself) | No | **Yes** (preregistered; forecast before kickoff; one look at season end) | Before kickoff (72 h horizon) | Own group; 4× `pull --rebase` | **Deliberate** ("must never be the reason soccer-leagues does not publish") |

Proof that none touches a build input: `writer-inputs.mjs` found 0 of 145 commits matching the predicate. The predicate's own test and e2e exclusions do not matter here, because none of these writers writes under `app/` except `app/public/data/ops/`, which is excluded.

### 1.4 The four options, in general

- **A: push every N runs or on a time budget.** Needs carry-forward (§1.2c).
  - Loss model: zero observed run failures, so the expected loss is an artifact-chain break.
  - The real cost is **delay**. The pushing slot is delivered 42–69% of the time, so the expected added latency is about 1.5–2.4× the nominal budget.
  - **A′ (content gate)** is the safe sub-case. When a run's change is provably clocks only, the run is dropped, not deferred, and nothing is lost: the next run recomputes the state from scratch. This is what the prototype does.
- **B: write to a non-deployed data branch** (for example `data/research`). `app/vercel.json` deploys only `main` and `preview/**`, so pushes elsewhere create 0 deployments and 0 ignored skips (COST-001 §9).
  - Readers must `git fetch origin data/research` and read via `git show` or a worktree. Write-once verification moves to the branch tip.
  - **Evidence:** keep one commit per run, so the branch history is the ledger. Replace the lost Vercel witness with a **GitHub commit status set by the job** (`POST /statuses/{sha}`, context `evidence/pushed`). GitHub stamps `created_at` server-side, so it is a durable third-party pre-start witness, as strong as today's.
  - B is unusable for any path a build reads (the sim shadow; `publication-slo.json`).
- **C: fold into the upstream workflow's single push.** It only fits the two shadows, and both are isolated **by design**: a shadow crash must never block the forecast push. Rejected.
- **D: do nothing.**

### 1.5 Per-writer recommendation

**1. auto-refresh → A′, a content gate with a heartbeat floor (prototype, §1.6)**
- **Avoided (REPLAY, real history, other writers' commits kept):**
  - 30 → 10 pushes;
  - **−17 ignored skips, −2 redundant completed builds, −1 canceled** in 8.03 days;
  - −2.12 ignored/day and −0.25 completed/day;
  - a longer window (09-20 → 10-17) gives the same shape: 90 → 33.
- **Latency:**
  - none for public bytes. Every skipped run left the five fields public pages read byte-equal;
  - main's ops clocks lag by at most one skipped run. The replay's maximum heartbeat lag is **0.9 h**, because other writers refresh the heartbeat. The 6 h floor never fired.
- **Evidence:** not evidence-producing.
- **Failure modes:**
  - the gate fails open (commit) on any parse error, shape change, added or removed file, or non-ops path;
  - one risk: a future public reader of a field the gate treats as detail. Mitigation: the gate's public list is `read-publication-slo.ts`'s list, and a test should pin the two together (follow-up).
- **Verification:**
  - unit tests (12, pass);
  - the replay script;
  - after merge, 7 days of `auto-refresh` logs showing SKIP/COMMIT, plus `build-cost-report` ignored skips/day.
- **Approval:** founder (protected workflow).

**2. nfl sim v2 shadow → D.**
- Batching saves at most 1.1–1.4 completed builds/day (REPLAY at a 12–24 h budget). Those builds publish public receipts, and near kickoff they are the only build that serves the final pre-kickoff receipt (4 of 6 cases).
- C breaks deliberate isolation. B breaks the public page.
- Separately, decide §1.2a: declaring the receipt directory a build input costs about +0.4 builds/day.

**3. mlb pregame archive → D through the World Series; B for 2027.**
- A with carry-forward avoids, per day:

  | Budget | Ignored | Redundant | Pushes (8 days) |
  |---|---:|---:|---|
  | 6 h | 1.62 | 0.12 | 41 → 26 |
  | 12 h | 1.99 | 0.25 | 41 → 22 |

- About 10 slate days remain. ESTIMATE: ≈ 300–400 CPU-min in total, which does not justify changing a `continue-on-error` capture workflow before launch.
- **B in 2027** (≈ 8 runs/day × ~180 days) avoids 3.24 ignored + 0.75 completed per day at today's rate.
  - Readers to migrate: `nightly-settle` (`build-research-row-lineage.mjs`, the archive `settlement-joins`), `mlb-research-integration`, `mlb-daily-production` (health status), and the capture's own reads.
  - Approval: founder.

**4. nba pre-tip → D before launch; B after launch.**
- A is unsafe:
  - every commit is a forecast owed within 8 h of tip;
  - the next run's `decide` reads main to know what is already forecast, so an unpushed forecast is re-made with a later `inputAsOf`, and the record changes.
- **B** avoids 0.62 completed + 1.12 ignored + 0.87 canceled per day at the current pre-season rate. That rises roughly with the number of games once the regular season starts.
  - Requirements: `decide`, `build`, `verify --against`, `grade`, and `sport-schedules` read the branch; the job sets an `evidence/pushed` commit status.
  - **Evidence preserved:** same embedded `preTip`, same write-once, a server-stamped witness per run.
  - Verification: replay 2 weeks of committed forecasts onto the branch layout, run `verify-nba-forecast-receipts` and the grader against it, and diff the graded output byte-for-byte.
  - Approval: founder.

**5. cron-slot coverage → D.**
- A 6 h budget would avoid 0.37 ignored and 0.12 completed per day.
- This is the observer whose silent push failure went unseen for 3 weeks (P253). It runs at most 3 times a day, and its report reaching main is its output.

**6. soccer DC v2 shadow → D.**
- At most 0.25 completed builds/day.
- It runs once a day, is isolated by design, and its preregistered forward record must land before kickoff.

### 1.6 Prototype: auto-refresh ops commit gate

**Branch:** `claude/writer-batching-prototype` at **`c4f9304eb9`**, cut from `origin/main` 2c617c780c. Pushed; **no PR**.

| File | Role |
|---|---|
| `app/src/lib/ops/ops-commit-gate.mjs` | Pure decision. COMMIT when any of these changed: a `publication-slo` public field (`state`, `platformState`, `publishDeadlineUtc`, `date`, `reason`), a `sports.<s>.state`, `daily-owner-slo` `date`/`state`/`owners[id].state`, or heartbeat `ok`/`status`/`phase`/`date`/`message`. Also COMMIT when main's heartbeat would be ≥ 6 h behind. Fails open. |
| `app/src/lib/ops/ops-commit-gate.test.mjs` | 12 tests: clock-only skip, every COMMIT trigger, floor boundary, fail-open cases. |
| `app/scripts/ops/ops-commit-gate.mjs` | CLI on the staged index. Exit 0 = commit, 10 = skip, errors → 0. Exercised on real commits `4e90050eec` (SKIP) and `525c52a593` (COMMIT). |
| `app/scripts/ops/ops-commit-gate-replay.mjs` | History replay. It reconstructs main's version of each file as if the skipped pushes never landed, keeping other writers' commits. |
| `.github/workflows/auto-refresh.yml` | 10 lines in the default (zero-credit) commit step. The paid-path steps are untouched. |

**Results:**
- The adjacent workflow tests pass (54/54: `workflow-failure-visibility`, `push-failures-are-visible`, `publication-slo`, `workflow-shell-syntax`, gate).
- REPLAY (8.03 d): **30 → 10 pushes**. Avoided: 17 ignored, 2 completed (both "previous completed", so truly redundant), 1 canceled.

---

## 2. Analysis 2: NFL event-window spacing (analysis only)

### 2.1 What a window publish changes (124 window commits 10-01 → 10-17; `nfl-window-material.mjs`)

**Every publish rewrites:**
- `app/public/data/nfl/forecasts/{latest,frozen-latest,<date>}.json` (forecasts);
- `player-board/*` (player props);
- `weekly-boards`, `score-shape`, `rosters/latest.json`, `index.json`, `product-receipts`, `participation`, `role-evidence`;
- `data/internal/research/injuries/nfl/latest.json`;
- **on capture runs only:** an odds capture plus the `p171-ledger`.

**Settlement receipts and `live-props`** ride the same push (one push per run since COST-001 Stage A).

**Material change**, compared against the previous publish and counting pre-kickoff games only. `inputHash` is excluded because it changes on every run.

| Kind | Changes | Notes |
|---|---:|---|
| Forecast number (win, margin, total, score) | 173 in 23 publishes | Median 0.10 pp. 9 changes ≥ 1 pp; max 17.5 pp (PHI @ JAX on 10-08, when a QB-absence model input changed state) |
| Forecast state (`teamInputs`, side, market-comparison state or numbers) | 228 | Mostly market numbers after odds captures |
| Player board (non-clock leaves) | 529 | Prop means and quantiles; market line and odds |
| Injury status, player on a team with a game in the next 7 days | 439 games-with-changes | 1,267 player changes > 24 h out; **185 in the last hour**; 83 at 1–3 h |

Injuries do **not** move the win, margin or total head: `teamInputs.consumedByModel: false`. They do move:
- `teamInputs`: QB absence → `WITHHELD_TEAM_INPUTS` market view;
- the player boards;
- the "Inputs as of … injuries …" stamp.

### 2.2 How often material changes follow closely, and how close to kickoff
- Publish gaps:
  - median 57 min;
  - 63 of 123 gaps ≤ 60 min;
  - 74 ≤ 120 min.
- Of the 63 publishes ≤ 60 min after the previous one:
  - **36 carried a material pre-kickoff change**;
  - 31 had injury-status changes;
  - 3 had forecast-number changes.
- In those ≤ 60-min publishes, injury changes cluster at kickoff:

  | Time to kickoff | Player-status changes |
  |---|---:|
  | < 1 h | **175** |
  | 1–3 h | 74 |
  | > 24 h | 82 |

  This is the game-day inactives list (≈ T−90 min).
- Forecast-number changes inside T−3h: 9 in total.
  - 7 at T−2.3 h (the 10-04 morning sweep);
  - **BAL @ ATL at T−9 min** (win 44.9 → 45.1, 43 min after the previous publish);
  - **SEA @ DEN at T−5 min** (55.0 → 55.2; 35 min after the previous one).

  The SEA @ DEN change was probably not served before kickoff even today: the build p50 is about 5 min. It is one of the 2 "baseline misses" in the replay.

### 2.3 Two ways to implement spacing, and why only one is acceptable

1. **Workflow-side: the window skips its push when the last push was < S ago.** The package's 62 → 28 figure is this model.
   - The run's commits are lost: the window's odds capture is paid (credits and ledger), and its receipts and injuries are point-in-time.
   - Deferred content waits for the **next window run**. In REPLAY (60 min everywhere) that wait is p50 2.3 h over 10-01 → 10-17 (4.5 h over 10-09 → 10-17), max 13.8 h.
   - **26 material pre-kickoff changes miss the cutoff, 8 of them forecast-level.** Example: the 10-04 15:03Z capture's fresh market numbers and prop lines for eight 1 pm games, at T−1.9 h, would never have been served, because the next run came at 17:19Z.
   - **Rejected.**
2. **Ignore-step deferral.** The commit lands on main as today, preserving evidence and receipts. `vercel-ignore-build.sh` skips the build when all three of these hold:
   - the diff since `VERCEL_GIT_PREVIOUS_SHA` is confined to NFL-window-owned paths, **excluding** `app/public/data/nfl/live-props/`;
   - the previously deployed commit is < S old;
   - **no NFL kickoff is within X h**, read from `app/public/data/nfl/forecasts/latest.json` `kickoffUtc` at HEAD.

   The content rides the next build of anything; the window's own next push builds once S has elapsed. It fails open (build) on any error.

### 2.4 Replay (10-09 → 10-17 real push stream; `nfl-spacing-ignore-step.mjs`, `nfl-spacing-workflow-side.mjs`)

| Variant | Window builds (of 81 NFL-only completed) | Builds avoided/day: low (window-only model) – high (ignore-step model) | Delay p50 / p90 / max | Missed cutoff (material, pre-kickoff) |
|---|---:|---:|---|---:|
| 60 min everywhere | 4 | 4.5 – 10.2 | 13 / 33 / 116 min | 6 (2 forecast) |
| 120 min everywhere | 1 | 5.6 – 11.0 | 14 / 37 / 116 min | 6 (2 forecast) |
| 60 min, none ≤ T−3h | 49 | 0.8 – 4.2 | 8 / 26 / 33 min | 0 |
| **120 min, none ≤ T−3h** | 47 | **1.1 – 4.9** | 8 / 33 / **43 min** | **0** |
| 60 min, none ≤ T−6h | 54 | 0.6 – 3.7 | 8 / 26 / 33 min | 0 |
| 120 min, none ≤ T−6h | 52 | 1.0 – 4.2 | 8 / 26 / 43 min | 0 |

Reading the range:
- **Low end** = the package's push-level count (deferral costs no other build).
- **High end** = the ignore-step model, which also defers NFL-only "race" builds (a sim-shadow or other non-input push landing while NFL content is pending). It approximates the deployed time with the push time, so treat it as an **upper bound**.
- Neither model counts the sim-v2 receipts' public page. Under deferral, those receipts ride the same deferred build, inside the same delay bound.

### 2.5 Integrity, live tracking, freshness claims

- **Frozen-forecast integrity.** The forecast of record is the last revision **served** by a READY deployment before kickoff (Option B).
  - With a **T−3h exemption**, every publish within 3 h of any kickoff builds exactly as today. The replay shows **0** material changes moved past kickoff, so the record is unchanged.
  - Outside the exemption, intermediate revisions may be superseded before ever being served. That thins the served-revision history days before kickoff, but not the record.
  - **Without** the exemption, the record changes. Six material changes, including BAL @ ATL's final win probability and three PHI @ JAX inactives at T−53 min, would have reached Production only after kickoff.
- **Live tracking** is mostly independent of builds:
  - the hub reads the runtime gateway (`/api/live`, `lib/live/client.ts`; freshness bands `FRESH_MAX_MS` 45 s and `DELAYED_MAX_MS` 120 s, measured against `fetchedAt` on the reader's clock);
  - the per-player **live-props record** is a static file (`/data/nfl/live-props/<id>.json`, `use-live-props.ts`), written by `nfl-live-props(-free).yml` and the window's settlement step. It **does** need builds.
  - The spacing rule must therefore never defer a diff that touches `live-props`. Sunday-afternoon runs are also inside T−3h of the next kickoff.
- **User-facing claims affected:**
  - `components/nfl/forecast/methodology.tsx`: "Until kickoff a later run may update these numbers when an input changes (each version is kept); at kickoff the last version is frozen." It stays true only with the exemption.
  - The "Inputs as of: forecast … injuries … rosters …" stamps would be up to the max delay (33–43 min) staler outside T−3h.
  - No public copy promises a specific refresh interval for NFL.

### 2.6 Recommendation
1. **Before launch: no spacing.** Forecast quality outranks a ≤ 4.9 builds/day upper-bound saving (ESTIMATE ≤ 170–240 CPU-min/day).
2. **After launch, if the founder wants it:** "120 min, none within T−3h of any NFL kickoff, never when `live-props` changed", in the ignore step, failing open.
   - Ship it **log-only** for 2 weeks (`WOULD_DEFER` lines).
   - Then re-run `nfl-window-material.mjs` plus the replay against real kickoffs.
   - Promote only if the maximum delay is ≤ 45 min and the missed-cutoff count is 0.
   - Approval: founder (ignore-step semantics plus a freshness decision).
3. **Never** adopt "spacing everywhere" or a workflow-side skip.

---

## 3. Reproduce

Scratch inputs are as in the package (`fp-order.tsv`, `deps-all.tsv`, `vstat*.tsv`, `push-refined.json`). Scripts are in `docs/cost/scripts-2026-10-17/`.

```
node writer-pushes.mjs <repo> <scratch> <scratch>/wb/writers.json            # §1.1 per-writer push accounting
node nfl-window-material.mjs <repo> <scratch>/wb/nflmat.json                 # §2.1 material-change ledger (git only, ~60 s)
node nfl-spacing-workflow-side.mjs <scratch>/wb/nflmat.json 2026-10-09 2026-10-17T01:11
node nfl-spacing-ignore-step.mjs <scratch>                                   # reads wb/writers.json + wb/nflmat.json
# prototype branch:
node app/scripts/ops/ops-commit-gate-replay.mjs [--since … --until …]
npx tsx --test app/src/lib/ops/ops-commit-gate.test.mjs
```

## 4. Caveats
- **Kickoffs** come from `forecasts/latest.json` `kickoffUtc` as committed; time-to-kickoff uses commit time; the served time is modelled as push + 6 min.
- **"Material" is structural.** A 0.1 pp win change counts. The injury classification counts every status change on a team playing within 7 days, including ones that change no public number.
- **Option B cost** was not measured here. `B` costs for the archive and NBA (reader migration) are design estimates.
- **The ESTIMATE CPU figures** rest on one 16 CPU-min skip sample and pre-cap build figures. Billed effect needs `cpuTimeForBilling` (package Part D).
