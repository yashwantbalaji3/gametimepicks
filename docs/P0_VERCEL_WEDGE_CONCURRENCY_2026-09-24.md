# P0 — the 46-minute Vercel wedge: what 400 deployments say that 3 could not

**Date:** 2026-09-24 · **Status:** strongest causal family isolated + one authorised setting change +
two code mitigations. Follows `V18_VERCEL_BUILD_FAILURE_DIAGNOSIS.md` (2026-09-22), which classified the
failure by phase from three deployments. This widens the sample to **400** and that changes the answer.

Read-only Vercel API (`/v6/deployments`, `/v3/deployments/{id}/events`) plus authenticated
`vercel inspect`. One project setting was changed, under an explicit founder authorisation recorded in §5.

## 1. FACT — the failure is not rare and it has exactly one duration

400 deployments of `gametime-picks`, 2026-09-19T12:21Z → 2026-09-24T07:28Z:

| | n | share |
|---|---|---|
| READY | 340 | 85.0% |
| ERROR at **45.6–46.2 min** | 57 | 14.2% |
| ERROR at any other duration | 1 | 0.2% |
| CANCELED | 2 | 0.5% |

**Every ERROR but one is the wedge.** There is no second failure mode and there are no supersessions in
the error bucket — the 2026-09-23 note that "most are rapid back-to-back supersessions from the nightly
bot" was drawn from a 30-deployment sample and does not survive the larger one. Each wedge bills
45 min × 4 vCPU = **180 CPU-minutes**. In the most recent 100 deployments (19 h) that is 41 wedges ≈
**7,380 CPU-minutes**.

## 2. FACT — healthy duration is a long right tail, not a tight band

Successful builds, same window: median **6.6 min**, p90 **~32 min**, max **43.3 min**. The histogram is
continuous from 5 min to 43 min and then stops — because the platform kills at 45. The wedge is the part
of one distribution that runs off the end of the ceiling, not a separate binary state. (The 2026-09-23
note "it is binary, not gradual" is superseded.)

## 3. FACT — duration and wedge rate track CONCURRENT builds

For each deployment, the number of other builds already running when it started:

| concurrent at start | n | median duration | wedge rate |
|---|---|---|---|
| 0 | 155 | 6.5 min | 11.0% |
| 1 | 111 | 6.7 min | 9.9% |
| 2 | 56 | 6.8 min | 17.9% |
| 3 | 27 | 7.0 min | 11.1% |
| 4 | 13 | 17.3 min | 15.4% |
| 5 | 12 | 11.7 min | 16.7% |
| **6+** | **26** | **34.7 min** | **46.2%** |

The onset is visible to the hour. Four days at a stable 0–9% baseline, then 2026-09-23 12:00Z onward at
35–48%. Nothing merged in that window — only bot data commits. What changed is the **shape of the
traffic**: the v1.8 PR drain merged nine PRs in two minutes, and at 14:12:48–14:14:59Z **eleven
production builds started within 132 seconds**. Five wedged; the survivors took 32.6, 37.0, 13.5 and
10.3 min against a 6-minute baseline.

⚠ Concurrency is an **amplifier, not the whole cause**: 11% of builds still wedge with zero overlap.

## 4. FACT — what a wedged build actually does

Seven of eight recent wedges emit **nothing at all** after ~4–7 minutes; the log simply stops and the
build burns to the ceiling in silence. One (`dpl_3GtFtGVLNTJwF`, 2026-09-24T02:10Z) kept its log:

- `Generating static pages (1869/2493)` at **5.17 min** — the three-quarter progress print, as in every
  other wedge;
- then nothing ingested for **39.5 minutes**;
- `run-phase.mjs`'s own 30-second heartbeat fired with elapsed values 240 → 532 → 985 → 1345 → 1434 →
  1470 → 1909 → … — gaps of **292 s, 453 s, 360 s, 439 s**. That process does nothing but write to
  stdout, so a seven-minute gap is not its own GC;
- `⚠ Sending SIGTERM signal to static worker due to timeout of 60 seconds`, two workers exit, and the
  remaining **624 pages complete in ~20 seconds**;
- `[phase] END next-build ok in 2591.9s` (43.2 min, against a healthy ~220 s), then `prune-internal-routes`
  ran — and the deployment was still marked ERROR at the ceiling.

⚠ The Vercel log timestamps are **ingestion** times. The heartbeats' own elapsed counters are computed on
the build machine, which is why they are the load-bearing evidence and the wall-clock stamps are not.

⚠ The "Restarted static page generation for …" wall is the wedged worker's whole queue draining at once.
It does not name a culprit page. Do not read it as 200 individual timeouts.

## 5. FACT — what the build is asked to do, and on what

- 2,492 routes → **2,476 HTML pages**, `out/` = **1.4 GB**, 6,706 files.
- Only 48 MB of that is `out/data` and 3 MB is `_next/static`. **~1.35 GB is generated page output.**
- `/mlb/**` = 523 MB of HTML across 129 pages — **4.15 MB per page**. `/players/**` = 259 MB / 1,771
  pages. `/results/**` = 184 MB / 120 pages.
- Peak resident memory of the build process tree, measured locally during static generation: **~4.2 GB**.
- Local machine 8 vCPU / 16 GB builds this in **2 min 19 s** and has never wedged. Vercel builds it on
  **4 vCPU / 8 GB** (`standard`, `cle1`).

## 6. INFERENCE (strong, not proven)

The static-generation phase sits at the edge of what a 4-vCPU / 8-GB container can hold. Overlapping
builds on shared build infrastructure push it over; past the edge the whole process tree stalls for
minutes at a time — which is why a wrapper that only writes to stdout misses its 30-second interval by
seven minutes, why Next's own 60-second worker timeout does not fire until minute 44, and why killing two
workers lets the last quarter of the route list finish in twenty seconds.

**Not established:** which page, or whether a specific route family is implicated at all. The last
progress print is simply Next's 75% mark; it names a quarter of the route list, not a page. Nothing here
justifies calling it "a slow page", an OOM, or a Next.js bug.

## 7. What changed

**(a) Elastic Concurrency OFF** — `resourceConfig.elasticConcurrencyEnabled: true → false` on project
`gametime-picks` (`prj_qaHS65v4G30tTy1s6MYbsLbKYvbh`), applied **2026-09-24T14:00:16Z**, verified by
re-read at 14:00:27Z. Builds now queue instead of running 6–11 at once.
`buildMachineType` is **unchanged at `standard`** (4 vCPU / 8 GB) — the machine-class upgrade was
explicitly NOT authorised. No CI, Preview, Production or validation requirement was altered.

**(b) The deploy trigger stops building for commits the export throws away.**
`vercel-ignore-build.sh` treats all of `app/` as a build input. But `prune-internal-routes.mjs` deletes
`out/data/ops` and the `/ops` route from every export, so a commit confined to `app/public/data/ops/`
cannot change one byte the public site serves. `8cccf8a9` ("auto-refresh: zero Odds API credits") was
exactly that — three ops files — and it wedged production for 46 minutes to publish an identical site.
**13 of the last 155 main commits (8.4%)** were of that shape.
The new `NON_BUILD_INPUTS` array is not taken on trust: `internal-route-exclusion.test.mjs` parses it out
of the shell script and asserts, against a real build, both directions — every listed prefix **exists and
is non-empty in source** (so the rule cannot be renamed into a no-op) and **is absent from `out/`** (so it
can never skip a build that would have changed the live site).

**(c) The heartbeat now reports the machine, not just the process.**
`[phase] ALIVE` lines carry `mem <used>/<limit>` read from the build's own cgroup (v2, then v1, then the
host), `load` (1-minute average) and `self` (the wrapper's own RSS, as a control). On the next occurrence
the log alone separates memory exhaustion from CPU contention from a blocked pipe — the distinction this
incident could not make. Every read is optional and wrapped; a missing cgroup file yields no field and
cannot fail a build.

## 8. What is still open

- Whether serialised builds still wedge. **One green build proves nothing** — the base rate at zero
  concurrency is 11%. Compare wedge rate, median duration, and CPU-minutes over a meaningful sample
  against §1–§3, and record queue time separately from build duration.
- If they still wedge, the evidence-backed next question is the **8-vCPU / 16-GB machine class**, which is
  a founder gate.
- `/mlb` at 4.15 MB of HTML per page is the structural driver underneath all of this and is not addressed
  here.
