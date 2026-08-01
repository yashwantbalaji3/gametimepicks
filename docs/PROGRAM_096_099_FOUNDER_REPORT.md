# Program 096–099 Founder Report — Append-Only Coverage Shipped, Forward Data Flowing

**2026-07-31 ~23:30 ET · Bottom line: the whole-slate limitation is gone in code — evening games
can now gain coverage without touching a single published row, proven by 11 mutation tests. The
first forward-research artifact (tomorrow's 30 starting-pitcher workload profiles) was captured
tonight, leakage-safe. July-31's first settled native-provenance proof is staged for the
overnight settle with a 10-minute acceptance checklist. Analytics and email remain exactly two
dashboard actions — nothing else stands between you and a measured launch.**

## The headline: append-only event coverage

Yesterday's hard lesson (a mid-slate regen nearly churned the published record) became today's
architecture: **immutable base board + append-only patch stream + deterministic materializer**.
A patch can only ADD rows for a future event on the board's own schedule; started events,
identity overwrites, restamped caches, and pre-August boards are all refused by the validator —
each refusal mutation-tested. Official additions join the settled population (gap-zero proven);
**movement snapshots are a separate research stream that can never inflate prediction counts**.
Rollout is forward-only from Aug 1, the whole-slate fallback stays until two clean patch days.

## Forward research corpus — collecting as of tonight

- **Pitcher workload/rest: LIVE.** Tomorrow's slate, 30 starter slots, rest days + last-3
  appearance loads with source gamePks, all derived from games strictly before Aug 1, all
  pregame-eligible, one honest `NO_PRIOR_APPEARANCES`. Internal-only by construction.
- **Market movement: READY** — rides the patch stream's snapshot kind with capture windows.
- **Lineups: AVAILABLE** — the existing pregame archive already captures them with provable
  pregame timestamps from the free official source. Not rights-blocked.
- The frozen model touches none of it; the market stays the benchmark; the future preregistered
  protocol now has real forward families and a start date.

## Tonight's live evidence

The post-slate top-up decision was observed for real: `SKIP — a slate game has already started`,
0 credits — the guard born from yesterday's cancellation, doing its job on day one. Day-one
top-up ledger: 3 credits total, two design truths. Duplicate project: dormant through the
busiest deploy evening on record (4th quiet-window entry).

## Wall-clock and your actions

- **Overnight (automatic):** nightly-settle settles July 31 → first settled PROVEN_STAMPED
  population; morning generates Aug 1. Checkpoint α command + expected states are written down.
- **Tomorrow ~15:30 ET (automatic):** first scheduled top-up decision; checkpoint β.
- **You (unchanged, ~8 min total):** ① Blob store + three env vars → analytics goes live and the
  first adoption read fills itself; ② email toggles; ③ Aug-7 duplicate review; ④ billing
  screenshot.

## Verification

Full suite green (3,607 tests incl. 11 new patch proofs), typecheck, build, 18-check health
gate, Python suites, YAML validation. Production serves the final SHA; protected money
byte-exact (19-14 · $19,065.40); `vp/` untouched; zero credits spent this program.

**Verdict: the platform now adds coverage without rewriting history, learns forward without
touching the frozen model, and operates itself overnight. Measured-launch readiness is gated on
your two dashboard actions — the engineering queue is empty.**
