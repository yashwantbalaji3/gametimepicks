# Vercel build-cost audit, 2026-10-19 (Workstream C, milestone M6)

**Window:** first-parent `origin/main` from 2026-10-12T00:00Z to `7a183f0278` (2026-10-19T20:40Z), 7.86 days. That is 691 commits in 619 Vercel push heads.
**Sources (read-only):** local git on refs. `GET deployments?environment=Production` (6 pages, 528 deployments in the window) and each deployment's statuses. `GET commits/{sha}/statuses` for all 699 first-parent commits from 10-11T23Z.
**Scripts and the full per-push table** are in [`build-cost-audit-2026-10-19/`](build-cost-audit-2026-10-19/). `pushes.tsv` has one row per push head. The scripts write caches next to themselves, so copy them to a scratch directory before running.
**No workflow, ignore-script or `vercel.json` change** is made here. Levers are proposals.

## 0. Evidence classes: kept separate, never summed

| Class | Source | What it can say | What it cannot say |
|---|---|---|---|
| **Billed** | User's Vercel usage screenshot only | **$85.05** on-demand charges this cycle. **$104.61** is the Build CPU Minutes category's *gross* metering: it is the bulk of that bill, not extra spend on top of it. **$20/$20** included credit is used. About 20 days are left in the cycle. | Per-build CPU, per-day split, cycle start date |
| **Measured** | GitHub deployments, deployment statuses, commit statuses | Push/build counts by outcome; wall-clock time from push to terminal status | CPU minutes, queue vs build split, whether ignored or canceled events bill |
| **Inferred** | Local replay of `vercel-ignore-build.sh` (§2) and counterfactuals (§4) | What the ignore step decided and why, and what a lever would have removed | Anything billed |

**A canceled or ignored deployment is not proven free.** An ignored push still clones the repo and runs the ignore step: its p50 is 1.1 min from push to verdict. A canceled push sat in the queue: its p50 is 11.0 min from push to cancel. COST-001 treated ignored skips as billed. Neither can be checked without the Vercel token (FD-5).

## 1. Measured: per day (UTC)

"e2e" is commit/push time to the final `Vercel` commit status. It is wall time including queue, **not CPU**. GitHub deployment records are created at the terminal event. Every deployment has exactly **one** status, created 0–3 s after the record (n = 528). So "first status → success" is 0 s, and the measured duration proxy has to be push → deployment record, which is the same as e2e.

| Day | Commits | Push heads | **Completed** | Ignored | Canceled | Failed | GH deployments success / inactive / failure | Completed e2e p50 / p90 (min) |
|---|---:|---:|---:|---:|---:|---:|---|---|
| 10-12 | 86 | 74 | **57** | 6 | 8 | 3 | 57 / 8 / 2 | 6.0 / 55.6\* |
| 10-13 | 88 | 83 | **60** | 9 | 14 | 0 | 60 / 14 / 0 | 5.9 / 9.1 |
| 10-14 | 85 | 80 | **47** | 10 | 21 | 2 | 47 / 21 / 2 | 7.9 / 11.0 |
| 10-15 | 87 | 79 | **45** | 10 | 19 | 5 | 45 / 19 / 5 | 5.9 / 12.1 |
| 10-16 | 84 | 76 | **54** | 12 | 10 | 0 | 54 / 11 / 0 | 4.8 / 8.0 |
| 10-17 | 77 | 71 | **50** | 12 | 9 | 0 | 50 / 10 / 0 | 3.8 / 6.1 |
| **10-18 (NFL Sun)** | **127** | **102** | **69** | 20 | 13 | 0 | 68 / 13 / 0 | 3.9 / 5.7 |
| 10-19 (to 20:40Z) | 57 | 54 | 33 | 13 | 8 | 0 | 34 / 8 / 0 | 5.2 / 8.1 |
| **Window** | 691 | **619 (78.7/d)** | **415 (52.8/d)** | 92 (11.7/d) | 102 (13.0/d) | 10 (1.3/d; **0 since 10-15**) | 415 / 104 / 9 | **5.2 / 10.1**; since 10-16: **4.2 / 6.5** (n = 206) |

\* The 10-12 16:23–19:37Z backlog. These were queued builds behind a stalled pipeline, before the #1093 cap.

- **Ignored builds never appear in GitHub deployments.** 0 of 528 deployments carry an "Ignored" description, and all 92 ignored heads have 0 deployment records. They are visible only as the commit status "Canceled by Ignored Build Step".
- Superseded builds appear as `inactive` "Canceled from the Vercel Dashboard": 104 deployments, against 102 canceled heads.
- Each completed head has exactly 1 deployment.
- **After the 10-18 04:54Z release** (#1088, #1101, #1124, #1120), over 1.66 days: 87.5 pushes/day, **57.9 completed/day**, 30 ignored, 19 canceled, 0 failed.
- **Grouping:** 502 of 619 pushes landed in 127 bursts with ≤10 min between consecutive heads. **105 of those bursts still produced ≥2 completed builds**, 216 completed builds beyond the first in their burst. The Vercel queue collapses some bursts, but not most.

### NFL Sunday 2026-10-18 (UTC day; kickoffs 17Z, 20Z and 00:20Z)
- **102 pushes, 69 completed** (the window high), 20 ignored, 13 canceled, 0 failed.
- 27 completed builds carried NFL input; on weekdays 10-13 → 10-17 it was 3–7.
- e2e p50/p90 was 3.9 / 5.7 min, so builds were fast and queueing was light.

| Hour (Z) | 00–09 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20–21 | 22 | 23 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pushes / completed / NFL-input completed | 22/15/0 | 3/2/1 | **11/10/4** | **15/7/2** | 8/4/1 | 3/2/1 | 8/7/4 | 6/4/1 | 7/4/3 | 5/5/4 | 3/1/0 | 7/5/3 | 4/3/3 |

All **63** completed pushes in the window that carried `nfl settlement receipts` input also carried `nfl event window` input. This re-confirms that the parked `claude/nfl-receipts-stamp-gate` would avoid **0** builds.

### NBA writers
- **70 pushes** contained an NBA commit.
- **28 completed builds** had NBA as their only input changer (2–6/day). 22 of them were `nba results capture`, all real content.
- `nba internal research` had 23 heads, **all superseded** (canceled), with 0 completed.
- `nba pre-tip window` had 15 heads: 4 completed, all inherited (no input of their own); 6 ignored; 5 canceled.

## 2. Inferred: ignore-step replay

`analyze.mjs` parses `BUILD_INPUTS`, `NON_BUILD_INPUTS` and `NON_BUILD_GLOBS` from **each head's own** `app/scripts/vercel-ignore-build.sh`. Four versions occur in the window. It builds the same pathspecs, runs `git diff --quiet <base> <head>`, and applies the publication-SLO clause with the real helper.

The base is the last *successful* Production deployment recorded before the head's first status (Vercel's `VERCEL_GIT_PREVIOUS_SHA`). When a head has only a final status, the base is taken before the commit time. A second variant uses the previous head as the base (the push's own diff).

| Actual outcome | Replay, deployed base | Replay, own diff (previous head → head) |
|---|---|---|
| completed (415) | BUILD 415 (2 by the SLO clause) | BUILD 378 (5 CLOCK_ONLY) · **SKIP 37 = inherited** |
| failed (10) | BUILD 10 | BUILD 10 |
| ignored (92) | **SKIP 92** | SKIP 92 |
| canceled (102) | BUILD 102 | BUILD 49 · SKIP 53 |

- **The replay agrees with Vercel on 619 of 619 heads.** The script's verdict is fully explained by its path rules plus the deployed-base lag.
- **Inherited builds:** 37 completed builds (4.7/day; 5 since 10-18 05Z) touched no input in their own diff. They built only because the base lagged behind an in-flight build.
- **CLOCK_ONLY:** a completed push in which every changed input is JSON(L) that is equal once ISO datetimes are masked. This is an upper bound.
  - There were **5 in the window (0.6/day) and 0 since #1088** (10-18 05Z).
  - The stamp-only lever inside build inputs is **exhausted** for now: what remains is real content.

## 3. Measured: by head writer (window)

| Writer (subject) | Pushes | Completed | Ignored | Canceled | Completed but inherited |
|---|---:|---:|---:|---:|---:|
| nfl settlement receipts (+ event window) | 69 | 63 | 0 | 6 | 0 |
| mlb lineup refresh | 68 | 59 | 6 | 3 | 1 |
| daily products | 55 | 49 | 0 | 5 | 0 |
| mlb daily production | 47 | 35 | 5 | 6 | 1 |
| nightly settle | 34 | 31 | 0 | 2 | 0 |
| epl | 30 | 26 | 0 | 4 | 0 |
| nba results capture | 23 | 22 | 0 | 1 | 0 |
| PR merge / human | 30 | 21 | 3 | 4 | 1 |
| ufc / pregame weather / soccer leagues | 18 / 15 / 10 | 17 / 14 / 9 | 0 | 0 / 1 / 0 | 0 |
| nfl sim v2 shadow | 22 | 15 | 2 | 5 | **12** (pre-#1124) |
| cron-slot coverage | 17 | 7 | 6 | 4 | **7** |
| mlb pregame archive metadata | 42 | 6 | **32** | 4 | 5 |
| auto-refresh (ops) | 31 | 5 | **25** | 1 | 3 (+2 SLO clause) |
| nba pre-tip / nba other / forecast ledger | 15 / 9 / 14 | 4 / 7 / 6 | 6 / 1 / 0 | 5 / 1 / 7 | 4 / 1 / 0 |
| nba internal research / injuries facts / nfl results capture | 23 / 8 / 7 | 0 | 0 | 23 / 8 / 7 | 0 |

## 4. Top three levers (proposals: the owner decides, nothing is changed here)

Ranges are per **full UTC day, 10-12 → 10-18 (n = 7)**. Counterfactuals are **Inferred**. The levers overlap, so do not add them.

**Dollar figures are an ESTIMATE.**
- Assumption: every completed build meters equal Build CPU, and ignored or canceled pushes meter 0.
- Basis: $104.61 gross ÷ about 10–11 cycle days elapsed (inferred from "~20 days left") ÷ 56 completed builds/day ≈ **$0.17–0.19 per completed build**.
- Pre-#1093 builds were longer, so this likely **overstates** what a current build costs.
- The $20 credit is spent, so any saving comes off on-demand charges.

| # | Lever | Evidence | Builds/day avoided (Inferred) | Freshness risk | Owner | Guard test |
|---|---|---|---|---|---|---|
| **1** | **Coalesce overlapping bot pushes.** A single publisher fast-forwards `main` at most once per W minutes. Human/PR merges are not delayed. | 127 bursts ≤10 min; 105 produced ≥2 builds | W = 5: **8–24** (mean 14.6). W = 10: **11–27** (mean 19.4; NFL Sun 24). W = 15: 16–35. ESTIMATE ≈ $1.9–5.1/day at W = 10 | **Medium.** Adds up to W min to every writer. **Must exempt** pushes carrying a forecast-of-record receipt for an event starting within T−(W+build p90). Otherwise it risks the "served by a READY deployment before start" rule. | launch-readiness session (workflows) | New `publisher-deadline-exemption.test.mjs`: a fixture queue with an event inside the window must publish immediately, and a batch head must span every queued commit. Keep the behavior test "docs-tail cannot strand". Post-change check: 0 new forecast-of-record discrepancies (29 known). |
| **2** | **Batch low-urgency writers** onto the next scheduled high-urgency push, or hourly | Completed builds whose **only** input changers are low-urgency: strict set (forecast ledger, top boards, sim-v2 shadow, cron-slot, archive, auto-refresh) 12; broad set (+ EPL, UFC, weather, soccer, morning projections, NBA other) 91 | Strict **0–4** (mean 1.3). Broad **6–18** (mean 11.3; hourly batching keeps about 1/day). ESTIMATE ≈ $0–0.8 (strict) / $1.0–3.4 (broad) per day | Strict: low (research/shadow surfaces). Broad: **product decision.** EPL odds, UFC grades and weather would trail by ≤60 min. | launch-readiness session; founder for the broad set | Per-writer cadence test: a batched writer's reader-visible change must reach `main` within its declared SLA. `build-input-coverage.test.mjs` must stay green (no path-rule change). |
| **3** | **Take non-input writers off the deploy path.** auto-refresh ops gate A′ (prototype `claude/writer-batching-prototype`, `c4f9304eb9`); archive, cron-slot and NBA pre-tip commit only when a reader-visible field moves, or go to a data branch | 92 ignored pushes, 37 inherited builds. Their head writers are archive 32/5, auto-refresh 25/3, cron-slot 6/7, NBA pre-tip 6/4 (ignored / inherited) | Inherited completed **3–7** (mean 5.0). Ignored pushes **6–20** (mean 11.3), cost not proven. ESTIMATE ≈ $0.5–1.3/day on completed builds; $0 credited for ignored pushes | **Lowest.** By construction these files are non-inputs, and the in-flight build already carries the content. Do **not** change the ignore-step base (the unsafe alternative). | launch-readiness session (`auto-refresh.yml` is protected) | `ops-commit-gate.test.mjs` (on the prototype branch); the new `vercel-ignore-build.mutation.test.mjs` (c) pins that these paths SKIP; the behavior test "after a FAILED deploy…" pins the base semantics. |

**Not ranked:**
- **Stamp-only suppression inside build inputs:** 0 CLOCK_ONLY completed since #1088 (§2).
- **NFL receipts gate:** 0 avoidable (§1).
- The new mutation test (a/c converse) pins **why** stamp suppression must stay writer-side: the ignore step is path-based, so a stamp-only change to an input always builds.

## 5. Mutation tests (new: `app/src/lib/vercel-ignore-build.mutation.test.mjs`)

The new file uses the behavior test's harness: a throwaway repo, the real script, and cwd `app/`. It mutates one input from a fixed deployed base.

| Case | What it pins |
|---|---|
| **(a) BUILD** | Content change to `app/public/data/nfl/schedule/latest.json` (read by `src/app/nfl/page.tsx`), `nba/schedule/latest.json` (`lib/sport-hub/nba-hub.ts`) and `admin/model-health.json` (`lib/top-reads.ts`). The test checks that each file exists and that its reader still names it. Also: docs + one reader input; and the converse case, a stamp-only change to an input still BUILDs. |
| **(b) SKIP** | docs-only; repo-root `scripts/` only; `.github/` only; all three together |
| **(c) SKIP** | A stamp-only change to a representative of **every** `NON_BUILD_INPUTS` and `NON_BUILD_GLOBS` entry, parsed from the script, one at a time and all together. Also unlisted `data/internal` churn, and `publication-slo.json` with only `checkedAt` changed (the real helper is copied in). A public-field change BUILDs, and a missing helper BUILDs (fail open). |
| **(d) BUILD** | Previous SHA empty, all zeros, well-formed but absent, malformed, or unset, even for a docs-only push |

**Results:** `npx tsx --test src/lib/vercel-ignore-build.behavior.test.mjs src/lib/vercel-ignore-build.mutation.test.mjs` gave **23/23 pass** (12 existing + 11 new) in 4.6 s.

**Script-mutant check** (`build-cost-audit-2026-10-19/mutate-check.mjs` runs the new file against mutated copies of the script in scratch):
- **6/6 mutants killed:**
  - nfl data made a non-input
  - empty base skips
  - unreachable base skips
  - non-input exclusion dropped
  - `docs/` added as an input
  - SLO clause always skips

## 6. Unknowns
- **Billed CPU per deployment** (`cpuTimeForBilling`), machine class, and build-only duration (`buildingAt → ready`). All of these need the Vercel token (FD-5). The e2e figures include queue time.
- **Whether ignored (92) and canceled (102) events meter Build CPU.**
- **Cycle start date.** The $/build ESTIMATE assumes 10–11 days elapsed.
- **Duplicate `gametimepicks` project.** Only one `Vercel` status context appears on any commit (986 statuses). Whether the duplicate still runs (and meters) the ignore step is not visible from GitHub.
- **Lever counterfactuals** assume a writer's output is unchanged when it is delayed. Coalescing also changes queue dynamics, so the inherited and canceled counts would move too.

## 7. Proposed 7-day follow-up measurement (2026-10-20T00Z → 10-27T00Z)
1. **Before and after billing screenshots** (Billed class), taken at the start and end of the window, for Build CPU gross and on-demand. Report the delta per day only. Do not apportion it per build without the token.
2. **Rerun the scripts here unchanged** (Measured + Inferred): pushes/day, completed/ignored/canceled/failed per day, per-writer completed **per workflow run**, inherited/day, e2e p50/p90, and replay agreement (expected 100%).
3. **Confounders to tag:**
   - The World Series ends, and MLB writers stop: MLB-headed pushes (lineup refresh, daily production, archive) were 100 of 415 completed builds in this window.
   - NBA regular-season volume.
   - NFL Sunday 10-25.
   - Any lever that lands.
4. **If FD-5 is restored:** join `cpuTimeForBilling` by SHA for completed, ignored and canceled events. That settles both the "not proven free" question and the $/build ESTIMATE.
