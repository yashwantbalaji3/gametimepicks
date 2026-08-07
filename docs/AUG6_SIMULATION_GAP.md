# 2026-08-06 — permanent simulation gap

**Decision: do NOT backfill. The gap is permanent and recorded here.**
Program 142 continuation · decided 2026-08-07 · founder's single Aug-6 recovery authorization
**remains unspent**.

## What happened

GitHub Actions entered a `major_outage` on 2026-08-06. Four workflows failed with
`The job was not acquired by Runner of type hosted even after multiple attempts` — the jobs never
started, so **zero Odds credits were spent**. A single authorized manual dispatch was attempted and
returned HTTP 500 from the GitHub API, creating no run.

Result: `app/public/data/mlb/boards/2026-08-06.json` exists (11 games, 486 leans, generated before
the outage) but `app/public/data/mlb/game-simulations/2026-08-06.json` was never created. Automation
resumed overnight; nothing backfills a missed simulation window.

## Why the authorization was not spent afterwards

The authorization was granted while Aug 6 was still *the current day*. Using it on 2026-08-07 would
produce something different in kind: a **post-event reconstruction**.

By the time this was decided, the Aug-6 games had been played and settled. Regenerating simulations
then would run the model in an environment where:

- final scores exist in the repository,
- the settlement ledger has already graded that slate,
- current odds reflect completed events.

Even if the generator only reads pregame inputs, the resulting artifact would be **indistinguishable
on disk from one produced before first pitch**. It would carry an Aug-6 date and sit beside genuine
contemporaneous artifacts, and every downstream consumer — the research corpus, the calibration
backtest, the model-performance ledger — treats a dated simulation artifact as evidence of what the
model believed *before* the games. A file that silently violates that assumption is worse than an
absent file, because absence is visible and a leak is not.

This is the same principle the repository already enforces elsewhere: `capturedAt` must precede
`scheduledStart`, and the research pipeline revalidates market eligibility to prevent leakage. Those
guards exist because backfilled-looking data has previously been the most dangerous class of defect
here.

## Consequences, stated plainly

- **2026-08-06 has a board but no simulations.** Any per-day simulation coverage count for that date
  is legitimately zero and must not be presented as anything else.
- **Money and settlement are unaffected.** Protected hashes `affe6b21…` / `cb80473f…` never moved,
  and the settled record does not depend on the simulation artifact.
- **Six functional guards were red** while "today" resolved to 2026-08-06. They went green
  automatically once 2026-08-07 generated normally (board + simulations, run 31188351417), which
  confirms they were data-state, not defects.

## If a backfill is ever wanted anyway

It would need to be an explicitly labelled reconstruction, not a contemporaneous artifact:

1. Write it to a distinct path (e.g. `game-simulations/reconstructed/2026-08-06.json`), never the
   canonical one.
2. Stamp it with `reconstructed: true`, the reconstruction date, and the pregame snapshot it used.
3. Exclude it by default from research, calibration and model-performance consumers.
4. Prove the inputs predate first pitch, from `data/internal/mlb/pregame-archive/freezes/2026-08-06/`.

Absent all four, the honest artifact is the one that does not exist.
