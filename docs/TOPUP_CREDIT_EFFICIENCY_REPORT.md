# Top-Up Credit Efficiency Report (as of 2026-07-31 close)

## Observed real decisions (day one)

| When (ET) | Decision | Credits | Outcome |
|---|---|---|---|
| 19:49 (manual, pre-cron) | RUN — 2 uncovered pregame games | 3 (completion path) | exposed the leans-scoping root cause; no coverage gain possible by construction |
| ~20:05 (corrected target) | dispatched, then **deliberately cancelled** mid-queue | 0 | slate-safety rule born: never regen mid-slate |
| 22:2x (post-slate check) | **SKIP — "a slate game has already started"** | 0 | the fallback guard working exactly as designed |

Day-one totals: **3 credits, zero waste beyond the diagnostic value, zero record damage.**
Balance ~10,040 of 20K; steady-state burn unchanged (60–130/day).

## First SCHEDULED decision — wall-clock

The 19:30 UTC (15:30 ET) cron takes its first autonomous decision **2026-08-01**. Expected:
- fully covered slate → `SKIP … already has market coverage` (0 credits), or
- early-slate day with games underway → `SKIP … already started` (0 credits), or
- all-pregame gap slate → dispatch of the board generator inside floor 2000 / expected 62.

Verify with: `gh run list --workflow=mlb-afternoon-topup --limit 1` + the decision line in its
log; append the result here (credits from the board's own ledger block).

## Whole-slate fallback vs append-only (rollout comparison)

| Metric | Whole-slate fallback (today) | Event-level append-only (shipped, pending first patch day) |
|---|---|---|
| Safe window | entire slate pregame | **target event pregame** — early games no longer block evening coverage |
| Rows rewritten | whole-board regen risk (why the cancellation happened) | **zero** — base rows immutable, proven |
| Credit scope | broad refresh | only uncovered future events |
| Movement research | limited | separate stamped `movement_snapshot` stream |
| Settlement population | single board | base + accepted official patches, gap-zero proven |

Fallback retires only after two clean append-only slates.
