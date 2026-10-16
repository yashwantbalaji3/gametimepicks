# NFL settlement-receipts stamp gate: prototype, replay and verdict (2026-10-16)

**Verdict: parked. Do not merge.** The gate is safe, but in the measured week it would have avoided **0 of 69 Production deployments**. That week ran from 10-09T00Z to `934055d613` (10-16 20:11Z).

## Why no deployments are avoided
- `nfl-event-window.yml` commits the receipts in the step "Commit settlement receipts", but does not push them there. The step "Publish this run's commits" pushes them together with that run's window commit.
- All 69 window commits changed build inputs: a new `nfl/rosters/<id>.json`, a new `forecast-receipts/<date>/<id>.json`, and about 14 rewritten public NFL files.
- So a push builds whether or not the receipts commit is suppressed.

## What the gate does
- It reuses #1088's library: `RULE_SETS = {mlb, "nfl-receipts"}` and `--rules nfl-receipts`. An unknown rule set exits 2, which publishes.
- The workflow step runs after the "no settlement change" check and before the single commit. It fails open, with a 6 h heartbeat.

## Reader trace
**Allowlisted stamps** (no reader renders them or uses them in logic):
- `interval-calibration` `generatedAt` and `ledgerGeneratedAt`;
- `reconciliation/index.json` `generatedAt` and `weeks.*.generatedAt`.

**Not stamps:**
- `reconciliation/<week>.json` `generatedAt` is rendered as "Graded … ET" (`app/results/nfl/page.tsx`), and `published.generatedAt` selects the archived revision.
- live-props `observedAt` and `rows[].live.observedAt` drive "Updated Ns ago" and the fresh/stale state (`lib/live/featured-forecasts.mjs`).

## Replay
| | heartbeat 6 h | heartbeat off |
|---|---|---|
| Receipts commits suppressed | 12 / 69 | 16 / 69 |
| Pushes that change a build input | 69 → 69 | 69 → 69 |

- **Independent check** (`independent_check.py`, no shared code): 12/12 and 16/16 suppressed changes are stamp-only, with 0 verdict disagreements.
- **Tests:** `nfl-receipts-stamp-gate.test.mjs` 22/22. 290 of 291 tests in the targeted files pass; the exception is a post-build guard that needs `app/out`.

## Where the real saving is
The lever is the window commit, not the receipts commit. Its new per-run snapshot files (rosters and forecast receipts) would need #1088-style "identical to the last committed snapshot" handling, plus a reader trace for the rewritten public NFL files. That is a separate, protected-workflow investigation.
