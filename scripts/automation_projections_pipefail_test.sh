#!/usr/bin/env bash
# PROGRAM 066 — prove the PROJECTIONS orchestrator cannot report a failed step as success.
#
# THE DEFECT THIS PINS
# Sprint 049 fixed this exact shape in automation_settle.sh and stopped there. automation_projections.sh
# carries the same pattern in all five of its paid steps:
#
#     if $PY -m pipeline.x 2>&1 | tee /tmp/log; then ok "..."; else err "..."; fi
#
# A pipeline's exit status is its LAST command's — `tee`, which succeeds whenever the log is writable.
# So a Python traceback takes the `then` branch and prints "completed".
#
# Observed in production: from 2026-07-29, `pipeline.mlb.generate_mlb_board` raised
# `AttributeError: 'list' object has no attribute 'get'` on every run (the roster loop was not updated
# when the team lookup started returning lists for doubleheaders). This script printed
# "✓ MLB board generation completed" and exited 0 each time. No board existed for 2026-07-29 or
# 2026-07-30; nightly-settle then failed with "board file not found"; the first VISIBLE symptom was a
# missing day on the public site, two days after the break. A green run is worse than a red one when
# it is wrong.
#
# Run: bash scripts/automation_projections_pipefail_test.sh
set -u

FAILURES=0
check() { # check <description> <expected> <actual>
    if [ "$2" != "$3" ]; then
        echo "  FAIL: $1 (expected '$2', got '$3')"
        FAILURES=$((FAILURES + 1))
    fi
}

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/automation_projections.sh"

# ── 1. the real script must declare pipefail ───────────────────────────────────
if grep -q '^set -o pipefail' "$SCRIPT"; then
    HAS_PIPEFAIL=yes
else
    HAS_PIPEFAIL=no
fi
check "automation_projections.sh sets pipefail" "yes" "$HAS_PIPEFAIL"

# ── 2. every piped step must sit below it ──────────────────────────────────────
# A step added above the `set -o pipefail` line would silently reacquire the defect.
# Comment lines are skipped: the explanation above the fix quotes the buggy pattern verbatim.
PIPEFAIL_LINE=$(grep -n '^set -o pipefail' "$SCRIPT" | head -1 | cut -d: -f1)
FIRST_TEE_LINE=$(grep -n 'if .*\$PY.*| tee' "$SCRIPT" | grep -v ':[[:space:]]*#' | head -1 | cut -d: -f1)
if [ -n "$PIPEFAIL_LINE" ] && { [ -z "$FIRST_TEE_LINE" ] || [ "$PIPEFAIL_LINE" -lt "$FIRST_TEE_LINE" ]; }; then
    ORDER=ok
else
    ORDER="pipefail at ${PIPEFAIL_LINE:-none}, first piped step at ${FIRST_TEE_LINE:-none}"
fi
check "pipefail is declared before the first piped step" "ok" "$ORDER"

# ── 3. KNOWN NEGATIVE — without pipefail the production bug reproduces ─────────
# The proof that the property under test is real rather than assumed.
WITHOUT=$(
    bash -c '
        set -e
        if (exit 1) 2>&1 | tee /dev/null; then echo "REPORTED_SUCCESS"; else echo "REPORTED_FAILURE"; fi
    ' 2>/dev/null
)
check "without pipefail a crashing generator reports success" "REPORTED_SUCCESS" "$WITHOUT"

# ── 4. KNOWN POSITIVE — with pipefail the same shape reports failure ───────────
WITH=$(
    bash -c '
        set -e
        set -o pipefail
        if (exit 1) 2>&1 | tee /dev/null; then echo "REPORTED_SUCCESS"; else echo "REPORTED_FAILURE"; fi
    ' 2>/dev/null
)
check "with pipefail a crashing generator reports failure" "REPORTED_FAILURE" "$WITH"

# ── 5. a SUCCEEDING step must still report success ────────────────────────────
# Guards the obvious over-correction: pipefail must not turn healthy runs red.
STILL_OK=$(
    bash -c '
        set -e
        set -o pipefail
        if (exit 0) 2>&1 | tee /dev/null; then echo "REPORTED_SUCCESS"; else echo "REPORTED_FAILURE"; fi
    ' 2>/dev/null
)
check "with pipefail a succeeding step still reports success" "REPORTED_SUCCESS" "$STILL_OK"

# ── 6. the sibling orchestrators must not drift back ──────────────────────────
# This defect has now been found twice, in two scripts, for the same reason. Any orchestrator that
# pipes a paid step into tee must declare pipefail, or the next silent green run is already written.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNCOVERED=""
for f in "$DIR"/automation_*.sh; do
    case "$f" in *_test.sh) continue;; esac
    if grep -qE 'if .*\| *tee' "$f" && ! grep -q '^set -o pipefail' "$f"; then
        UNCOVERED="$UNCOVERED $(basename "$f")"
    fi
done
check "no automation orchestrator pipes into tee without pipefail" "" "$UNCOVERED"

if [ "$FAILURES" -ne 0 ]; then
    echo "FAIL — $FAILURES assertion(s)"
    exit 1
fi
echo "ok — pipefail covers every piped step, the known-negative reproduces the 2026-07-29 defect, and no sibling orchestrator is uncovered"
