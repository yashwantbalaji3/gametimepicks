# v1.8 — Track B1: the ~46-minute Vercel failure, classified by phase (diagnosis, no fix)

**Date:** 2026-09-22 · **Status:** diagnosis only. Nothing is changed here — this is the phase
classification B1 asked for, from authenticated Vercel build logs, plus the two things it rules out.
Any remediation is a separate decision (§6).

## 1. What B1 was waiting on, and what unblocked it

The v1.7 closeout established the shape but not the cause: local cold build ≈117 s for ≈2.4k pages,
healthy Vercel builds ≈5–7 min, failures clustering near **46 min** — the platform ceiling — with the root
cause "uncertain without authenticated Vercel logs". The CLI in this environment **is** authenticated to
`yashwantbalaji33-7164s-projects/gametime-picks` (the canonical project, dash spelling), so the logs were
read directly. Read-only: no deployment was cancelled, redeployed, promoted, or reconfigured, and no
project or billing setting was touched.

Three deployments were compared, all on the same build machine class (**4 cores, 8 GB**, `cle1`) and the
same Next.js (**14.2.15**):

| Deployment | Env | Commit | Outcome |
|---|---|---|---|
| `7jsrjkxwg` | Production | `8182f62` (bot: "mlb lineup refresh") | **● Error after 46m** |
| `nv3fm7kn1` | Preview | `0550601a` (PR #632, Track C1) | **● Building, silent 24m+** |
| `3yvpkgbc1` | Production | `3eb86c88` | ● Ready in **5m** |

## 2. The classification

Every phase before static generation is **normal in the failing builds** — often marginally faster than in
the healthy one. The failure is not install, not compile, not type-checking, not the six data-emission
steps, and not the clone.

| Phase | Healthy (`3yvpkgbc1`) | Failing (`7jsrjkxwg`) | Failing (`nv3fm7kn1`) |
|---|---|---|---|
| Clone | 42 s | 42 s | 42 s |
| `npm install` + build-info / compare / lab / ask / search assets | ~25 s | ~25 s | ~40 s |
| `next build` → "Compiled successfully" | 70 s | 49 s | 84 s |
| Lint + type validity | 42 s | 33 s | 43 s |
| Collecting page data | 3 s | 2 s | 3 s |
| Generating static pages **0 → 1856** | 107 s | 104 s | 106 s |
| Generating static pages **1856 → 2475** | **64 s** | **never — no further output** | **never — no further output** |
| Finalize + traces + prune + publish | 21 s | — | — |
| **Total** | **5 m** | **46 m → Error** | **still building** |

### The signature

Both failing builds emit `Generating static pages (1856/2475)` and then **write nothing at all** —
no error, no warning, no progress — until the platform ceiling ends the build. The stall is at the same
counter in both, to the page:

```
healthy  20:24:50  (1856/2475)  →  20:25:50  (2436/2475)  →  20:25:54  ✓ (2475/2475)
failing  19:06:16  (1856/2475)  →  [42 minutes of silence]  →  ● Error
failing  20:06:42  (1856/2475)  →  [24 minutes of silence and counting]
```

**That final band is already the slowest part of a healthy build.** Pages 618→1237 take 21 s and
1237→1856 take 18 s (≈34 pages/s), but 1856→2436 takes 60 s (≈10 pages/s) — roughly **3× the per-page
cost** of everything before it. The band that intermittently hangs is the band that is already three
times more expensive per page.

## 3. What this rules out

- **Not caused by any v1.8 branch.** The 46-minute Error was a Production build of plain `main` at a bot
  commit with no v1.8 code in it. PR #632's preview reproduces the identical signature at the identical
  counter, which makes the red check on that PR an instance of this pre-existing class, not a defect in
  Track C1. (#630 and #631 built green in 6–7 min on the same afternoon, from the same `main`.)
- **Not a size or payload cliff reached gradually.** The same commit range builds in 5–7 min most of the
  time. It is **intermittent** on identical or near-identical input, which points at contention or an
  external dependency inside that route band rather than at a threshold that has been crossed for good.
- **Not a lint, type, compile or data-generation problem.** Each of those completes normally, before the
  stall, in every failing build examined.

## 4. Where to look next (hypotheses, untested)

Ranked by what the evidence supports, not by ease:

1. **A route in the final band does I/O or heavy synchronous work during generation.** A fetch with no
   timeout would produce exactly this signature: no output, no error, no progress, until an external
   ceiling intervenes. A page that reads a very large artifact per page would explain the 3× per-page cost
   in the same band. Identify the band first: it is the ~619 pages Next generates after the 1856th, in its
   own deterministic order.
2. **Memory pressure on an 8 GB / 4-core machine.** Generation is the peak-memory phase, the last band is
   the most expensive, and a machine paging heavily stops emitting progress without dying. Worth checking
   whether the export's biggest per-page payloads sit in that band.
3. **Concurrency inside the band** — Next's worker pool stalling on a shared resource, which would also be
   intermittent on identical input.

A named-phase watchdog (**B5**) would convert this from a 46-minute silent ceiling into a fast, diagnosable
failure, and is worth doing regardless of which hypothesis is right: it preserves the diagnosis instead of
discarding it, which is the whole problem with the current failure mode.

## 5. A second finding, for B2

The healthy build's own log:

```
[prune-internal-routes] out/data swept: removed 3125 file(s), 982.0 MB; kept build-info.json, …
```

**982 MB across 3,125 files is copied into the export and then deleted at the end of every build.** B2's
measured targets (`out/` ≈1.4 GB, `/mlb` ≈628 MB, `/players` ≈342 MB, `/results` ≈271 MB) are the figures
*after* that sweep, so this is close to a gigabyte of pure waste per build, paid in both export size and
build time, on every deployment. Not copying those files in the first place is a candidate B2 win that
needs no semantic change and no weight-budget edit — but it requires the careful reader mapping B2 already
calls for, because the sweep's `kept` list is long and specific. Not attempted here.

## 6. Why no fix is proposed here

Each hypothesis in §4 leads somewhere different — a route change, a build-machine change (which is a
billing decision and a founder gate), or a watchdog — and picking one without identifying the route band
would be guessing at a 46-minute intermittent failure. The next step is cheap and bounded: determine which
routes occupy the 1856→2475 band, then measure that band's per-page cost and peak memory locally. That is a
new piece of work, not the tail of this diagnosis.

## 7. Verification trail

`vercel ls gametime-picks` and `vercel inspect --logs <url>` against the three deployments in §1,
2026-09-22 20:29–20:35Z. Read-only. Phase boundaries in §2 are the log's own timestamps, differenced — not
estimates. The two failing builds' logs end at the line quoted in §2, with nothing after it.
