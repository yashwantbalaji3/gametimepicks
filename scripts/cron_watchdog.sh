#!/usr/bin/env bash
# Cron-fallback watchdog decision (Program 092-095 §6.5).
#
# GitHub scheduled crons are best-effort and have skipped real morning runs. This script makes the
# DISPATCH/SKIP decision for a delayed fallback, from explicit inputs so the logic is testable
# without the network. It never dispatches anything itself — the caller (workflow) does — and it
# never spends credits: dispatching the normal workflow re-enters its own credit guards, and the
# fallback fires only when the primary produced nothing (so the paid ingest cannot be a duplicate).
#
# Inputs (env):
#   TODAY_ET            current ET date (YYYY-MM-DD)
#   NEWEST_BOARD        newest generated board date (YYYY-MM-DD or "none")
#   PRIMARY_RUNS_TODAY  count of primary-workflow runs started today (any status)
#   ACTIVE_RUNS         count of queued/in-progress runs of the primary OR its chained production
#
# Output (stdout): "DISPATCH <reason>" or "SKIP <reason>". Exit 0 always.
set -u

TODAY_ET="${TODAY_ET:?}"
NEWEST_BOARD="${NEWEST_BOARD:-none}"
PRIMARY_RUNS_TODAY="${PRIMARY_RUNS_TODAY:-0}"
ACTIVE_RUNS="${ACTIVE_RUNS:-0}"

# An equivalent writer is queued or running — a late primary is a late writer, never a duplicate.
if [ "$ACTIVE_RUNS" -gt 0 ]; then
    echo "SKIP primary or chained writer is queued/running (${ACTIVE_RUNS} active)"
    exit 0
fi

# Today's board already exists — the work product is present regardless of which run produced it.
if [ "$NEWEST_BOARD" = "$TODAY_ET" ]; then
    echo "SKIP board for ${TODAY_ET} already generated"
    exit 0
fi

# The primary ran today (and is no longer active). If it ran and no board exists, that is a
# FAILURE being handled by the failure alert — a watchdog re-dispatch would double-spend the
# morning's paid ingest path on an already-alerted defect.
if [ "$PRIMARY_RUNS_TODAY" -gt 0 ]; then
    echo "SKIP primary already ran today (${PRIMARY_RUNS_TODAY} run(s)) — failure handling owns this, not the watchdog"
    exit 0
fi

echo "DISPATCH no primary run today, no active writer, and board for ${TODAY_ET} is missing"
exit 0
