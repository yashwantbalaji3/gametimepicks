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

decide() { # decide <runs_today> <active> <board> [recoverable_events]
    TODAY_ET="2026-07-31" NEWEST_BOARD="$3" PRIMARY_RUNS_TODAY="$1" ACTIVE_RUNS="$2" \
    RECOVERABLE_EVENTS="${4:-0}" \
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

# ── missed-refresh recovery (2026-08-04) ───────────────────────────────────────
# The gap this closes: on 2026-08-03 the 09:30 cron never fired, the 00:34 board existed, so the
# watchdog stayed silent and coverage went un-rechecked for six hours. A board existing is not the
# same as a board being current.
expect "board exists + no refresh today + recoverable events -> DISPATCH" "DISPATCH" "$(decide 0 0 2026-07-31 1)"
expect "…and it names the missed refresh"                                 "DISPATCH board for 2026-07-31 exists but no refresh ran today" "$(decide 0 0 2026-07-31 2)"
# It must stay conservative in every neighbouring case:
expect "board exists + refresh already ran -> SKIP"        "SKIP" "$(decide 1 0 2026-07-31 3)"
expect "board exists + nothing recoverable -> SKIP"        "SKIP" "$(decide 0 0 2026-07-31 0)"
expect "board exists + writer active -> SKIP"              "SKIP" "$(decide 0 2 2026-07-31 3)"
# And the original missing-board path is unchanged.
expect "missing board still dispatches"                    "DISPATCH" "$(decide 0 0 2026-07-30 0)"

# Malformed counts must degrade to SKIP, never crash and never be read as "recoverable".
# The real shape seen live: `grep -c || echo 0` emits "0\n0" when there are no matches.
expect "malformed count '0\\n0' degrades to SKIP" "SKIP" "$(decide 0 0 2026-07-31 "$(printf '0\n0')")"
expect "empty count degrades to SKIP"             "SKIP" "$(decide 0 0 2026-07-31 "")"
expect "garbage count degrades to SKIP"           "SKIP" "$(decide 0 0 2026-07-31 "abc")"

if [ "$FAILURES" -ne 0 ]; then echo "FAIL — $FAILURES assertion(s)"; exit 1; fi
echo "ok — the watchdog cannot double-dispatch, cannot duplicate paid ingestion, and fires only on a genuine miss"
