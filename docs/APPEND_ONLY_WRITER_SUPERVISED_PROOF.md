# Append-Only Official-Addition Writer — Supervised Proof (Program 123-127)

**State: BUILT · REHEARSED · NOT YET UNATTENDED.** The writer exists, is mutation-proven, and has
been exercised end-to-end against the live Aug 3 board with **zero paid requests**. It is
deliberately not wired into the 15:30 cron on day one (§1.1).

## What it is

`app/scripts/mlb-append-official-coverage.mjs` — consumes rows from the canonical event-scoped
generator and produces an `official_addition` patch.

**It contains no model math**, and that is guard-tested: rows come from
`generate_mlb_board.py --event <id> --rows-out`, whose output is proven equal to the full
generator's (`event_scope_equivalence_test.py`, whole-row equality). There is no second
projection implementation to drift.

## Safety properties (each mutation-tested through the real CLI)

| Property | Enforcement |
|---|---|
| Writes nothing by default | `--apply` required; rehearsal is the default mode |
| Base board never mutated | opened read-only; sha256 **and** identity digest compared before/after; mismatch = hard abort |
| No overwrite of published rows | an already-published identity refuses the whole patch |
| No cross-event contamination | a row whose `gamePk` ≠ target refuses |
| No unknown events | target must be on the canonical schedule for the date |
| No post-start additions | `capturedAt >= scheduledStart` refuses |
| No identity-less rows | a row with no canonical identity refuses |
| Whole-patch semantics | any refusal aborts the entire patch — never a partial write |
| Honest empty result | zero eligible rows → `NO_MARKET_DECISION`, exit 0 (a successful decision) |
| Research stream separation | emits only `official_addition`; movement snapshots cannot enter |
| Idempotent | re-applying an existing `patchId` is a no-op |

Mutations run in **child processes** so module caching cannot mask a change, and against a real
board so the fixtures are production-shaped.

## Rehearsal (§7 — no paid fetch)

Against the live `2026-08-03` board, target LAD @ CHC (gamePk 824647, first pitch 00:05Z):

```
patch official-2026-08-03-824647-cc4a8c1d49df
  additions   2 new official identities
  population  211 base + 2 = 213
  base sha256 7d54aee717bea203 (identity digest 5e69fa7bf785c998)
REHEARSAL — nothing written.
```

Base board byte-identical afterwards; no production artifact changed. Accounting closes gap-zero
before anything would be written.

## What remains before unattended use

1. **A real supervised run** — the 15:30 top-up must first report `MARKETS_AVAILABLE` for a
   still-pregame event. If it reports `NO_ELIGIBLE_MARKETS`, that is a successful decision and the
   writer simply has nothing to do today (§1.3).
2. **Downstream rebuild wiring** (Phase 1C) — player sims, full-game status, predictions and
   signature-product eligibility must consume the materialized population. Until that exists, an
   applied patch would add official rows that downstream artifacts have not yet rebuilt from,
   which is why day one stays supervised rather than scheduled.
3. Two clean patch days → retire the whole-slate fallback.

**The honest summary:** the dangerous half (touching the published population) is built and
proven. The remaining half is plumbing rebuilt artifacts, and it should not be rushed into a cron
hours before it fires unattended — the sequencing that has prevented the last several incidents.
