# Vercel Production deployments on `main` — 14-day picture (GitHub commit statuses)

Generated 2026-10-15 04:54Z. Window: first-parent commits on origin/main with commit time since 2026-10-01T04:5xZ (`--since="14 days ago"`): **1322 commits, 1265 Vercel deployments** (distinct deployment ids from status target_url), 61 commits with no Vercel status.

**MEASURED** = counts, classes, timestamps from GitHub statuses (context `Vercel`, creator `vercel[bot]`). **ESTIMATE** = every minute/CPU-minute/$ figure. CPU-min = build-min x 8 (Enhanced machine, 8 vCPU). $ = CPU-min x $0.0035 (COST-001 rate assumption) — ESTIMATE.

Build-minute model (ESTIMATE): BUILT and CANCELED_DASHBOARD = serial single-builder model: deployments that occupy the builder (BUILT/FAILED/IGNORED/CANCELED) ordered by completion time; build = last − max(first, previous completion), floored 0. Completion order (not queue order) is used because Vercel builds the newest queued Production deployment first and batch-cancels older ones (seen 10-14 14:47Z and 10-15 01:56Z); a FIFO model double-counted ~53 min there; FAILED = 46 min flat (per brief); IGNORED = 2 min (16 CPU-min billed per COST-001; measured status window median 1.2 min); BLOCKED / PENDING = 0. Days are **UTC** calendar days by first status time (ET = UTC−4).

## Status contexts

All 2,499 statuses on all 1,322 commits (incl. the 20 most recent) have context `Vercel`, creator `vercel[bot]`, and target_url project `yashwantbalaji33-7164s-projects/gametime-picks` (except 10 "Git author bot must have access" statuses whose target_url is a Vercel team-invite link for the same team). **No second context — no evidence of a duplicate `gametimepicks` project posting statuses.**

## Per-day (UTC) — measured counts

| day | commits | deploys | BUILT | IGNORED | CANCELED_DASH | FAILED | BLOCKED | PENDING | no-status commits | human-merge commits | bot commits |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-01 (partial) | 60 | 60 | 52 | 8 | 0 | 0 | 0 | 0 | 0 | 8 | 52 |
| 2026-10-02 | 124 | 124 | 115 | 9 | 0 | 0 | 0 | 0 | 0 | 53 | 71 |
| 2026-10-03 | 93 | 92 | 76 | 16 | 0 | 0 | 0 | 0 | 1 | 16 | 77 |
| 2026-10-04 | 91 | 90 | 81 | 9 | 0 | 0 | 0 | 0 | 1 | 9 | 82 |
| 2026-10-05 | 103 | 106 | 95 | 11 | 0 | 0 | 0 | 0 | 1 | 33 | 70 |
| 2026-10-06 | 100 | 100 | 87 | 13 | 0 | 0 | 0 | 0 | 0 | 17 | 83 |
| 2026-10-07 | 79 | 79 | 53 | 5 | 0 | 0 | 21 | 0 | 0 | 11 | 68 |
| 2026-10-08 | 91 | 91 | 69 | 8 | 14 | 0 | 0 | 0 | 0 | 9 | 82 |
| 2026-10-09 | 91 | 87 | 70 | 7 | 10 | 0 | 0 | 0 | 4 | 12 | 79 |
| 2026-10-10 | 94 | 88 | 62 | 11 | 14 | 1 | 0 | 0 | 6 | 7 | 87 |
| 2026-10-11 | 126 | 101 | 74 | 9 | 16 | 1 | 0 | 1 | 25 | 3 | 123 |
| 2026-10-12 | 86 | 73 | 57 | 6 | 8 | 2 | 0 | 0 | 13 | 2 | 84 |
| 2026-10-13 | 88 | 83 | 60 | 9 | 14 | 0 | 0 | 0 | 5 | 7 | 81 |
| 2026-10-14 | 85 | 80 | 47 | 10 | 21 | 2 | 0 | 0 | 5 | 9 | 76 |
| 2026-10-15 (partial) | 11 | 11 | 3 | 0 | 5 | 3 | 0 | 0 | 0 | 2 | 9 |

## Per-day (UTC) — ESTIMATED build time

| day | est CPU-min BUILT | IGNORED | CANCELED | FAILED | **total CPU-min** | **est $** | BUILT build-min median | p90 | measured BUILT status-window median |
|---|---|---|---|---|---|---|---|---|---|
| 2026-10-01 | 1,284 | 128 | 0 | 0 | **1,412** | **$4.94** | 3.55 | 4.97 | 4.41 |
| 2026-10-02 | 2,088 | 144 | 0 | 0 | **2,232** | **$7.81** | 2.13 | 4.75 | 3.97 |
| 2026-10-03 | 1,493 | 256 | 0 | 0 | **1,749** | **$6.12** | 3.14 | 3.56 | 3.27 |
| 2026-10-04 | 1,511 | 144 | 0 | 0 | **1,655** | **$5.79** | 3.05 | 3.33 | 3.23 |
| 2026-10-05 | 2,196 | 176 | 0 | 0 | **2,372** | **$8.30** | 3.28 | 4.72 | 4.47 |
| 2026-10-06 | 2,313 | 208 | 0 | 0 | **2,521** | **$8.82** | 3.78 | 5.15 | 4.47 |
| 2026-10-07 | 1,346 | 80 | 0 | 0 | **1,426** | **$4.99** | 3.65 | 5.00 | 4.25 |
| 2026-10-08 | 2,241 | 128 | 70 | 0 | **2,439** | **$8.54** | 3.93 | 5.42 | 4.72 |
| 2026-10-09 | 2,512 | 112 | 0 | 0 | **2,624** | **$9.18** | 4.53 | 5.33 | 4.83 |
| 2026-10-10 | 1,922 | 176 | 92 | 368 | **2,557** | **$8.95** | 3.88 | 4.68 | 4.13 |
| 2026-10-11 | 2,265 | 144 | 179 | 368 | **2,956** | **$10.35** | 3.83 | 4.72 | 4.12 |
| 2026-10-12 | 1,540 | 96 | 0 | 736 | **2,372** | **$8.30** | 3.83 | 5.80 | 4.67 |
| 2026-10-13 | 2,407 | 144 | 50 | 0 | **2,601** | **$9.10** | 5.12 | 5.99 | 5.65 |
| 2026-10-14 | 2,643 | 160 | 0 | 736 | **3,539** | **$12.39** | 6.22 | 9.69 | 7.82 |
| 2026-10-15 | 108 | 0 | 0 | 1,104 | **1,213** | **$4.24** | 3.78 | 5.84 | 3.78 |

## Trailing windows (ending 2026-10-15 04:54Z)

| window | deploys | /day | BUILT | /day | IGNORED | CANCELED | FAILED | BLOCKED | human-merge deploys | bot deploys | est CPU-min | est CPU-min/day | est $ | est $/day | est $/30d run-rate |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1d | 75 | 75.0 | 37 | 37.0 | 8 | 25 | 5 | 0 | 7 | 68 | 4,216 | 4,216 | $14.76 | $14.76 | $443 |
| 7d | 596 | 85.1 | 425 | 60.7 | 59 | 102 | 9 | 0 | 48 | 548 | 19,827 | 2,832 | $69.40 | $9.91 | $297 |
| 14d | 1265 | 90.4 | 1001 | 71.5 | 131 | 102 | 9 | 21 | 199 | 1066 | 33,669 | 2,405 | $117.84 | $8.42 | $253 |

CPU-min by class (ESTIMATE):

| window | BUILT | IGNORED | CANCELED | FAILED (46 flat) | FAILED (adj.: serial model instead of 46 flat) | total (adj.) |
|---|---|---|---|---|---|---|
| 1d | 2,247 | 128 | 1 | 1,840 | 1,847 | 4,223 |
| 7d | 15,179 | 944 | 392 | 3,312 | 1,848 | 18,363 |
| 14d | 27,869 | 2,096 | 392 | 3,312 | 1,848 | 32,205 |

## By source workflow — top 15 by est CPU-min (14d)

| # | source | commits (14d) | deploys | BUILT | IGNORED | CANCELED | FAILED | BLOCKED | est CPU-min 14d | share | est $ 14d | est CPU-min 7d | est CPU-min 1d |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | human merge | 198 | 199 | 179 | 13 | 4 | 3 | 0 | 5,931 | 17.6% | $20.76 | 2,519 | 1,262 |
| 2 | mlb lineup refresh | 126 | 126 | 119 | 0 | 2 | 0 | 5 | 4,097 | 12.2% | $14.34 | 2,298 | 406 |
| 3 | daily products | 98 | 98 | 85 | 0 | 8 | 2 | 3 | 3,300 | 9.8% | $11.55 | 2,300 | 231 |
| 4 | mlb daily production slate | 89 | 90 | 86 | 0 | 3 | 1 | 0 | 3,293 | 9.8% | $11.52 | 1,974 | 318 |
| 5 | nfl settlement receipts | 109 | 110 | 100 | 0 | 8 | 0 | 2 | 2,694 | 8.0% | $9.43 | 1,983 | 173 |
| 6 | nightly settle | 63 | 62 | 60 | 0 | 2 | 0 | 0 | 2,141 | 6.4% | $7.49 | 1,271 | 353 |
| 7 | nba results capture | 51 | 51 | 47 | 0 | 2 | 0 | 2 | 1,412 | 4.2% | $4.94 | 880 | 30 |
| 8 | mlb pregame archive metadata | 68 | 69 | 19 | 45 | 5 | 0 | 0 | 1,273 | 3.8% | $4.45 | 661 | 102 |
| 9 | epl matchweek refresh | 35 | 35 | 33 | 0 | 2 | 0 | 0 | 981 | 2.9% | $3.43 | 532 | 0 |
| 10 | pregame weather capture | 27 | 27 | 25 | 0 | 1 | 0 | 1 | 859 | 2.6% | $3.01 | 493 | 51 |
| 11 | auto-refresh (odds) | 48 | 48 | 3 | 44 | 1 | 0 | 0 | 787 | 2.3% | $2.75 | 383 | 32 |
| 12 | nfl sim v2 shadow receipts | 29 | 27 | 20 | 3 | 3 | 0 | 1 | 655 | 1.9% | $2.29 | 545 | 44 |
| 13 | nfl event window | 109 | 53 | 47 | 0 | 4 | 0 | 2 | 648 | 1.9% | $2.27 | 185 | 0 |
| 14 | forecast ledger | 19 | 19 | 11 | 0 | 7 | 1 | 0 | 635 | 1.9% | $2.22 | 563 | 368 |
| 15 | morning projections | 14 | 14 | 12 | 0 | 1 | 1 | 0 | 600 | 1.8% | $2.10 | 514 | 0 |

Remaining 22 sources: 4,364 est CPU-min (soccer league forecasts, ufc fight-week refresh, freeze daily top boards, cron-slot coverage, nba pre-tip forecast window, ufc post-card grading + backtest, epl settle, schedule capture, soccer dixon-coles v2 shadow, nba experimental forecasts, nba roster capture, other (bot merge-sync), nfl depth-chart snapshots, nfl live props, p300 player props forward shadow, refresh ufc odds + readiness, nflverse weekly capture, epl results capture, nfl results capture, injuries facts capture, other, ufc results capture).

## Human merges vs bot

| window | human-merge deploys | human est CPU-min | bot deploys | bot est CPU-min | human share of CPU-min |
|---|---|---|---|---|---|
| 1d | 7 | 1,262 | 68 | 2,954 | 29.9% |
| 7d | 48 | 2,519 | 548 | 17,308 | 12.7% |
| 14d | 199 | 5,931 | 1066 | 27,738 | 17.6% |

## FAILED deployments (measured timestamps)

| first status (queued) | failure status | window min | dpl id | source | commit |
|---|---|---|---|---|---|
| 2026-10-10 16:24:10Z | 2026-10-10 16:25:54Z | 1.7 | dpl_6QuZMKDjCKMUZw6WYnB4hF2qhDc1 | daily products | d023289584 |
| 2026-10-11 15:11:25Z | 2026-10-11 15:11:48Z | 0.4 | dpl_9EJ9vEYyh6AWYXxB9uisKcJhRyFB | daily products | ee0fe5dedd |
| 2026-10-12 09:27:58Z | 2026-10-12 09:29:59Z | 2.0 | dpl_C3S2iixGjryqXEXsJuh8vThmx7t4 | morning projections | c047081427 |
| 2026-10-12 13:22:50Z | 2026-10-12 13:22:54Z | 0.1 | dpl_7S3o6KxCuCRPsnjmpCu7e6jhU5eF | mlb daily production slate | ea19d500d5 |
| 2026-10-14 13:45:24Z | 2026-10-14 14:37:15Z | 51.9 | dpl_Hr1uX94SiSo1aywSTxE6bfem8mMB | forecast ledger | 932a766f65 |
| 2026-10-14 22:27:53Z | 2026-10-14 23:22:37Z | 54.7 | dpl_3un6p5zPPrVPdS8Jxf3ZvuQGQg3q | human merge | 411089bfe4 |
| 2026-10-15 00:17:45Z | 2026-10-15 01:03:57Z | 46.2 | dpl_4TnKxbgyYpcZhqUb4sXZ2bijzbP1 | human merge | 279098cf25 |
| 2026-10-15 00:54:47Z | 2026-10-15 01:50:09Z | 55.4 | dpl_8Hf6T4QSgdvUZcE7bGQsYgwTZUat | freeze daily top boards | e9cb321800 |
| 2026-10-15 02:11:13Z | 2026-10-15 02:57:24Z | 46.2 | dpl_8LLRvH9ztE8Mc2PmLuyrUAUxUpB4 | human merge | 7c3f23722a |

Two kinds: 4 fast failures (<=2 min window, 10-10 to 10-12) and 5 long ones (46-55 min window, 10-14 13:45Z onward). The long ones end ~46.2 min after their serial start (e.g. dpl_8Hf6… queued 00:54:47 behind dpl_4TnK… which failed 01:03:57; it failed 01:50:09 = +46.2 min), consistent with a ~45-min build timeout and serial building.

Other non-built: 1 deployment stuck PENDING with no terminal status (dpl_BFPqo11vtRingYTdjWTLHkZg6Y3j, soccer league forecasts, queued 2026-10-11 15:10:14Z). 21 BLOCKED ("Deployment was blocked", 10 also "Git author bot must have access to the project on Vercel"), all 2026-10-07 17:40–23:58Z, author `gtp-bot`.

## Gaps

No UTC day in the window has zero deployments. Longest intervals between consecutive deployment queue times (measured):

- 4.81 h: 2026-10-01 06:50Z → 2026-10-01 11:39Z
- 4.53 h: 2026-10-04 06:38Z → 2026-10-04 11:10Z
- 3.78 h: 2026-10-03 02:16Z → 2026-10-03 06:03Z
- 3.64 h: 2026-10-05 08:42Z → 2026-10-05 12:21Z
- 3.60 h: 2026-10-12 09:39Z → 2026-10-12 13:15Z
- 3.55 h: 2026-10-13 03:49Z → 2026-10-13 07:22Z
- 3.51 h: 2026-10-11 02:09Z → 2026-10-11 05:40Z
- 3.23 h: 2026-10-12 02:36Z → 2026-10-12 05:50Z

61 commits have **no Vercel status at all** (no deployment recorded): nfl event window x56, nfl sim v2 shadow receipts x2, nightly settle x1, schedule capture x1, soccer league forecasts x1. Dates: 10-03 x1, 10-04 x1, 10-05 x1, 10-09 x4, 10-10 x6, 10-11 x25, 10-12 x13, 10-13 x5, 10-14 x5. Likely intermediate commits of a multi-commit push (Vercel deploys only the pushed head) — not verified.

4 commits had 2 deployments (redeploys of the same sha): 4e8ba3d2 (mlb pregame archive metadata), 08d4057f (mlb daily production slate), 7d74bb17 (human merge), d938c220 (nfl settlement receipts).

## Caveats

- Status windows include queue time; 416 of 1,001 BUILT deployments were queued while a prior one was still running, so raw windows overstate build time. The serial model assumes 1 concurrent build (supported by the data: queued deployments complete one after another, e.g. the 46.2-min failures back-to-back); if the project ever ran builds in parallel the model would under-count those overlapping builds.
- Serial-model sum of raw build time for BUILT is not billing data; Vercel billing (usage dashboard) is the source of truth. All $ are ESTIMATES at $0.0035/CPU-min.
- FAILED = 46 min flat per brief overstates the 4 fast failures by ~180 build-min (~1,440 CPU-min); the "adj." column uses the serial model instead (fast failures ~0–2 min; long failures ~46 min of builder time).
- IGNORED billed at 2 min (16 CPU-min) per COST-001; measured status windows are ~1.2 min median.
- CANCELED_DASHBOARD partial builds estimated by the serial model (47 of 102 had ~0 min = canceled while queued).
- 1d window = trailing 24 h ending 04:54Z on 10-15; it includes the 10-14/15 run of 46-min failed builds, so it is not a typical day. First and last UTC days are partial.
