# Cron Fallback & Paid-Ingest Safety (Program 092-095 Lane D — LIVE)

GitHub schedules are best-effort (a real morning cron skip is on record). The new
`cron-watchdog` workflow (14:30 UTC daily + dispatch) recovers a genuinely missed morning
generation without ever being able to duplicate paid ingestion.

## Decision logic — `scripts/cron_watchdog.sh` (pure, tested)

DISPATCH only when **all** hold; otherwise SKIP with a named reason:
1. no `morning-projections` run started today (a failed run ≠ a missed run — failure alerting
   owns failures; the watchdog only owns *absence*),
2. no morning-projections / mlb-daily-production run queued or in progress (a late writer is a
   late writer, never a duplicate — they share the `gtp-generated-artifacts` queue),
3. today's board does not exist (the work product itself is the freshness check).

On DISPATCH: runs the NORMAL `morning-projections` workflow (which re-enters its own credit
floors, cache, and queue) and sends a labeled WARNING through the ops webhook so a fallback
activation is never silent.

## Why paid duplication is impossible

- Fires only when **no board exists** — i.e., the morning paid ingest demonstrably did not
  happen; there is nothing to duplicate.
- Never fires beside an active/queued writer (rule 2), and the dispatched workflow itself
  serializes on the shared queue.
- Never re-dispatches after a *failed* primary (rule 1) — that path already alerted and may
  have spent credits; the watchdog must not spend them again.

## Proofs — `scripts/cron_watchdog_test.sh` (wired into `run_all_tests.sh`)

active primary → SKIP · active chained writer → SKIP · fresh board → SKIP ·
failed-but-ran primary → SKIP · genuine miss → DISPATCH · no boards at all → DISPATCH.

## Measured miss frequency

One proven skipped morning cron in the July record (remedied by manual dispatch at the time);
GitHub cron delay/skip is documented platform behavior. One watchdog check/day at ~1 runner
minute is the entire cost of closing it.
