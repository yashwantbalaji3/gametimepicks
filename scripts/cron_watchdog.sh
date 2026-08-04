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
#
# MISSED-REFRESH RECOVERY (added 2026-08-04, closing a gap this watchdog itself exposed):
# the original rule stopped here, so a board that existed but had never been REFRESHED was
# invisible to recovery. On 2026-08-03 the 09:30 cron never fired; the board from 00:34 was
# present, so the watchdog correctly stayed silent — and nothing else re-checked coverage until
# the 15:30 top-up, six hours later. A board existing is not the same as a board being current.
#
# So: if the board exists but the primary never ran today AND events remain that could still
# legitimately gain coverage (uncovered and pregame), that is a missed refresh, not a healthy day.
# Dispatching the normal generator re-enters its own credit guards and the shared writer queue,
# and it cannot double-spend because it only fires when the primary did not run at all.
if [ "$NEWEST_BOARD" = "$TODAY_ET" ]; then
    # Defensive: a caller mis-quoting a `grep -c` can hand us "0\n0" or empty. A malformed count
    # must never crash the watchdog or be read as "recoverable" — normalise to the first integer,
    # else 0. Recovery is opt-in on trustworthy input only.
    RECOVERABLE_EVENTS="$(printf '%s' "${RECOVERABLE_EVENTS:-0}" | tr -dc '0-9\n' | head -1)"
    [ -n "$RECOVERABLE_EVENTS" ] || RECOVERABLE_EVENTS=0
    if [ "$PRIMARY_RUNS_TODAY" -eq 0 ] && [ "$RECOVERABLE_EVENTS" -gt 0 ]; then
        echo "DISPATCH board for ${TODAY_ET} exists but no refresh ran today and ${RECOVERABLE_EVENTS} pregame event(s) still lack coverage — missed refresh"
        exit 0
    fi
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
