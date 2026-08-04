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

# ── machine-readable state taxonomy (2026-08-04) ───────────────────────────────
# Operators and dashboards must consume a stable classification, not regex-match prose.
state() { # state <runs_today> <active> <board> [recoverable]
    TODAY_ET="2026-07-31" NEWEST_BOARD="$3" PRIMARY_RUNS_TODAY="$1" ACTIVE_RUNS="$2" \
    RECOVERABLE_EVENTS="${4:-0}" bash "$SCRIPT" | sed -n 's/^WATCHDOG_STATE=\([A-Z_]*\).*/\1/p'
}
expect "state: active writer"            "ACTIVE_WRITER"              "$(state 0 1 none)"
expect "state: board missing"            "BOARD_MISSING"              "$(state 0 0 2026-07-30)"
expect "state: refresh missing"          "REFRESH_MISSING"            "$(state 0 0 2026-07-31 2)"
expect "state: refresh complete"         "REFRESH_COMPLETE"           "$(state 1 0 2026-07-31 2)"
expect "state: external no-market"       "NO_MARKET_EXTERNAL"         "$(state 0 0 2026-07-31 0)"
expect "state: recovery already tried"   "RECOVERY_ALREADY_ATTEMPTED" "$(state 1 0 2026-07-30)"
# The decision line must remain FIRST so existing `head -1` callers keep working.
expect "decision line stays first"       "DISPATCH" "$(decide 0 0 2026-07-30 | cut -d' ' -f1)"

# IDEMPOTENCY / retry-safety: identical inputs must yield an identical decision every time.
a="$(state 0 0 2026-07-31 3)"; b="$(state 0 0 2026-07-31 3)"
expect "idempotent under retry" "$a" "$b"

# MUTATION: if the active-writer guard were removed, a competing dispatch would appear. Prove the
# guard is what prevents it by simulating its absence on an otherwise-dispatchable input.
MUT="$(mktemp)"; trap 'rm -f "$MUT"' EXIT
sed '/^if \[ "$ACTIVE_RUNS" -gt 0 \]; then$/,/^fi$/d' "$SCRIPT" > "$MUT"
if ! diff -q "$SCRIPT" "$MUT" >/dev/null; then
    got="$(TODAY_ET=2026-07-31 NEWEST_BOARD=2026-07-30 PRIMARY_RUNS_TODAY=0 ACTIVE_RUNS=5 bash "$MUT" | head -1 | cut -d' ' -f1)"
    expect "MUTATION: removing the active-writer guard causes a competing DISPATCH" "DISPATCH" "$got"
    guarded="$(decide 0 5 2026-07-30 | cut -d' ' -f1)"
    expect "…while the real script still refuses" "SKIP" "$guarded"
else
    echo "  FAIL: active-writer mutation did not change the script"; FAILURES=$((FAILURES + 1))
fi

if [ "$FAILURES" -ne 0 ]; then echo "FAIL — $FAILURES assertion(s)"; exit 1; fi
echo "ok — the watchdog cannot double-dispatch, cannot duplicate paid ingestion, and fires only on a genuine miss"
