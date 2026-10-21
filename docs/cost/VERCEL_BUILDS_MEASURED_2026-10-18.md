# Vercel Production builds, measured from GitHub evidence (2026-10-18 ~05:10Z)

**Scope:** what GitHub's records show about Production build activity for the 10 UTC days 2026-10-08 → 10-17, plus the partial day 10-18 00:00 → ~05:10Z. Same push-level method as `COST_REDUCTION_PACKAGE_2026-10-17.md` §1.1 and `BUILD_BASELINE_2026-10-16.md`.

**Billing data is unavailable.** The Vercel API token has expired (founder item FD-5), so this doc has **no** Vercel `cpuTimeForBilling`, **no** machine class, **no** usage-page figures and **no** billed amounts. Every count below is a GitHub-side count of build *events*. Any CPU figure is labelled ESTIMATE and is not a billed amount. No dollar figure is given.

**Labels used:**
- **MEASURED** = counted from GitHub commit statuses, GitHub deployments and local git.
- **REPLAY** = a counterfactual computed on that real history (what a rule would have done).
- **ESTIMATE** = anything that uses outside per-build figures (COST-001) or an assumption.

---

## 0. Headline numbers (MEASURED unless marked)

| | Last 7 days (10-11 → 10-17) | Last 10 days (10-08 → 10-17) | Baseline in the package (10-09 → 10-17 01:10Z) |
|---|---:|---:|---:|
| Push heads with a `Vercel` status / day | 80.6 | 83.0 | 83.7 |
| **Completed builds / day** | **55.3** | **58.8** | 58.7 |
| — MEANINGFUL / day | 42.6 | 44.5 | 44.7 |
| — CLOCK_ONLY (upper bound) / day | 7.3 | 8.2 | ≤ 7.7 |
| — NO_INPUT / day | 5.4 | 6.1 | 6.3 |
| Ignored-Build-Step pushes / day | 9.7 | 9.4 | 9.6 |
| Canceled (superseded) / day | 13.9 | 13.5 | 13.9 |
| Failed / day | 1.6 | 1.2 | 1.4 |
| Completed-build wall time, p50 / p90 (min, includes queue) | 5.4 / 10.1 | 5.1 / 9.1 | 5.1 / 8.9 (pre-#1093) |

- **Last 3 days (10-15 → 10-17):** 49.7 completed/day. 10-17 alone: **50**, the lowest full day in the window.
- **No failed Production build since the #1093 worker cap reached Production** (last failure `3138fbc551`, 10-15 15:00Z). That is **0 failed of 192** push heads from 10-15 15:30Z to 10-18 ~05:10Z (135 completed, 34 ignored, 23 canceled).
- **Top 3 build-causing workflows (7 days, completed builds by push head):**
  1. `auto: mlb lineup refresh`: **62 (8.9/day)**, of which 46 are CLOCK_ONLY.
  2. `auto: nfl event window` + `auto: nfl settlement receipts` (always one push): **60 (8.6/day)**, all MEANINGFUL.
  3. `auto: daily products`: **43 (6.1/day)**, 42 MEANINGFUL.

  By family, MLB (lineup refresh + daily production slate + pregame archive) is **108 (15.4/day)**.
- **Tonight's release (4 merges, 04:46–04:48Z):** **2 completed builds, 2 superseded (canceled), 0 failed** (§5).

---

## 1. Method and its limits

### 1.1 Data pulled (read-only)
| Source | Calls | What it gave |
|---|---:|---|
| `GET repos/…/deployments?environment=Production&per_page=100` | 8 pages | 758 Production deployments since 10-07 20:00Z, all created by `vercel[bot]` |
| `GET repos/…/deployments/{id}/statuses` | 758 | One status per deployment: 595 `success` "Deployment has completed", 139 `inactive` "Canceled from the Vercel Dashboard", 11 failed, 13 "Deployment was blocked" (all on 10-07, before the window) |
| GraphQL `object(oid:…) { status { contexts } }`, 100 commits per query | 10 | The **latest** `Vercel` commit status (state, description, time) for all 935 first-parent `main` commits since 10-07 20:00Z |
| `GET repos/…/commits/{sha}/statuses` | 130 | Full status history for a 1-in-7 sample of push heads (126) plus the 4 release merges, re-read at the end |
| local `git` on `origin/main` (fetched 05:05Z) | — | First-parent order, diffs, blobs, each commit's own `vercel-ignore-build.sh` |

In total this run made about 945 core REST calls and 10 GraphQL queries, within the budget of about 1,500.

### 1.2 Classification
1. **Push heads.** A push head is a first-parent `main` commit carrying a `Vercel` commit status. Commits with no status between two heads belong to the next head's push: Vercel only reports on the pushed tip.
   - **Day** is the UTC day of the head's commit time.
   - On the sample, commit time to first `pending` status was p50 5 s and p90 8 s, so commit time ≈ push time.
2. **Outcome**, from the head's final `Vercel` commit-status description:
   - **completed:** "Deployment has completed".
   - **ignored:** "Canceled by Ignored Build Step". These get **no** GitHub deployment.
   - **canceled (superseded):** "Canceled from the Vercel Dashboard". This is the description Vercel writes when a newer push supersedes a queued build. It does not separate a manual cancel.
   - **failed:** "Deployment has failed …".
   - **unresolved:** one head (`8ed024e16f`, 10-11 15:10Z, soccer league forecasts) still shows `pending` "Vercel is deploying your app" a week later.
3. **Why each completed build built.** The push's own diff (previous head → this head) is tested with the build-input predicate **parsed from that commit's own `app/scripts/vercel-ignore-build.sh`**, which is the script Vercel actually ran for it. Four predicate versions occur in the window: pre-#1091, post-#1091, post-#1124 and post-#1088.
   - `NO_INPUT`: no build-input file changed in the push's own diff. It built only because Vercel's `VERCEL_GIT_PREVIOUS_SHA` (the last *successful* deployment) still lagged behind an in-flight build.
   - `CLOCK_ONLY`: every changed build-input file is JSON or JSONL, and it equals its base once every ISO-8601 datetime leaf is masked. An added file is compared with its newest sibling at the base. This is an **upper bound**, because it does not know which clocks a reader renders.
   - `MEANINGFUL`: anything else, including any non-JSON change, a deletion, a new non-identical file, or one changed number.
4. **Attribution** uses the bucket of the push head's subject, with the same regexes as `scripts-2026-10-17/push-replay.mjs`. A second view counts the buckets of every commit in the push that touched a build input.

### 1.3 Limits
- **Deployment statuses carry no duration.** Every Production deployment has exactly one status, created 0–3 s after the deployment record (p50 0 s, max 3 s, n = 758). Vercel creates the GitHub deployment at the terminal event, not at build start. So the requested "created → success" timing is **not available from the Deployments API**.

  Durations in §4 instead come from **commit-status timestamps**: commit/push time to final `Vercel` status. On the 79 sampled completed heads, this agrees with first-`pending` → final to within 0.1 min at both p50 and p90.
- **Wall time includes queue time.** It is **not** Build CPU minutes and not billed minutes. Summing it across builds double-counts time when builds queue behind each other.
- The GraphQL status is the **latest** `Vercel` status per commit. A redeploy of an old commit would overwrite it. One case is visible: `37aacc444e`, 10-12, whose final status is 4 days later. It is excluded from durations, because only completed heads are timed.
- `CLOCK_ONLY` is an upper bound, and `NO_INPUT` depends on the predicate parse.
- Ignored and canceled events **may** carry build cost; COST-001 §2.4 treated ignored skips as billed. That cannot be checked without the token.

---

## 2. Per-day table (MEASURED)

"e2e" = commit/push time → final `Vercel` status, in minutes. It is wall time from GitHub statuses (queue + build), **not Build CPU minutes**.

| Day (UTC) | Push heads | **Completed** | Ignored | Canceled (superseded) | Failed | Completed: NO_INPUT / CLOCK_ONLY / MEANINGFUL | Completed e2e p50 | p90 | Canceled e2e p50 |
|---|---:|---:|---:|---:|---:|---|---:|---:|---:|
| 10-08 | 91 | **69** | 8 | 14 | 0 | 7 / 12 / 50 | 4.8 | 7.1 | 8.9 |
| 10-09 | 87 | **70** | 7 | 10 | 0 | 8 / 9 / 53 | 4.9 | 7.4 | 9.3 |
| 10-10 | 88 | **62** | 11 | 14 | 1 | 8 / 10 / 44 | 4.4 | 7.0 | 7.5 |
| 10-11 | 101 | **74** | 9 | 16 | 1 | 6 / 7 / 61 | 4.4 | 7.5 | 7.8 |
| 10-12 | 74 | **57** | 6 | 8 | 3 | 7 / 4 / 46 | 6.0 | 56.4\* | 23.5 |
| 10-13 | 83 | **60** | 9 | 14 | 0 | 5 / 10 / 45 | 5.8 | 9.1 | 9.3 |
| 10-14 | 80 | **47** | 10 | 21 | 2 | 6 / 7 / 34 | 7.9 | 11.8 | 16.9 |
| 10-15 | 79 | **45** | 10 | 19 | 5 | 3 / 6 / 36 | 5.9 | 11.6 | 56.2\*\* |
| 10-16 | 76 | **54** | 12 | 10 | 0 | 5 / 9 / 40 | 4.7 | 7.7 | 7.9 |
| 10-17 | 71 | **50** | 12 | 9 | 0 | 6 / 8 / 36 | 3.8 | 6.1 | 6.4 |
| 10-18 (00:00–05:10Z) | 11 | 6 | 3 | 2 | 0 | 0 / 1 / 5 | 3.7 | 5.0 | 6.5 |
| **7-day mean (10-11 → 10-17)** | 80.6 | **55.3** | 9.7 | 13.9 | 1.6 | 5.4 / 7.3 / 42.6 | 5.4 (pooled) | 10.1 | 9.6 |
| **10-day mean (10-08 → 10-17)** | 83.0 | **58.8** | 9.4 | 13.5 | 1.2 | 6.1 / 8.2 / 44.5 | 5.1 (pooled) | 9.1 | — |

The 7-day window has 564 push heads: 387 completed, 68 ignored, 97 canceled, 11 failed and 1 unresolved.

\* **10-12 16:23 → 19:37Z backlog.** Eleven consecutive completed builds each took 53–67 min from push to completion. This is queue behind a stalled pipeline: the `37aacc444e` failure and the pre-#1093 memory-exhaustion era. Each build itself finished about 5 min after the one before.

\*\* **10-15 00:20Z and 14:07Z.** Canceled heads sat 37–96 min behind the 46–55 min kills that #1093 fixed.

---

## 3. Attribution (MEASURED, last 7 days 10-11 → 10-17)

Completed, canceled and ignored counts are by **push-head subject**. "e2e sum" is wall minutes including queue, so it overlaps between builds and is shown for ranking only.

| Workflow (subject prefix) | **Completed** | /day | NO_INPUT | CLOCK_ONLY | MEANINGFUL | Canceled | Ignored | e2e sum (min) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `auto: mlb lineup refresh` | **62** | 8.9 | 0 | **46** | 16 | 2 | 0 | 309 |
| `auto: nfl settlement receipts` (+ its `nfl event window` commit in the same push) | **60** | 8.6 | 0 | 0 | 60 | 5 | 0 | 361 |
| `auto: daily products` | **43** | 6.1 | 0 | 1 | 42 | 6 | 0 | 424 |
| `auto: mlb daily production slate` | **39** | 5.6 | 0 | 0 | 39 | 5 | 0 | 334 |
| `auto: nightly settle` | **27** | 3.9 | 0 | 0 | 27 | 3 | 0 | 240 |
| `auto: epl …` (matchweek refresh / settle / results) | 24 | 3.4 | 0 | 2 | 22 | 4 | 0 | 119 |
| `auto: nba results capture` | 22 | 3.1 | 0 | 0 | 22 | 2 | 0 | 103 |
| `auto: ufc …` / UFC grading | 17 | 2.4 | 0 | 0 | 17 | 1 | 0 | 170 |
| Human / PR merges (`Merge pull request …`, non-`auto`) | 16 | 2.3 | 1 | 0 | 15 | 2 | 3 | 161 |
| `auto: nfl sim v2 shadow receipts` | 15 | 2.1 | **15** | 0 | 0 | 3 | 3 | 119 |
| `auto: pregame weather capture` | 13 | 1.9 | 0 | 0 | 13 | 1 | 0 | 94 |
| `auto: mlb pregame archive metadata` | 7 | 1.0 | 6 | 1 | 0 | 6 | **23** | 51 |
| `auto: soccer league forecasts` | 7 | 1.0 | 0 | 1 | 6 | 0 | 0 | 77 |
| `auto: forecast ledger` | 6 | 0.9 | 0 | 0 | 6 | 7 | 0 | 56 |
| `auto: cron-slot coverage` | 6 | 0.9 | 6 | 0 | 0 | 5 | 4 | 42 |
| `auto: nfl …` other (depth charts, schedule) | 6 | 0.9 | 0 | 0 | 6 | 2 | 4 | 109 |
| `auto: morning projections` | 5 | 0.7 | 0 | 0 | 5 | 1 | 0 | 39 |
| `auto: nba pre-tip forecast window` | 4 | 0.6 | 4 | 0 | 0 | 6 | 7 | 130 |
| `auto-refresh` (ops) | 3 | 0.4 | 3 | 0 | 0 | 1 | **23** | 15 |
| `auto: soccer Dixon-Coles v2 shadow` | 2 | 0.3 | 2 | 0 | 0 | 2 | 1 | 17 |
| `auto: freeze daily top boards` | 2 | 0.3 | 0 | 0 | 2 | 0 | 0 | 8 |
| `auto: nba roster / experimental`, `injuries facts`, `nfl results capture` | 0 | 0 | — | — | — | 20 / 7 / 6 | 0 | — |
| other | 1 | 0.1 | 1 | 0 | 0 | 0 | 0 | 5 |
| **Total** | **387** | **55.3** | 38 | 51 | 298 | 97 | 68 | |

**Input-touching view (which commits' build-input changes a completed build carried):**
- Every completed NFL push contains both an `nfl event window` and an `nfl settlement receipts` commit touching inputs (60/60). This confirms the 10-16 finding that the receipts gate alone avoids 0 deployments.
- Every other workflow is the sole input-changer in its pushes, apart from 1 EPL push.
- The three workflows that touch no build input but still appear above (MLB pregame archive, cron-slot coverage, NBA pre-tip) build only when they inherit an in-flight diff (NO_INPUT).
- **No `auto: nightly settle`, `auto-refresh` or human push was CLOCK_ONLY.**

**Stamp-only commits (full replay, not a sample).** Every MLB lineup-refresh and daily-production commit in the 10 days (157 commits) was replayed through #1088's own `STAMP_RULES`:
- the allowlisted `generatedAt`, `games.*.freshness.generatedAt` and `evidence.priceAgeDays` stamps;
- new prediction snapshots compared with the newest committed snapshot for the date;
- any build input without a rule counts as unknown and publishes;
- the post-#1088 predicate, under which `admin/status.json` is a non-input.

| Workflow | Commits | Stamp-only (gate would suppress) | Publishes: content change | Publishes: new gated file (first snapshot/day) |
|---|---:|---:|---:|---:|
| mlb lineup refresh | 92 | **69 (75%)** | 23 (`full-game-simulations` 22, `predictions` 1) | 0 |
| mlb daily production slate | 65 | **53 (82%)** | 2 | 10 |

The replay omits the gate's 6 h heartbeat and its publication-SLO clause. Both can only make it publish more, so these are upper bounds on suppression. The 10-16 independent check (91/91 suppressed changes stamp-only) agrees in direction.

---

## 4. Build duration approximation (MEASURED wall time, not CPU)

**Definition:** commit/push time → final `Vercel` commit status, for completed push heads. This is **wall time from GitHub commit statuses (queue + clone + ignore step + build + upload)**, **not Build CPU minutes**, and not billed time.

**Why not deployment statuses:** GitHub deployment records are created at the terminal event, 0–3 s before their only status (§1.3).

| Window | Completed builds | p50 (min) | p90 (min) |
|---|---:|---:|---:|
| 10-08 → 10-10 | 201 | 4.4–4.9 by day | 7.0–7.4 |
| 10-11 → 10-15 (incl. pre-cap failures, 10-12 backlog) | 283 | 4.4–7.9 by day | 7.5–56.4 |
| 10-16 → 10-17 (post-#1093) | 104 | 3.8–4.7 | 6.1–7.7 |
| 10-18 partial | 6 | 3.7 | 5.0 |
| Sample check: first `pending` → final, n = 79 completed | 79 | 4.87 | 8.38 |

**Reading:**
- Uncontended wall time is now about **3.5–4 min**. Examples: tonight's `d29a2078ca` took 3.5 min, and every 10-18 build that did not queue took 3.5–4.0 min.
- p90 is driven by queueing behind another build, not by slow builds.
- In 7 days, **168 of 386** completed heads were pushed while the previous head was still unresolved. All 97 canceled heads were.

---

## 5. Tonight's release, 10-18 04:46–04:48Z (MEASURED)

Commit statuses were read at 04:54Z and re-read at 05:09Z (unchanged; no newer `main` commit by then). The GitHub deployment records for all four were created at the terminal events: `d29a` at 04:50:09Z, the other three at 04:54:04Z. Every merge touched build inputs (`app/`), so each would have built on its own.

| Merge | PR | Pushed (first `pending`) | Final status | Outcome |
|---|---|---|---|---|
| `d29a2078ca` | #1124 build-input coverage | 04:46:42Z | 04:50:09Z "Deployment has completed" | **Built** (3.5 min) |
| `36958c5e68` | #1101 settle historical stamp guard | 04:47:25Z | 04:54:04Z "Canceled from the Vercel Dashboard" | **Superseded** |
| `68135f7aa2` | #1120 plain codes on UX | 04:47:54Z | 04:54:04Z "Canceled from the Vercel Dashboard" | **Superseded** |
| `05c9deea4f` | #1088 MLB stamp gate | 04:48:13Z | 04:54:04Z "Deployment has completed" | **Built** (≈ 3.9 min after `d29a` finished; 5.9 min e2e) |

**Result:** 4 pushes produced **2 completed Production builds and 2 superseded**, with 0 failures.
- `05c9deea4f` contains all four PRs, so Production now serves #1124 + #1101 + #1120 + #1088.
- The two cancels were stamped in the same second `05c9` completed. Vercel left them queued and canceled them once the newer build finished.
- Whether a queued-then-canceled deployment carries any billed CPU is unknown without the token.

---

## 6. Queue effects (MEASURED, 7 days)

**Bursts:** push heads less than 10 min apart.
- There were 112 bursts of 2 or more heads, covering 455 of 564 heads.
- Burst sizes: 36 × 2, 23 × 3, 17 × 4, 18 × 5, and 15 bursts of 6–13 heads.
- Outcomes inside bursts: 316 completed, 95 canceled, 33 ignored, 10 failed.
- **93 bursts still produced 2 or more completed builds (300 builds).**

The queue collapses some pushes, but not most. Vercel builds the oldest queued push when the running build finishes, so a burst of N pushes typically yields several builds, not one. For example, on 10-11 (NFL Sunday) the burst at 16:31–16:54Z had 9 heads: 6 completed (MLB daily production ×2, daily products, NFL window + receipts ×3), 2 canceled and 1 ignored.

**Superseded:**
- 97 canceled heads, 13.9/day. Median e2e is 9.6 min, which is mostly queue.
- The heads canceled most often are low-value research or shadow writers: NBA roster/experimental (20), forecast ledger (7), injuries facts (7), NBA pre-tip (6), NFL results capture (6), MLB pregame archive (6), daily products (6).
- Their content is delivered by the superseding build.

**NO_INPUT inheritance:**
- 38 completed builds (5.4/day) had no build input in their own diff.
- **37/38 were pushed while the previous head was unresolved.** Predecessor outcomes: 25 completed, 12 canceled, 1 failed.
- This is the `VERCEL_GIT_PREVIOUS_SHA` lag mechanism from the package.

---

## 7. Measured vs estimated

### 7.1 MEASURED (this doc)
- Counts in §0, §2, §3 and §6, and wall times in §4.
- Predicate replays: #1124 and the current predicate applied to the last 7 days.
  - **#1124:** **3** pushes that were "Canceled by Ignored Build Step" would have built under the post-#1124 predicate. All three are `nfl sim v2 shadow receipts` pushes (`6ff03a9daa` 10-11, `d63b066c3c` 10-13, `c88c9a85df` 10-15), adding sim-v2 shadow receipt files. That is **+0.43 builds/day** (REPLAY), consistent with the designed +0.36/day.
  - **#1088's predicate change** (`admin/status.json` → non-input): on its own it turns only **2** completed pushes (both human) into no-input. The `mlb daily production` savings come from the workflow-side gate, not the path rule.
- **#1088 workflow gate:** **78 of 101** completed MLB lineup and daily-production builds in the 7 days would have had no build input left after the gate. That is **≈ 11.1/day before the heartbeat** (REPLAY).

### 7.2 ESTIMATE (not measured, not billed)
- **#1088 net effect after the 6 h heartbeat:** about **7–10 fewer completed builds/day** while MLB plays.
  - The gated stamps can trail by at most 6 h, and runs span about 13Z → 00:30Z, so expect roughly 2–3 heartbeat publishes a day.
  - Each suppressed run still commits its free files (`ops/heartbeat.json`, input snapshots). When it pushes alone it becomes an **Ignored-Build-Step push**, not nothing: expect ignored/day to **rise** by up to about the same number.
  - **Postseason only:** this ends with the World Series.
- **CPU:** COST-001's pre-cap per-event figures were ≈ 35–49 CPU-min per completed build and ≈ 16 per ignored skip (one sample). On those figures, the 7-day mean (55.3 completed + 9.7 ignored per day) is about **2,100–2,900 CPU-min/day**.
  - This is an **ESTIMATE** from counts, not a billed or measured figure.
  - The post-#1093 wall time of about 4 min suggests per-build CPU may now differ.

### 7.3 Unknown without the Vercel token (FD-5)
- Billed Build CPU per deployment (`cpuTimeForBilling`).
- Whether canceled-while-queued and ignored pushes bill.
- Build-only duration (`buildingAt` → `ready`).
- The machine class.
- Invoice totals.

---

## 8. Highest remaining cost drivers, ranked (by completed builds/day, last 7 days)

| # | Driver | MEASURED evidence | Low-risk mitigation idea | Status |
|---|---|---|---|---|
| 1 | **MLB lineup refresh + daily production** | 101 completed (14.4/day); 46 lineup builds CLOCK_ONLY; gate replay 78/101 avoidable | **#1088 is merged** (04:48Z). Measure it (§9.1) before anything else. If heartbeat publishes dominate, consider aligning the heartbeat to the lineup cadence. | In place; postseason-only |
| 2 | **NFL event window + settlement receipts** (one push) | 60 completed (8.6/day), all MEANINGFUL (`inputHash`, score-shape probabilities); 23 NFL pushes on Sunday 10-11 | Ignore-step **deferral "120 min, none within T−3h"**: REPLAY 1.1–4.9 builds/day avoided, 43 min max delay, 0 material pre-kickoff misses (`WRITER_BATCHING_AND_NFL_SPACING_2026-10-17.md` §2). Founder approval: protected deploy trigger. | Proposal |
| 3 | **Daily products** | 43 completed (6.1/day), 42 MEANINGFUL: projection receipts `contentSha256`, evidence-ledger rows | Reader trace on `data/*-projection/v1/receipt.json`, `readiness.json` and `admin/*`. The package measured about **1 build/day** from these exclusions; small, so low priority. | Idea |
| 4 | **NO_INPUT inherited builds** | 38 completed (5.4/day); 37/38 pushed while previous unresolved. Shadow receipts 15 (now real inputs under #1124), pregame archive 6, cron-slot 6, NBA pre-tip 4, auto-refresh 3, DC shadow 2 | **Do not** change the ignore-step base (unsafe if the in-flight build fails). Per the writer-batching analysis, only the **auto-refresh content gate (A′)** is recommended now. REPLAY: −0.25 completed and −2.12 ignored per day. | Prototype on branch |
| 5 | **Nightly settle** | 27 completed (3.9/day): 4–5 runs/day, 09:24–19:24Z, each changing **413–458 files** (median 427) | **#1101 merged:** stops restamping settled history, which shrinks changed files, not necessarily builds. Next idea: rerun commits publish only when a new settlement lands (NBA-results-style gate), but only if §9.2 shows reruns still build with no new settlements. | Measure first |
| 6 | **Canceled (superseded) queue entries** | 97 (13.9/day), median 9.6 min mostly queued; concentrated on research/shadow writers | None needed. Superseding saves builds. Billed impact unknown; it is the first thing to check once FD-5 restores the token. | Watch |
| 7 | **Ignored-Build-Step pushes** | 68 (9.7/day): `auto-refresh` 23, MLB pregame archive 23, NBA pre-tip 7 | auto-refresh A′ (−2.12/day REPLAY). The MLB archive's value ends with the season (data-branch plan for 2027). Expect #1088 to **add** ignored pushes (§7.2). | Prototype / 2027 |
| 8 | EPL 3.4, NBA results 3.1, UFC 2.4, weather 1.9 per day | Non-clock leaves are real content (odds rows, `ftHome`, `tempF`) | Gateable only with a product freshness decision; no low-risk change | — |

---

## 9. Post-merge measurement plan (run tomorrow, 2026-10-19 ≥ 06:00Z)

Use the same method: `deployments?environment=Production` for completeness, plus the GraphQL latest-status batch for first-parent `main` commits, plus local git.
- **Before:** 10-11 00:00Z → 10-18 04:46Z.
- **After:** 10-18 04:54Z (when `05c9deea4f` completed) → 10-19 06:00Z.
- **Normalise per workflow run, not per day.** Postseason MLB off-days and NFL game days move daily totals more than any of these PRs.

### 9.1 #1088 MLB stamp-only gate (merged 04:48Z; first runs ≈ 13–15Z board, then lineup refreshes 15:30–00:30Z)

**Commits to examine:** first-parent `main` commits after `05c9deea4f` whose subject starts with:
- `auto: mlb lineup refresh`, or
- `auto: mlb daily production slate`.

Gated runs carry the suffix **`(run records only — no forecast change)`** or **`(run records only — no slate change)`**. Runs where the gate left nothing staged make **no commit**. Count those from the workflow logs ("nothing left to commit after the stamp gate"), 1 call per workflow run list.

**Metrics** (before → expected after):
1. **Completed builds per MLB commit.** Before: 101 completed heads per 109 MLB commits = **0.93**. After: REPLAY ≈ 0.21 (23 of 109) plus heartbeat publishes.
2. **MLB-headed completed builds/day.** Before: **14.4/day**. After: ESTIMATE 4–7/day on a full slate.
3. **Suffixed commits and their outcomes.** Count suffixed commits, and the `Vercel` outcome of the push head carrying each one. Expected: "Canceled by Ignored Build Step", or folded into a push whose build is explained by another writer.
4. **Ignored pushes/day.** Before: 9.7. Expected to rise.

**Safety checks:**
- Every MLB commit **without** the suffix must end in a completed build of its head or of a later head.
- Spot-check 5 suffixed commits:
  - `git diff <sha>^ <sha> --stat` shows no `app/public/data/mlb/{full-game-simulations,predictions,game-simulations}/` change;
  - no new `data/internal/mlb/prediction-snapshots/` file.
- Spot-check that each unsuffixed lineup commit changes a non-stamp field.

### 9.2 #1101 settle historical stamp guard (next settle ≈ 09:24Z, then reruns to ≈ 19:30Z)

**Commits to examine:** first-parent commits with subject `auto: nightly settle` after `05c9deea4f`.

**Metrics:**
1. **Files changed per settle commit** (`git diff --name-only <sha>^1 <sha> | wc -l`). Before: median **427** (413–458; 31 commits 10-11 → 10-17). Expected: a large drop, since #1101 targets the 380–386 restamped history files.
2. **Settle-headed completed builds/day.** Before: **3.9/day** (27/7d; 4–5 runs/day).
   - Expectation: **not necessarily lower**. #1101 reduces files, not builds.
   - If reruns after the first daily run now change only stamps or nothing in build inputs, they would show as NO_INPUT/ignored. Record which.
3. **Completed-build e2e p50 for settle heads.** Before: from the 7-day data. Expect no change: the export renders every page regardless.
4. **CLOCK_ONLY test on each settle push.** If a rerun push is CLOCK_ONLY, that is the evidence for the "publish only on new settlement" idea (§8 #5).

### 9.3 #1124 build-input coverage (merged 04:46Z; designed +0.36 builds/day)

**Commits to examine:** first-parent commits with subject `auto: nfl sim v2 shadow receipts` after `d29a2078ca`. Also any other commit whose diff touches a path newly added to `BUILD_INPUTS` in `d29a2078ca`. List them with `git diff d29a2078ca^1 d29a2078ca -- app/scripts/vercel-ignore-build.sh`.

**Metrics:**
1. **Ignored shadow pushes.** Count shadow-receipt push heads with "Canceled by Ignored Build Step". Expected: **0**. Before: 3 in 7 days, each now a build per REPLAY.
2. **Shadow-headed completed builds.** Before: 15 completed/7d, all NO_INPUT. After: they should classify as **MEANINGFUL** under the new predicate.
3. **Added builds/day attributable to #1124.** Count the pushes that built **only** because of a newly covered path: run the classification with the pre-`d29a` predicate as well. Expected: ≈ **+0.36–0.43/day**. Flag anything above 1/day.

### 9.4 Whole-system check (same comparison)
- Completed builds/day: 7-day baseline **55.3** (10-day 58.8).
- Ignored/day: **9.7**.
- Canceled/day: **13.9**.
- Failed/day: **0** since 10-15 15:30Z.
- Completed e2e p50/p90: **3.8 / 6.1** on 10-17.

Alert, per the package's Part D, if completed/day is more than 20% above 55.3 or any build fails. **Billed savings stay unclaimed until FD-5 restores the token:** join the counts to `cpuTimeForBilling` by SHA before and after.

---

## 10. Reproduction notes
The scratch scripts ran from a private temp directory and were deleted after this run. They follow `scripts-2026-10-17/push-replay.mjs` (predicate parse, bucket regexes, CLOCK_ONLY test) with two changes:
1. The predicate is parsed **per commit** rather than from `origin/main`.
2. #1088's `STAMP_RULES` are replayed per MLB commit.

The release statuses in §5 were re-read at the end of the run (§1.1).

## 10. Measured after-window (2026-10-18 04:54Z → 2026-10-19 06:00Z)

**Method:** same as §1. Data: GraphQL latest `Vercel` status for 779 first-parent `main` commits (re-read 06:06Z), `deployments?environment=Production` plus statuses for the 83 deployments created after 04:54Z, Actions run lists, and the predicate parsed from each head's own `vercel-ignore-build.sh`. **Check:** the 10-11 → 10-17 rerun reproduces §0/§2 exactly (564 heads; 387/68/97/11/1; 38/51/298).

**Windows:** before = 10-11 00:00Z → 10-18 04:46Z (7.199 d, 571 heads, 640 commits). After = 25.1 h (1.046 d, 103 heads, 128 commits, `38f731a80b` … `877a687556`). The four release merges fall in neither (§5).

**Confounders:** the after window is an NFL Sunday plus an MLB ALCS day with one game. It ends at 06:00Z, a quarter of the way into 10-19 UTC. Per-day figures are shown, but the verdicts rest on per-commit and per-run rates.

**Deployments cross-check:** 80 Production deployments belong to after-window heads: 69 `success`, 11 `inactive` "Canceled from the Vercel Dashboard", 0 failed. Every completed head has exactly one deployment. No ignored head has one.

### 10.1 #1088 MLB stamp-only gate

| Metric | Before | Expected | Measured after | Verdict |
|---|---|---|---|---|
| 1. Completed builds per MLB commit | 103 / 111 = **0.93** | ≈ 0.21 + heartbeats | **5 / 16 = 0.31**: 3 content (0.19) + 2 inherited | **Works** |
| — per MLB workflow run | 103 / 118 = 0.87 | — | 5 / 17 = 0.29 | |
| 2. MLB-headed completed builds per day | **14.3** (7 d: 14.4) | 4–7 | **4.8** (5 builds) | Within the expected range. One game; run counts were normal (11 lineup runs vs 10.1/day before; 6 production runs vs 6.3/day) |
| 3. Suffixed commits | n/a | ignored, or folded into another build | **13** (8 lineup, 5 production): **9 ignored**, 2 superseded (`64ffbe3bef`, `2e371bf17d`), 2 built as inherited NO_INPUT (`7d81b51fac`, `edc513b22e`); **0 built on their own diff** | **Pass** |
| 4. Ignored pushes per day | 9.9 (7 d: 9.7) | rises | **22.0** (23); 9 are MLB suffixed | Rose, as predicted |

- **CLOCK_ONLY completed builds:** 52 before (47 of them lineup) → **0** after.
- **Gate-suppressed runs that made no commit:** 0. The only lineup run without a commit (`39202284642`, 10-19 05:00Z) skipped at "Board precheck", meaning no slate. That comes from the jobs/steps API; logs were not downloaded.

**Safety checks:**
- **All 13 suffixed commits** (not just a sample of 5) change 0 files under `mlb/{full-game-simulations,predictions,game-simulations}/` and add 0 `prediction-snapshots/` files.
- **All 3 unsuffixed commits built on their own head:**
  - `ecf249fb29`: first slate of the day, with new files.
  - `785fbdc8ff`: lineups confirmed; 314 non-clock leaves changed.
  - `cf2f4b9793`: the frozen-pregame record for game 849817 was added.
- **No pure heartbeat publish was seen.**

**New cost from #1088's publication-SLO clause:**
- **2 completed builds** (`d96022705f` 08:45Z, `f0b02a7ff7` 04:01Z) were auto-refresh pushes with no path input. In each, `publicSloKey` changed at the ET date roll (`date`, `state` PUBLISHED→PUBLISHING, deadline).
- **All other auto-refresh and MLB pushes** with an SLO file change but unchanged public fields were ignored (11/11 not queued).
- **ESTIMATE:** this clause adds about 1 build per ET day.
- **Net #1088 ≈ −8 to −9 completed builds/day** on this slate.

### 10.2 #1101 settle historical stamp guard

| Metric | Before | Expected | Measured after | Verdict |
|---|---|---|---|---|
| 1. Files changed per settle commit | median **427** (413–458, n = 31) | large drop | **45** (44–67, n = 4: `01ac320a62` 67, `0cda4d4b21` 44, `e4f297bda9` 45, `ab363d26b0` 45) | **Works (−89%)** |
| 2. Settle-headed completed builds | 27 / 31 commits (0.87); 3.8/day | not necessarily lower | **4 / 4 commits (1.00)**; 3.8/day. Runs: 5 (1 failed run, no commit) | Unchanged, as expected |
| 3. Settle e2e p50 | 5.5 min | no change | 4.0 min | No regression; the drop is less queueing |
| 4. CLOCK_ONLY settle pushes | 0 | — | **0 of 4** | Reruns carry real settlements, e.g. `e4f297bda9` UFC graded 70→79 and `ab363d26b0` results-projection revision 3→4 |

The "publish only on new settlement" idea (§8 #5) has **no support** in this sample (n = 4, small).

### 10.3 #1124 build-input coverage

| Metric | Before | Expected | Measured after | Verdict |
|---|---|---|---|---|
| 1. Ignored shadow pushes | 3 / 21 heads | 0 | **0 / 3** | **Pass** |
| 2. Shadow-headed completed builds | 15 / 21, all NO_INPUT | MEANINGFUL | **2 / 2 MEANINGFUL** (`ed149d6f60`, `ac0dc90452`); 1 superseded (`3fc1f7283c`) | **Pass** |
| 3. Builds that happened only because of a newly covered path | REPLAY +0.43/day | +0.36–0.43/day; flag above 1/day | **2 completed + 1 superseded in 1.046 d = 1.9 completed/day** | **FLAG** |

The 2 completed are the only pushes whose inputs exist only under the post-`d29a` predicate. Caveats on the flag:
- `ac0dc90452` was queued behind `edc513b22e`, so under the old rule it might have been inherited anyway. The defensible range is **+1 to +2 builds in 25 h**.
- Shadow pushes inherited far less often after the change. Before, 15 of 21 shadow heads built as NO_INPUT. Builds are now faster (§10.4), so fewer pushes land while another build is unresolved.
- The sample is **3 pushes on an NFL Sunday** (12 shadow runs vs 8.6/day before). Too small to call; re-measure on a non-game weekday.

### 10.4 Whole system

| Metric | Before (7 d / 7.2 d) | Measured after | Note |
|---|---|---|---|
| Completed builds per day | **55.3** / 54.3 | **66.0** (69) | +19% vs 55.3, just under the +20% alert (66.4). NFL drove it: 24 builds vs 8.3/day |
| Completed per first-parent commit | 0.611 (391 / 640) | **0.539** (69 / 128) | **−12%** |
| Same-weekday check | Sun 10-11: 74 completed / 126 commits | Sun 10-18 (UTC day): 69 / 127 | −5 builds on equal commit volume |
| Completed per commit, by family: MLB | 0.93 | 0.31 | Down |
| — NFL window + receipts, per push | 0.92 | 0.96 | Unchanged |
| — all other writers | 0.57 | 0.65 | Up: +2 SLO-clause, +2 from #1124 |
| Ignored per day | 9.7 | 22.0 | Expected rise |
| Canceled per day | 13.9 | 10.5 (11) | |
| Failed | 0 since 10-15 15:30Z | **0** of 103 heads; 0 failed deployments | Pass |
| Completed e2e p50 / p90 | 3.8 / 6.1 (10-17) | **3.8 / 5.7** | Pass |

**Content vs inherited** (definition: a build is inherited when its push diff touches no build input and it was pushed while the previous head was unresolved):

| | Before | After |
|---|---|---|
| Content: MEANINGFUL | 301 | 64 |
| Content: CLOCK_ONLY | 52 | 0 |
| Content: SLO-clause | — | 2 |
| Content total | 353 (49.0/day) | **66** (63.1/day) |
| Inherited | 38 (5.3/day; 37 queued) | **3** (2.9/day: `7d81b51fac`, `6439850685`, `edc513b22e`) |
| Inherited per commit | 0.059 | 0.023 |

The "head commit alone" variant gives the same 5 no-input builds.

**10-19 NBA, after 05:00Z:**
- **#1133 (`877a687556`, 05:49:16Z) produced 0 completed Production builds, not 1.** Its final status is "Canceled by Ignored Build Step" (pending 05:49:20Z → 05:50:07Z), and it has no deployment record.
- This is correct for its diff: `.github/workflows/nba-forecast-window.yml` plus one `*.test.mjs`, which is excluded by `NON_BUILD_GLOBS`. The workflow change takes effect in Actions without a deploy.
- **No `auto: nba …` commit landed on `main` after 05:00Z.** The 05:14Z `nba-results-refresh` run committed nothing.
- **NBA-triggered Production builds after 05:00Z: 0.**
- Earlier in the window: 2 `nba results capture` builds, both MEANINGFUL. Three NBA research heads were superseded (13:11Z).

**Billing:** these are build counts only. No CPU or billed figure is available until FD-5.
