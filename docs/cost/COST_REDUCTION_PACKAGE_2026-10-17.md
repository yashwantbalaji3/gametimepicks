# Vercel cost-reduction package, measured 2026-10-17 ~01:45Z

**Status:** read-only analysis. No builds, merges, deploys, dispatches or workflow changes were made. GitHub API reads were limited to about 165 calls (Production deployments page 1, plus `Vercel` commit statuses for 12 new deployment SHAs and 152 non-deployed first-parent commits).

**Builds on:**
- COST-001 (billing: Build CPU is 99.9% of the bill; ≈35–49 CPU-min per build on Enhanced; ≈16 CPU-min per Ignored-Build-Step skip, from one sampled deployment);
- `BUILD_BASELINE_2026-10-16.md` (#1116);
- #1088 (MLB stamp gate), #1117 (HTML series), and the NFL receipts-gate report.

**Rule for every number below:**
- **MEASURED** means computed from GitHub records, git history or a local export.
- **ESTIMATE** means a CPU-minute conversion using COST-001's pre-10-07 per-build figures.
- No dollar saving is claimed. Billed savings need Vercel `cpuTimeForBilling` or the usage page, and that is a founder-provided input.

---

## 0. Prioritised table

| # | Item | Mechanism | Evidence (numbers + method) | Expected impact | Risk | Effort | Approval |
|---|---|---|---|---|---|---|---|
| **1** | **MLB stamp-only gate (#1088)** | Workflow-side allowlist gate. It applies to `mlb-lineup-refresh` and `mlb-daily-production`, and has three parts: (a) stamp allowlist per file plus identical-snapshot drop; (b) `admin/status.json` becomes a non-input; (c) a 6 h heartbeat, failing open. | **MEASURED, per push**, 10-09→10-17:<br>• 55 of the 73 completed pushes that contained a lineup refresh changed build inputs only in ISO-clock leaves (identical new snapshot included).<br>• 40 `mlb daily production` pushes become avoidable when `status.json` is a non-input and `priceAgeDays` is a stamp.<br>• #1088's own replay: 24 → 7 build-triggering commits. | **Up to 11.8 completed builds/day** (95 / 8.04 d, upper bound before the heartbeat). Realistically **≈7–10/day**.<br>ESTIMATE: ≈245–490 CPU-min/day.<br>**Ends with the World Series.** | Low (fails open; heartbeat).<br>Side effect: its publication-SLO clause turns **7 of 77** ignored pushes into builds (+0.9/day). | Done (PR open) | Founder: protected workflows |
| **2** | **Batch the non-input writers.** These are writers whose commits **never** touch a build input: sim v2 shadow, MLB pregame archive, NBA pre-tip, cron-slot coverage, ops auto-refresh, soccer DC shadow. | Put their output in the next push that already builds, or push on a slower cadence. No ignore-step change. Per-writer plan in §1.3. | **MEASURED:**<br>• 168 commits in 8 days from these writers; **0** touched a build input (main's predicate).<br>• They caused **34 redundant completed builds**: own diff had no input, previous build completed, and **31/34 were pushed while the previous build was still running**.<br>• They caused **77 Ignored-Build-Step pushes**, which are still billed. | **−4.2 completed builds/day and −9.6 ignored skips/day.**<br>ESTIMATE: ≈300–360 CPU-min/day.<br>**Year-round.** | Low–medium. Downstream consumers of `data/internal/**` must still see their inputs in time (§1.3). | Small per workflow | Founder: protected workflows |
| **3** | **NFL event-window publish spacing** | A minimum interval between window publishes outside the pre-kickoff window. Coalescing keeps the latest run; receipts already ride the same push. | **MEASURED:**<br>• 62 completed builds/8 d (7.7/day). **All carry real content**: `inputHash` changed in 35/35 sole-cause pushes, and score-shape probabilities changed.<br>• Median gap between window pushes is **26 min**.<br>• Replay with 60-min spacing: **62 → 28**. With 120 min: 62 → 21. | **−4.2 builds/day** at 60 min.<br>ESTIMATE: ≈150–205 CPU-min/day.<br>Costs up to 60 min of NFL forecast freshness. | Medium: freshness (founder SLO decision) | Small | **Founder freshness decision** |
| 4 | Skip lint and type-check on data-only builds | `next build` lints and type-checks on every Production build; `next.config.mjs` has no `eslint`/`typescript` skip. When the diff since the deployed SHA touches no code, skip them; fail open to full checks. | **MEASURED:** 443 of 472 completed builds (94%) contain no PR-merge or human commit.<br>**MEASURED locally:** lint+types sits inside a 44 s→≤86 s window of a 134 s `next build`. The exact share is unmeasured. | **ESTIMATE:** up to ~15–25% of build wall time per data build. Needs a local A/B. | Low (CI quality-gate type-checks every PR, and bots do not change code) | Small | Founder |
| 5 | Re-test Vercel Standard plus the included slot, now that the worker cap exists | COST-001 §11 Docker 4 CPU / 7.6 GB harness, re-run at `cpus: 4` and `cpus: 3` | **MEASURED** (#1094 local runs): simultaneous worker RSS **5.76 G** at 4 workers, 5.43 G at 3.<br>COST-001 §11 (before the cap): hit the 7.36 GiB ceiling with an OOM kill. | Potentially the largest lever: COST-001 said "most of the remaining … ≈ $10–40/month", from billing.<br>**Unproven:** builds get about 2× slower on a single slot. | High if done without proof (wedges) | Medium (local test only) | Founder (setting) |
| 6 | Markup reductions (Part B, top 5) | Composite classes, shared SVG defs, footer out of the RSC tree | **MEASURED** bytes, s16-relmerge export (§2) | **≈ −200 MB of 1,209 MB** (bytes only; #1117 found **no measurable build-time change** from −27% HTML) | Low (computed-style equivalence, as #1117) | Medium | Founder (release) |
| 7 | Cost-monitoring report (Part D) | GitHub-API-only daily script (spec in §4) | n/a | Detection, plus the before/after record for items 1–5 | None | Small | None (docs/script) |

**Not recommended, with evidence:**
- **NFL receipts gate on its own:** 0 deployments avoided (it shares the window push), as the receipts-gate report found.
- **Further path exclusions for `daily products`:**
  - only **2** of its pushes were clock-only;
  - widening to all `admin/*.json` and projection receipts adds **~1.1/day** (9 pushes / 8 d) and needs a reader trace for each `admin/*` file.
- **Pregame weather** (16 pushes), **NBA results** (28) and **nightly settle** (35): their non-clock leaves are real content (`tempF`, `ftHome`, `settled_leans.jsonl`). They are gateable only with a freshness decision.

---

## 1. Part A — unnecessary Production builds

### 1.1 Method (reproducible; scripts in this scratchpad)
1. **Deployments.** I took 812 Production GitHub deployments (vercel[bot]) and ordered them by **position on main's first-parent history**, not by `created_at`.
   - Queued deployments are created in bursts with identical timestamps. Sorting by `created_at` produced 60 phantom zero-commit "pushes"; this ordering fixes that.
   - 3 deployments of SHAs not on first-parent main were dropped.
2. **Defining a push.** A **push** is the commits between the previous deployment's SHA and this deployment's SHA (the pushed head).
   - Pushes that the Ignored Build Step skipped get **no** GitHub deployment. For example, #1114's merge `2cb1ba3920` has only a `Canceled by Ignored Build Step` status.
   - So their files fold into the next push. By construction this adds no build input.
3. **Build-input predicate.** It is parsed at run time from `origin/main:app/scripts/vercel-ignore-build.sh` (post-#1091):
   - `BUILD_INPUTS`;
   - minus `app/public/data/ops/`;
   - minus `app/**/*.test.mjs`, `app/e2e/**`, `app/scripts/ci/**`.

   **#1088's `buildInputPredicate` was not used:** it treats test files as inputs, which main no longer does. The parsed arrays are saved in `predicate.json`.
4. **Classifying each completed push** (diff from the previous deployment SHA to this SHA):
   - `NO_INPUT`: no build-input file changed.
   - `CLOCK_ONLY`: every changed leaf of every changed build-input JSON is an ISO-8601 datetime, and every added JSON equals its newest same-shape sibling at the base once clocks are ignored. This is the identical-snapshot case.
   - `MEANINGFUL`: anything else, including non-JSON changes, deletions, unparseable files, or a single changed number.

   `CLOCK_ONLY` is an **upper bound**, because it does not know which clocks a reader renders.
5. **Attribution.** Each `MEANINGFUL` push is attributed to the workflow(s) whose commits touched its non-clock files.
6. **Outcomes.** Completed, canceled and failed come from the final `Vercel` commit status on the deployed SHA. Ignored pushes come from statuses on the 152 first-parent commits that have no deployment.

Scripts: `push-replay.mjs`, `push-refine.mjs`, `push-analyze.mjs`, `whatif.mjs`, `ignored.mjs`, `slo-clause.mjs`, `writer-inputs.mjs`.
Outputs: `push-replay.json`, `push-refined.json`, `vstat-nodep.tsv`.

### 1.2 Results: window 2026-10-09 00:08Z → 2026-10-17 01:10Z (8.04 days)

| | Count | Per day |
|---|---:|---:|
| Push heads with a Vercel status | 673 (595 deployments + 77 ignored + 1 other) | 83.7 |
| Completed builds | 472 | 58.7 |
| — MEANINGFUL | 359 | 44.7 |
| — CLOCK_ONLY (upper bound) | 62 | 7.7 |
| — NO_INPUT | 51 | 6.3 |
| &nbsp;&nbsp;of which previous build **completed** (pure redundancy) | 34 | 4.2 |
| &nbsp;&nbsp;of which previous build canceled/failed (delivered its content; necessary) | 17 | 2.1 |
| Canceled deployments | 112 | 13.9 |
| Failed deployments | 11 | 1.4 |
| Ignored-Build-Step pushes (billed, per COST-001 §2.4) | 77 | 9.6 |

**Redundancy mechanism, now confirmed per push.**
- 31 of the 34 redundant builds had their first `Vercel` status (the push) **before the previous build finished**.
- The deployment record itself is created about 5 min later: the p50 lag from status to deployment is 5.0 min.
- So `VERCEL_GIT_PREVIOUS_SHA` is bound while the predecessor is queued or building. The diff then spans the predecessor's inputs, and the push builds a second time.
- The "one build per branch" queue (COST-001 B) did not remove this.
- The fix needs no ignore-step change if the writers stop pushing on their own (item 2).

**Completed builds per day:**

| Day | Deployments | Completed | Canceled | Failed | NO_INPUT | CLOCK_ONLY+MEANINGFUL | Sum e2e min |
|---|---:|---:|---:|---:|---:|---:|---:|
| 10-09 | 79 | 69 | 10 | 0 | 9 | 60 | 364 |
| 10-10 | 78 | 63 | 14 | 1 | 8 | 55 | 303 |
| 10-11 | 91 | 74 | 16 | 1 | 7 | 67 | 363 |
| 10-12 | 67 | 57 | 8 | 2 | 7 | 50 | 266 |
| 10-13 | 74 | 60 | 14 | 0 | 6 | 54 | 368 |
| 10-14 | 70 | 47 | 21 | 2 | 6 | 41 | 415 |
| 10-15 | 69 | 45 | 19 | 5 | 3 | 42 | 330 |
| 10-16 | 64 | 54 | 10 | 0 | 5 | 49 | 269 |

The e2e minutes run from first status to final status, so they include queue time.

**Per workflow: completed builds for which the workflow was the sole cause (non-clock content), 8 days:**

| Workflow | Sole-cause builds | What changed | Verdict |
|---|---:|---|---|
| mlb lineup refresh | 73 pushes contain it; **55 CLOCK_ONLY**; 18 real (`winProbability`, `artifactHash`, new non-identical snapshot) | `full-game-simulations`, `predictions`, prediction snapshots | **#1088** |
| mlb daily production | 48 | `admin/status.json` (`workflowHealth.*`, `todayReadiness.etTime`), tier-grid `evidence.priceAgeDays`. **40** pass once `status.json` is a non-input and `priceAgeDays` is a stamp (both in #1088). | **#1088** |
| nfl event window (+ receipts) | 62 | `inputHash` (35/35), score-shape probabilities, `product-receipts.runId` | Real content: cadence lever (item 3) |
| daily products | 49 | Projection receipt `contentSha256` and `files[].sha256`; evidence-ledger `entries[].evidence`; lab-ledger `priceAgeDays` | Mostly real; ~1/day more with admin/receipt exclusions |
| nightly settle | 35 | `settled_leans.jsonl`, results projection, lab-ledger | Real (daily results) |
| nba results capture | 28 | `rows[].ftHome/ftAway/statusRaw` | Real (scores) |
| epl | 22 (+3 CLOCK_ONLY) | Odds `rows[].*`; `admin/epl-lane.json` `hoursAway/ageHours` | Mostly real |
| PR merges / human | 25 | Code | Real |
| ufc | 20 | `results-latest`, `ufc-lane` ages, card | Mostly real |
| pregame weather | 16 | `tempF`, `windMph`, `precipPct` | Real |
| soccer leagues / morning projections / forecast ledger / top boards / nfl other | 10 / 6 / 6 / 2 / 9 | New dated files, ledger rows, schedules | Real |

**What-if exclusions** (`whatif.mjs`; additional completed pushes avoidable on top of CLOCK_ONLY):

| Scenario | Avoidable pushes | Breakdown |
|---|---:|---|
| `admin/status.json` non-input only | +22 | All mlb daily production |
| plus clock-derived ages (`ageHours`, `hoursAway`, `priceAgeDays`, `etTime`) | +44 | 39 mlb daily production, 2 daily products, 1 epl, 1 ufc, … |
| plus all `admin/*.json` and projection receipts | +49 | |

These show that outside MLB, metadata exclusions are worth about 1 build/day.

### 1.3 Top 3 candidates: mechanism and proof that legitimate changes still publish

**1. #1088 MLB stamp gate**

*Mechanism:* as built — an allowlist per file pattern, an identical-snapshot drop, `status.json` as a non-input, a 6 h heartbeat, and uncertainty publishing. It also adds a deploy-trigger clause: changes to the public fields of `publication-slo.json` build on their own. My replay finds that clause **turns 7 of the 77 ignored pushes into builds** (+0.9/day), which is a freshness win paid for in builds. State this in the approval package.

*Evidence for approval:*
- **(a) Replay on the latest 7 days per push**, not per commit, with the shipped allowlist. The expected range is 7–10 avoided builds/day; compare against this doc's 95 upper bound.
- **(b) Real changes still publish.** Every push classed `MEANINGFUL` in `push-refined.json` that touches MLB must still publish under the gate. That is 18 lineup pushes and 8 daily-production pushes with `winProbability`/`simulationProbability` changes, and none may be suppressed. This is a mechanical check: run `stampOnly` on each.
- **(c) Heartbeat.** The heartbeat publishes at least every 6 h on slate days.
- **(d) Reader trace.** The `internal-route-exclusion` test proves `status.json` is read only by the pruned `/ops` and `/launch` routes.

*Time limit:* it is only worth this while MLB plays, through the World Series.

**2. Batching the non-input writers** (MEASURED: 0 of 168 commits touched a build input)

| Writer | Commits | Redundant completed builds | Ignored pushes | Safe mechanism | Constraint to prove |
|---|---:|---:|---:|---|---|
| nfl sim v2 shadow | 27 | 14 (+1 with PR, +3 prev-canceled) | 3 | Commit in the **same push** as the `nfl event window` run it shadows (same job, or `needs:` plus a single push). The shadow currently pushes minutes after the window push, while that build is queued. | The shadow reads the window's outputs. Show the shadow inputs at the window commit are byte-identical to today's. |
| mlb pregame archive metadata | 42 | 6 (+3) | **26** | Accumulate and push once per day before `mlb-daily-production` runs, or push only together with a lineup-refresh commit | Readers are `mlb-daily-production`, `mlb-research-integration` and the research builders. Show the batched archive is complete before their schedules. |
| auto-refresh (ops) | 30 | 2 | **27** | (i) Skip the commit when only `heartbeat.json` `lastRunAt` would change. (ii) Or move `heartbeat.json`/`daily-owner-slo.json` to a non-deployed `ops-state` branch. COST-001 §9 proved a non-main push creates 0 deployments. `publication-slo.json` **must stay on main**, because public pages read it at build. | Readers of `ops/heartbeat.json`: `check-heartbeat.mjs`, `ops-notify.mjs`, `build-admin-status.mjs`. The dead-man's switch must keep reading the same clock: a watchdog test against the new location. |
| nba pre-tip window | 23 | 5 (+2) | 9 | Fold into the next build-triggering NBA push, or push every Nth run | Research only (`data/internal/research/nba`). Show no workflow reads it within the batching delay. |
| cron-slot coverage | 17 | 1 (+6) | 6 | Push once per day | Readers are `cron-watchdog.yml` and the `ops/cron-*` scripts. Prove the daily cadence satisfies the watchdog window. |
| soccer DC v2 shadow | 6 | 2 (+2) | 0 | Same-push as soccer-leagues | Same as the sim shadow |

**Proof that legitimate changes still publish:** by construction, none of these commits contains a build input (`writer-inputs.mjs`). Batching therefore cannot delay any public byte. Add a CI guard that fails if a batched writer ever stages a path matching main's predicate.

**3. NFL event-window spacing.** Every window push carries new content, so a gate cannot help. The lever is a founder SLO, for example a minimum interval of 60 min, except in T−90 min → kickoff and during live games.
- Replay of the 62 completed builds: 60 min gives **28**, 120 min gives 21.
- *Evidence for approval:* re-run the spacing replay on 2+ weeks of window commits with the real kickoff calendar. Show the maximum forecast age at kickoff is unchanged: the last pre-kickoff run must always publish.

---

## 2. Part B — build size (export `gametimepicks-wt/s16-relmerge/app/out`, combined HTML+UX release at bb4f4a02be)

**MEASURED totals:**
- **1,209 MB**, 7,656 files.
- HTML: 2,865 files, 862 MB, of which `__next_f` inline RSC is 337 MB.
- RSC `.txt`: 2,864 files, 294 MB.
- JSON: 57 MB. `_next/static`: 2.5 MB.

Main as of 10-16 (`html-base`) was 1,579 MB on disk.

**By family** (`markup-potential.mjs`, `html-anatomy.mjs`):

| Family | Pages | HTML MB | .txt MB | `__next_f` share | `class=` share | Note |
|---|---:|---:|---:|---:|---:|---|
| `mlb/board/<date>` | 147 | 337.7 | 48.1 | 16% | **40%** | 2.3 MB/page. 29.8k elements/page; tile class string ≈230 B × ~1,600/page. 545 sparkline SVGs, each with its own `<linearGradient>`. |
| `results/date/<date>` | 133 | 141.8 | 78.9 | **64%** | 20% | Server-rendered table serialised in both HTML and RSC: 12.5k RSC elements/page; `className` is 36% of RSC. |
| `players/{nfl,epl,mlb,ufc}` | 1,810 | 227.4 | 92.4 | ~50% | ~16% | Mostly the per-page chrome floor (below) |
| `games/nfl` | 22 | 23.5 | 16.7 | 79% | 7% | Histogram props (711 buckets) plus 2,235 inline style objects in RSC |
| `nfl/game`, `matchups/*` | 384 | 59.4 | 24.7 | ~48% | ~12% | |
| `data/` (raw JSON) | 1,787 files | — | — | — | — | 62 MB (`mlb/results` 21, `compare/v1` 11, `lab` 9, `ask` 9) |

**Per-page chrome floor** (smallest page, `/ipl`):
- 69.5 KB HTML plus 25.7 KB RSC.
- The footer alone is **12.0 KB of RSC**, serialised into every page twice: once in `.txt` and once inline in `__next_f`.
- Across 2,865 pages, that floor is ≈ 270 MB (22%).

### Top 5 reductions (behaviour-preserving; no route, page or history removed)

| # | Reduction | Measured potential | How history and behaviour are preserved |
|---|---|---:|---|
| B1 | **`mlb/board/<date>`: composite classes.** Fold the Tailwind utility runs on repeated tiles and rows into the existing `lr-*` classes (as #1117 did elsewhere). Emit **one shared `<defs>`** with the two sparkline gradients (gold and mute) instead of one per sparkline. | Composite classes **81.8 MB** (class strings ≥40 chars repeated ≥20×/page, minus a 14 B replacement) + shared gradients **12.6 MB** = **≈94 MB (−24% of the family)** | Same 147 dated URLs and the same content. Verify with #1117's harness: computed-style plus pixel equivalence on several dates at 4 widths. |
| B2 | **Footer out of the RSC tree.** Render the static footer from a `"use client"` component with no props, or a static fragment, so it is SSR-rendered but serialised only as a module reference. | 12.0 KB RSC/page measured. × 2,864 `.txt` ≈ **34 MB**, plus ≈ the same inline in HTML. **ESTIMATE: ≈ 65–75 MB** | Identical SSR markup; footer links still in HTML for no-JS and crawlers. Compare HTML byte-for-byte outside `__next_f`. |
| B3 | **`results/date/<date>`: composite cell classes.** `px-3 sm:px-4 py-2 sgd-td sgd-r` and similar strings repeat on ~6.7k `td`s per page, in both HTML and RSC. | Class strings ≥20 chars repeated ≥20×, counted in HTML, `.txt` and the inline copy: **≈31.6 MB (−14% of 221 MB)** | Same pages; computed-style equivalence |
| B4 | **Inline `style={{…}}` objects to classes** in player and game pages: 18% of player RSC, 22% of `games/nfl` RSC. | `games/nfl` inline-style objects **3.7 MB** of `.txt` (measured). Players: **ESTIMATE ≈15–30 MB** across `.txt`, inline copy and HTML `style=` | Computed-style equivalence |
| B5 | **`games/nfl` histogram props.** Send bucket arrays as column arrays (`{edges:[…], p:[…], n:[…]}`) instead of 711 objects with repeated keys. | 1.1 MB of `.txt` in histogram objects (measured). Small, about −10% of the family including the inline copy. | Same rendered chart; snapshot the props-to-DOM output |

**Rejected:**
- **Deleting `.txt` for archive pages** turns client-side navigation into full reloads. That is a behaviour change.
- **Client-side pagination** of `results/date` or `mlb/board` changes the URLs and no-JS access to history. The data is already under `/data/`, but that is a product decision, not a size fix.

**Bytes vs cost:** #1117 measured −27.4% HTML with **no measurable local build-time difference**. B1–B5 reduce output, upload and CDN bytes; they are **not expected to cut Build CPU** unless they remove render work. B1's shared `<defs>` does remove ~1,100 elements per board page; its effect on time is unmeasured. Build CPU depends on page count and render/data work (Part C).

---

## 3. Part C — infrastructure

### 3.1 Worker cap and reliability (MEASURED from `Vercel` statuses)

| Window | Completed/day | Failed | Canceled | e2e p50 / p90 / max (min) | Completed >10 min e2e |
|---|---:|---:|---:|---|---:|
| 10-09 → 10-15 14:27Z (before #1093) | 58.7 | **10** | 92 | 5.1 / 8.9 / 33.2 | 21 |
| 10-15 14:27Z → 10-17 01:10Z | 59.7 | 1* | 23 | 4.8 / 8.2 / 23.4 | 4 |

\* The one failure (`3138fbc551`, 15:00:48Z) started before the cap reached Production. That leaves **0 failures in about 85 completed builds since then**. All pre-cap failures and long cancels were 46–96 min kills, clustered 10-14 14:37Z → 10-15 15:06Z.

- **#1094 (workers 4 → 3):** stay on hold. There is no failure to fix. Locally it is +6% time for −6% simultaneous RSS (5.76 → 5.43 G).
- **#1095 (anon/file/peak split):** observability only. It is the evidence #1094 and item 5 need. The Vercel `mem 14.82G/16G` figure includes page cache.
- **Canceled deployments (112 in 8 d, 13.9/day):**
  - most are probably queue supersessions, where a later push carries the content;
  - their median since the cap is 9.7 min status-to-status, which is mostly queue time;
  - their billed CPU is **unknown** without `cpuTimeForBilling`, the first thing to check in Part D's reconciliation.

### 3.2 Can build CPU drop further?

| Lever | Measured | Estimated | Evidence still needed |
|---|---|---|---|
| Fewer builds (items 1–3) | −12 to −20 completed builds/day and −9.6 skips/day (upper bounds above) | ≈ 20–35% of Production build CPU (ESTIMATE, from counts × COST-001 CPU/build) | Vercel `cpuTimeForBilling` before and after |
| Skip lint and type-check on data-only builds (item 4) | Local `next build` 133.8 s, with lint+types starting at ≈44 s. 443 of 472 completed builds contain no PR-merge or human commit. | ≤ 15–25% of per-build wall time | Local A/B: `next build` vs the same with `eslint.ignoreDuringBuilds` + `typescript.ignoreBuildErrors` set by an env flag that the build script sets only when `git diff --quiet $VERCEL_GIT_PREVIOUS_SHA HEAD -- app/src app/*.mjs app/*.ts app/package*.json` holds (fail open) |
| Fewer rendered pages | 2,883 static pages per build. Dated archives (`mlb/board`, `results/date`, `simulate/d`) are **315 pages (11%) but ≈ 610 MB (50%)** of output. All of them are re-rendered on every build although their inputs rarely change. | Unknown. Byte share is not render-time share. | Local timed build with archive `generateStaticParams` limited to the last N dates (flag-only experiment) to measure the static-generation share. If large, consider a frozen archive layer: render dated pages only when their inputs change and copy them into `out/`. **ISR is unavailable under `output: "export"`.** |
| Standard machine plus included slot (item 5) | Before the cap: 7.36 GiB ceiling plus an OOM kill. Since the cap: RSS 5.4–5.8 G locally. | COST-001 billing-based: "most of the remaining" cost | Re-run the COST-001 §11 Docker test at `cpus` 4 and 3, three times each. Require **≥1.5 GiB headroom and 0 OOM**, then model queue lag at ~2× build time. |

---

## 4. Part D — zero-cost monitoring report (spec only)

**Script:** `scripts/ops/build-cost-report.mjs`. It is read-only and uses the GitHub REST API only, through `GITHUB_TOKEN` in Actions (public repo, $0).

**Inputs:**
- `GET /repos/{o}/{r}/deployments?environment=Production&per_page=100`, paged until it passes `--since`;
- `GET /repos/{o}/{r}/commits/{sha}/statuses` for every **first-parent** commit on `main` since `--since` (local git provides the list). This catches Ignored-Build-Step pushes, which have no deployment;
- local `git` for push grouping, diffs and blobs.

**Budget:** about one call per push head (≈ 85/day). It caches by SHA in `data/internal/ops/build-cost/cache.json`, so a daily run costs about 90 calls.

**Outputs:** a JSON file plus a markdown table, committed in a **non-build-input path**. The commit must ride an existing push, or the report can run as an artifact only. Fields:
- **Frequency:**
  - push heads/day;
  - deployments/day;
  - completed, canceled, failed and ignored per day;
  - e2e minutes p50/p90/max (first status → final status), labelled "includes queue".
- **Classification per completed push**, using this doc's method:
  - `NO_INPUT` with predecessor outcome (redundant vs. carrying content);
  - `CLOCK_ONLY` (upper bound);
  - `MEANINGFUL`;
  - the ignore-step predicate parsed from `vercel-ignore-build.sh` at the evaluated commit.
- **Trigger attribution:** the workflow bucket from the commit subject, sole cause vs multi-cause, and the top non-clock leaf paths per workflow (drift alarm: a new stamp field shows up here first).
- **Reliability:** failures, builds over 15 min, and canceled builds whose content no later build delivered (a freshness alarm).
- **Deltas:** a 7-day rolling comparison against a pinned baseline. The baseline is this doc: 58.7 completed/day, 6.3 NO_INPUT, 7.7 CLOCK_ONLY, 9.6 ignored.
- **Alerts** (exit 2, no spend actions):
  - completed builds/day more than 20% above baseline;
  - any failed build;
  - a NO_INPUT completed build with a completed predecessor whose writer is on the batched list (regression of item 2).

**Reconciliation with Vercel, when the founder provides a token** (`VERCEL_TOKEN`, read-only; reuse `scripts/vercel-cost-report.mjs`):
1. Join on Git SHA: Vercel `/v6/deployments` `meta.githubCommitSha` against this report's push heads.
2. Attach `duration.cpuTimeForBilling`, the `readyState`, and the build-only duration (`buildingAt` → `ready`) to each row.
3. Report billed CPU-min by class (MEANINGFUL / CLOCK_ONLY / NO_INPUT / IGNORED / CANCELED) and by workflow. This turns every count in this doc into CPU-min.
4. Check the sum of `cpuTimeForBilling` per billing day against `/v1/billing/charges` Build CPU. COST-001 found agreement within 2–5%; flag anything above 5%.
5. Write `billedSavings` only from (3) before vs after each change. Never derive it from counts.

Without a token, the report prints "CPU and $: not available (needs a Vercel token)" and stops at counts.

---

## 5. Caveats
- `CLOCK_ONLY` is an upper bound. It treats every ISO datetime leaf as suppressible; reader-visible clocks such as live-props `observedAt` need a reader trace (see the NFL receipts report).
- Per-push grouping uses the deployed SHAs. A Vercel-queue-superseded deployment is counted as canceled, and its content is credited to the next push.
- The CPU-minute figures in the "ESTIMATE" columns use COST-001's ≈35–49 CPU-min per build and its 16 CPU-min per skip. The skip figure comes from a single sampled deployment, and both predate the worker cap.
- The build-input predicate is today's main script. Builds before #1091 (10-15) ran with an older rule, so a few early test-only merges built then that would be skipped now.
