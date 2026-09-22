# v1.8 — B5: named build phases, observable while they hang (receipt)

**Goal:** make another ~46-minute silent Vercel stall **diagnosable from the log alone**, instead of requiring
authenticated `vercel inspect` across three deployments to reconstruct.

**Not done here, deliberately:** no Vercel plan, billing or resource change · `vercel-ignore-build.sh`
untouched · no `[skip ci]` · no rendered semantics changed · nothing is killed or timed out.

## 1. The constraint that shaped the design

From `docs/V18_VERCEL_BUILD_FAILURE_DIAGNOSIS.md`: two builds printed
`Generating static pages (1856/2475)` and then **nothing at all** — no error, no OOM, no progress — for ~41
minutes, until the platform ceiling ended them at 46 minutes.

**A hung build never finishes, so a receipt written at the end is worthless for the one failure it exists to
explain.** Every diagnostic therefore goes to **stdout while the phase is still running**, because the
streamed log is the only thing that survives a ceiling kill. The JSON receipt is a convenience for builds that
complete; it is never the mechanism.

## 2. What it does

`app/scripts/build/run-phase.mjs` wraps each build step. One grep token, `[phase]`:

```
[phase] START  next-build at 2026-09-22T20:02:46Z
[phase] ALIVE  next-build 630s · last progress "Generating static pages (1856/2475)" 611s ago
[phase] END    next-build ok in 123.0s
[phase] FAIL   next-build killed by SIGKILL after 2760.4s · last progress "Generating static pages (1856/2475)"
```

The 46-minute stall would now state, from the log alone: **which phase started and never ended**, its elapsed
seconds, **the last progress counter it reached**, and **how long that counter had been frozen**. That is the
whole diagnosis, with no authenticated log fetch.

All nine phases are wrapped, each still `&&`-gated: `build-info-emit` · `compare-assets` · `lab-assets` ·
`ask-projections` · `ask-assets` · `search-index` · **`next-build`** · `prune-internal-routes` ·
`build-info-publish`. `npm run build:raw` keeps the unwrapped chain for local debugging; it is not what Vercel
runs.

### Fail toward observability, never toward skipping work

- child stdout/stderr forwarded **byte-for-byte**, never buffered or filtered;
- the child's exit code **is** this process's exit code, always — a wrapper that can turn red into green is
  worse than no wrapper;
- **nothing is killed and nothing is timed out.** A watchdog that killed a stalled build would destroy the
  evidence it exists to capture, and the platform ceiling already ends the run;
- if the instrumentation itself throws, the child still runs — the progress watcher is wrapped, and a receipt
  that cannot be written is not a build failure (the one deliberate swallow in the script).

### Measured on a real build

`next-build ok in 123.0s` (consistent with the documented ~117 s local cold build), total 9 phases, and the
heartbeat tracked `Linting…` → `Generating static pages (0/2475)` → `(618/2475)` → `Collecting build traces`.
Before any progress line it says *"no progress line seen yet"* rather than inventing a counter.

## 3. A defect found in the first draft, and the guard that now prevents it

The receipt defaulted to **`public/data/ops/build-phases.json`** — a published, committed path, and
`nightly-settle.yml` stages `app/public/data/ops/` **wholesale**. Every bot build would have committed its own
runner's phase timings into the repo as if they were product data. Nothing would have failed; the churn would
simply have appeared.

The default is now `.next/gtp-build-phases.json` — a build artifact, already git-ignored, never published.
A test pins both properties that made the old path wrong: the default must not live under `public/`, and the
directory it uses must really be git-ignored (checked against `.gitignore`, not assumed).

## 4. Tests and probes

`app/src/lib/ops/build-phase-observability.test.mjs` — **10 tests**, run against the real script with real
child processes, never a mock. Two classes, because either alone would be a green that proves nothing:

1. **Wiring** — every expensive step actually runs through the runner in the real `build` script, every `&&`
   link is still a gate, and no `|| true`, `skip-ci`, `--no-lint` or `--no-typecheck` escape was introduced.
2. **Behaviour** — output forwarding, exit-code fidelity across four codes, the heartbeat naming the frozen
   counter, `START` printed before the child runs, usage errors, non-fatal receipt failure, and the ceiling
   case.

**Thirteen mutation probes, all caught:**

| Probe | Result |
|---|---|
| `next-build` unwrapped in `package.json` (**the disconnected-logger case**) | caught |
| a cheap phase unwrapped (partial disconnection) | caught |
| the chain loosened with `\|\| true` | caught |
| the wrapper swallows the child's exit code | caught (2 fail) |
| the heartbeat disabled outright | caught |
| the heartbeat stops naming the last progress counter | caught |
| the static-generation counter no longer matched | caught (2) |
| child output observed but not forwarded | caught (2) |
| `START` printed only after the child finishes | caught |
| a malformed invocation runs nothing and exits 0 | caught |
| a signal kill loses its signal name and frozen counter | caught |
| the receipt defaults back into the published ops directory | caught |
| the receipt defaults to any other published path | caught |

The signal probe is worth recording. Its first version claimed the mutation "reported a kill as a pass" and
**survived** — because `code ?? 1` already makes a signalled close non-zero, so redness was never at risk.
What the mutation actually dropped was the **signal name and the frozen counter**, which is precisely the
ceiling case's evidence. The label was wrong, not the code; the assertion now pins what is really lost.

## 4a. A guard the wrapper broke, and why its replacement is stronger

`src/lib/search-index-generated.test.mjs` failed on the first full run:

> `not ok 4731 - every way the site is served generates it first`

It asserted `/build-search-index\.mjs[^&]*&& next build/` — i.e. that `next build` sits **immediately** after
the `&&`. Wrapping each step broke that spelling, because `next build` is now behind
`run-phase.mjs next-build --`.

**Adjacency was never the requirement.** The invariant is that the search index is generated **before**
`next build`, and that a failure to generate it **stops** the build; adjacency was a proxy that happened to
hold. The replacement checks the invariant directly — the index's position must precede `next build`'s, the
text between them must contain `&&`, and must not contain `|| true` or a `;` sequence.

That is strictly stronger than what it replaced, and it was probed to prove so rather than asserted. Four
weakenings, all caught: inverting the order · removing the index step · making it unconditionally green with
`|| true` · sequencing the two steps with `;` instead of `&&`. The old regex would have caught **none** of the
last three, because all three keep `next build` adjacent to an `&&`.

This is worth recording as a pattern: when a refactor breaks a guard, the guard is often asserting a proxy for
what it means. Re-spelling it to match the new text would have kept a weak guard; asking what it was really
protecting produced a better one.

## 5. What B5 does not attempt

It does not explain **why** the last route band hangs — that is still the open question in
`V18_VERCEL_BUILD_FAILURE_DIAGNOSIS.md` §4, and it needs the route band identified. B5's contribution is that
the next occurrence will say so itself, in the log, at the time, for free.
