#!/usr/bin/env bash
# Proofs for the cron-fallback decision (Program 092-095 §13):
#   - fallback does not dispatch while the primary is active
#   - fallback does not dispatch when the board already exists (no duplicate paid ingestion)
#   - fallback does not re-dispatch an already-failed primary (failure alerting owns that)
#   - fallback dispatches only in the genuinely-missed case
set -u

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/cron_watchdog.sh"
FAILURES=0

decide() { # decide <runs_today> <active> <board>
    TODAY_ET="2026-07-31" NEWEST_BOARD="$3" PRIMARY_RUNS_TODAY="$1" ACTIVE_RUNS="$2" \
        bash "$SCRIPT" | head -1
}
expect() { # expect <desc> <want-prefix> <got>
    case "$3" in
        "$2"*) : ;;
        *) echo "  FAIL: $1 (want '$2…', got '$3')"; FAILURES=$((FAILURES + 1)) ;;
    esac
}

expect "active primary blocks dispatch"            "SKIP" "$(decide 0 1 none)"
expect "active chained writer blocks dispatch"     "SKIP" "$(decide 1 2 none)"
expect "fresh board blocks dispatch"               "SKIP" "$(decide 0 0 2026-07-31)"
expect "failed-but-ran primary blocks re-dispatch" "SKIP" "$(decide 1 0 2026-07-30)"
expect "genuinely missed cron dispatches"          "DISPATCH" "$(decide 0 0 2026-07-30)"
expect "missed cron with no boards dispatches"     "DISPATCH" "$(decide 0 0 none)"

if [ "$FAILURES" -ne 0 ]; then echo "FAIL — $FAILURES assertion(s)"; exit 1; fi
echo "ok — the watchdog cannot double-dispatch, cannot duplicate paid ingestion, and fires only on a genuine miss"
