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
| `nv3fm7kn1` | Preview | `0550601a` (PR #632, Track C1) | **● Error after 46m** (confirmed 20:47Z) |
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
| **Total** | **5 m** | **46 m → Error** | **46 m → Error** |

### The signature

Both failing builds emit `Generating static pages (1856/2475)` and then **write nothing at all** —
no error, no warning, no progress — until the platform ceiling ends the build. The stall is at the same
counter in both, to the page:

```
healthy  20:24:50  (1856/2475)  →  20:25:50  (2436/2475)  →  20:25:54  ✓ (2475/2475)
failing  19:06:16  (1856/2475)  →  [42 minutes of silence]  →  ● Error
failing  20:06:42  (1856/2475)  →  [41 minutes of silence]       →  ● Error
```

Both failing builds ran **46 minutes to the minute** before the platform ended them, from two different
commits, one Production and one Preview.

**That final band is already the slowest part of a healthy build.** Pages 618→1237 take 21 s and
1237→1856 take 18 s (≈34 pages/s), but 1856→2436 takes 60 s (≈10 pages/s) — roughly **3× the per-page
cost** of everything before it. The band that intermittently hangs is the band that is already three
times more expensive per page.

### The log contains no error at all

Worth stating plainly, because it constrains the hypotheses: the failed builds' logs were searched for
`out of memory`, `oom`, `killed`, `SIGKILL`, `SIGTERM`, `heap`, `timed out`, `exceeded` and `error:`.
**Nothing matches.** The last line written is the `(1856/2475)` progress line, and then the build produces
no output whatsoever for the remaining ~41 minutes. A hard OOM kill normally leaves a trace; this leaves
none, which fits a **hang** — a wait that never returns — better than a crash.

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

## 3a. Confirmed after the merge: the SAME code both failed and passed

§3 argued from a production build of plain `main` that no v1.8 branch causes this. The refresh of PR #632
turned that inference into a demonstration. The projection code is byte-identical in both runs — the second
commit adds one test file and one receipt section, nothing the build executes:

| Commit | Env | Build | The 1856 → 2475 band |
|---|---|---|---|
| `0550601a` | Preview | **46 m → ● Error** | stalled at `1856/2475`, silent 41 min |
| `efaba452` | Preview | **6 m → ● Ready** | `1856 → 2434` in 60 s, then `✓ 2475/2475` |

Both on `4 cores, 8 GB` in `cle1`, same Next.js, same route set (2,475 pages both times). The passing build
was verified as a real build rather than a skip — `[ignore-build] no previous deployed SHA — building` — and
crossed the failing band at the healthy rate measured in §2 (≈10 pages/s, 60 s).

**So the failure is intermittent infrastructure, not code**: identical input, same machine class, opposite
outcomes ~25 minutes apart. Two consequences worth stating plainly:

- a green Vercel run does **not** mean the next one is safe. Production builds of `main` hit this
  independently of any branch, and nothing in this diagnosis changes that;
- a re-run is a legitimate first response to this specific signature — but only *after* matching the
  signature, because an unconditional "just re-run it" habit is how a real defect gets waved through.
  §2 gives the four things to match: the stall at `1856/2475`, ~40+ minutes of silence, no
  OOM/SIGKILL/heap/error line, and termination at ~46 minutes.

## 4. Where to look next (hypotheses, untested)

Ranked by what the evidence supports, not by ease:

1. **A route in the final band does I/O or heavy synchronous work during generation.** A fetch with no
   timeout would produce exactly this signature: no output, no error, no progress, until an external
   ceiling intervenes. A page that reads a very large artifact per page would explain the 3× per-page cost
   in the same band. Identify the band first: it is the ~619 pages Next generates after the 1856th, in its
   own deterministic order.
2. **Memory pressure on an 8 GB / 4-core machine.** Generation is the peak-memory phase and the last band is
   the most expensive, so a machine paging heavily would stop emitting progress without dying. The absence of
   any OOM line is consistent with paging rather than a kill, but it is weaker evidence than hypothesis 1 —
   an OOM kill would usually say so. Worth checking whether the export's biggest per-page payloads sit in
   that band.
3. **Concurrency inside the band** — Next's worker pool stalling on a shared resource, which would also be
   intermittent on identical input.

A named-phase watchdog (**B5**) would convert this from a 46-minute silent ceiling into a fast, diagnosable
failure, and is worth doing regardless of which hypothesis is right: it preserves the diagnosis instead of
discarding it, which is the whole problem with the current failure mode. The §3a result strengthens that
case rather than weakening it — an intermittent hang is exactly the failure a watchdog turns from a
46-minute mystery into a cheap, repeatable observation.

**No Vercel plan, billing or project setting was changed** by this diagnosis or by the post-merge checkpoint;
every observation is read-only (`vercel ls`, `vercel inspect --logs`).

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
2026-09-22 20:29–20:50Z, re-read after `nv3fm7kn1` terminated. Read-only. Phase boundaries in §2 are the log's own timestamps, differenced — not
estimates. The two failing builds' logs end at the line quoted in §2, with nothing after it.
