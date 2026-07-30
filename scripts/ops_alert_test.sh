#!/usr/bin/env bash
# PROGRAM 069 — prove the operations alert carries the contract and leaks nothing.
#
# The alert is the only thing standing between a failed scheduled run and nobody noticing for two
# days, which is exactly what happened on 2026-07-30. It is also a message leaving the repository,
# so what it must NOT contain matters as much as what it must.
#
# Run: bash scripts/ops_alert_test.sh
set -u

FAILURES=0
check() { # check <description> <expected> <actual>
    if [ "$2" != "$3" ]; then
        echo "  FAIL: $1 (expected '$2', got '$3')"
        FAILURES=$((FAILURES + 1))
    fi
}
contains()     { case "$2" in *"$1"*) echo yes;; *) echo no;; esac; }

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/ops_alert.sh"

FIXTURE="$(mktemp -d)"
trap 'rm -rf "$FIXTURE"' EXIT
mkdir -p "$FIXTURE/boards"
: > "$FIXTURE/boards/2026-07-28.json"
: > "$FIXTURE/boards/2026-07-30.json"
printf '%s\n' '{"id":"a","date":"2026-07-26","outcome":"Win"}' '{"id":"b","date":"2026-07-27","outcome":"Loss"}' > "$FIXTURE/ledger.jsonl"

run_alert() { # run_alert <error line>
    OPS_ALERT_PRINT_ONLY=1 \
    OPS_ALERT_BOARDS_DIR="$FIXTURE/boards" \
    OPS_ALERT_LEDGER="$FIXTURE/ledger.jsonl" \
    PHASE="nightly-settle" EXIT_STATUS="2" SLATE_DATE="2026-07-30" \
    GITHUB_SERVER_URL="https://github.com" GITHUB_REPOSITORY="o/r" GITHUB_RUN_ID="123" \
    GITHUB_RUN_ATTEMPT="1" GITHUB_REF_NAME="main" \
    ERROR_LINE="$1" \
    bash "$SCRIPT" 2>/dev/null | tail -1
    # tail -1: the script also writes a `::error::` annotation to stdout so the failure is visible in
    # the Actions log. The JSON payload is the last line; parsing the whole stream would choke on it.
}

# ── 1. required contract fields are present ────────────────────────────────────
OUT="$(run_alert "MlbSettleError: board file not found")"
for field in '"workflow": "nightly-settle"' '"slateDate": "2026-07-30"' '"exitStatus": "2"' \
             '"newestBoard": "2026-07-30"' '"newestSettled": "2026-07-27"' \
             '"runUrl": "https://github.com/o/r/actions/runs/123"' '"runId": "123"'; do
    check "payload carries $field" "yes" "$(contains "$field" "$OUT")"
done

# Freshness must be READ, not echoed back from the caller: the newest board here is 07-30 and the
# newest settled 07-27, which is precisely the gap an operator needs to see.
check "newest settled is derived from the ledger, not the slate date" "no" "$(contains '"newestSettled": "2026-07-30"' "$OUT")"

# ── 2. forbidden content never ships ───────────────────────────────────────────
LEAKY='Traceback: /Users/someone/gametimepicks/pipeline/x.py failed apiKey=abcdefghijklmnopqrstuvwxyz012345 hash affe6b21071f2b3be96bb2774eb347c3'
OUT="$(run_alert "$LEAKY")"
check "absolute local paths are redacted"        "no"  "$(contains "/Users/someone" "$OUT")"
check "api keys are redacted"                    "no"  "$(contains "abcdefghijklmnopqrstuvwxyz012345" "$OUT")"
check "protected hashes are redacted"            "no"  "$(contains "affe6b21071f2b3be96bb2774eb347c3" "$OUT")"
check "the error is still reported, redacted"    "yes" "$(contains "redacted" "$OUT")"

# A multi-line stack trace must be reduced to one line — a whole trace is both noise and a leak.
MULTI="$(printf 'first line of error\n  File "/home/runner/work/x/y.py", line 5\n    raise Boom')"
OUT="$(run_alert "$MULTI")"
check "only the first error line survives" "no" "$(contains 'File "' "$OUT")"
check "CI checkout paths are redacted"     "no" "$(contains "/home/runner/work" "$OUT")"

# ── 3. an over-long error cannot smuggle a payload through ─────────────────────
LONG="$(python3 -c 'print("x"*4000)')"
OUT="$(run_alert "$LONG")"
LEN="$(printf '%s' "$OUT" | python3 -c 'import json,sys; print(len((json.loads(sys.stdin.read()).get("error") or "")))')"
if [ "$LEN" -le 200 ]; then TRUNC=ok; else TRUNC="error field is $LEN chars"; fi
check "the error field is truncated" "ok" "$TRUNC"

# ── 4. delivery never masks the primary failure ────────────────────────────────
# An unreachable webhook must still exit 0: the failing step is what fails the run.
OPS_ALERT_BOARDS_DIR="$FIXTURE/boards" OPS_ALERT_LEDGER="$FIXTURE/ledger.jsonl" \
PHASE=t EXIT_STATUS=1 OPS_WEBHOOK_URL="http://127.0.0.1:9/nope" \
    bash "$SCRIPT" >/dev/null 2>&1
check "an undeliverable alert still exits 0" "0" "$?"

# And with no webhook configured at all — today's real state — it must also exit 0 and say so.
OPS_ALERT_BOARDS_DIR="$FIXTURE/boards" OPS_ALERT_LEDGER="$FIXTURE/ledger.jsonl" \
PHASE=t EXIT_STATUS=1 OPS_WEBHOOK_URL="" \
    OUT_NOTICE="$(bash "$SCRIPT" 2>&1)"
check "an unconfigured webhook exits 0"            "0"   "$?"
check "an unconfigured webhook says so explicitly" "yes" "$(contains "OPS_WEBHOOK_URL unset" "${OUT_NOTICE:-}")"

# ── 5. every workflow that can fail routes through this script ─────────────────
# Four workflows previously carried their own inline notify block. A new one that hand-rolls a
# payload would drift straight back out of the contract.
WF_DIR="$DIR/../.github/workflows"
INLINE=""
for f in "$WF_DIR"/*.yml; do
    if grep -q 'OPS_WEBHOOK_URL' "$f" && ! grep -q 'ops_alert.sh' "$f"; then
        INLINE="$INLINE $(basename "$f")"
    fi
done
check "no workflow hand-rolls its own alert payload" "" "$INLINE"

if [ "$FAILURES" -ne 0 ]; then
    echo "FAIL — $FAILURES assertion(s)"
    exit 1
fi
echo "ok — the alert carries the contract, redacts paths/keys/hashes, truncates, and never masks the run failure"
