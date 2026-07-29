#!/usr/bin/env bash
# SPRINT 049 — prove the settlement orchestrator cannot report a failed step as success.
#
# THE DEFECT THIS PINS
# Every step in automation_settle.sh is written as:
#
#     if $PY -m pipeline.x 2>&1 | tee /tmp/log; then ok "..."; else err "..."; fi
#
# Bash defines a pipeline's exit status as the status of its LAST command. That is `tee`, which always
# succeeds. So a Python traceback took the `then` branch and printed "completed".
#
# Observed in production on 2026-07-29: the settlement-lineage gate correctly refused to write 641 rows
# for the 2026-07-28 doubleheader collision, Python exited non-zero, and the script reported
# "✓ MLB settlement completed" and exited 0. The workflow went green while a hard integrity gate was
# firing. `set -o pipefail` is the fix; this proves it, and proves the test would have caught it.
#
# Run: bash scripts/automation_settle_pipefail_test.sh
set -u

FAILURES=0
check() { # check <description> <expected> <actual>
    if [ "$2" != "$3" ]; then
        echo "  FAIL: $1 (expected '$2', got '$3')"
        FAILURES=$((FAILURES + 1))
    fi
}

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/automation_settle.sh"

# ── 1. the real script must declare pipefail ───────────────────────────────────
if grep -q '^set -o pipefail' "$SCRIPT"; then
    HAS_PIPEFAIL=yes
else
    HAS_PIPEFAIL=no
fi
check "automation_settle.sh sets pipefail" "yes" "$HAS_PIPEFAIL"

# ── 2. every `if ... | tee ...` step must be covered by it ─────────────────────
# A step added above the `set -o pipefail` line would silently reacquire the defect.
PIPEFAIL_LINE=$(grep -n '^set -o pipefail' "$SCRIPT" | head -1 | cut -d: -f1)
# Skip comment lines: the explanation above `set -o pipefail` quotes the buggy pattern verbatim, and a
# naive grep matches its own documentation.
FIRST_TEE_LINE=$(grep -n 'if \$PY.*| tee' "$SCRIPT" | grep -v ':[[:space:]]*#' | head -1 | cut -d: -f1)
if [ -n "$PIPEFAIL_LINE" ] && [ -n "$FIRST_TEE_LINE" ] && [ "$PIPEFAIL_LINE" -lt "$FIRST_TEE_LINE" ]; then
    ORDER=ok
else
    ORDER="pipefail at ${PIPEFAIL_LINE:-none}, first piped step at ${FIRST_TEE_LINE:-none}"
fi
check "pipefail is declared before the first piped step" "ok" "$ORDER"

# ── 3. KNOWN NEGATIVE — without pipefail the bug reproduces exactly ────────────
# This is the proof that the property being tested is real rather than assumed.
WITHOUT=$(
    bash -c '
        set -e
        if (exit 7) 2>&1 | tee /dev/null; then echo "REPORTED_SUCCESS"; else echo "REPORTED_FAILURE"; fi
    ' 2>/dev/null
)
check "without pipefail a failing command reports success" "REPORTED_SUCCESS" "$WITHOUT"

# ── 4. KNOWN POSITIVE — with pipefail the same shape reports failure ───────────
WITH=$(
    bash -c '
        set -e
        set -o pipefail
        if (exit 7) 2>&1 | tee /dev/null; then echo "REPORTED_SUCCESS"; else echo "REPORTED_FAILURE"; fi
    ' 2>/dev/null
)
check "with pipefail a failing command reports failure" "REPORTED_FAILURE" "$WITH"

# ── 5. a SUCCEEDING command must still report success ─────────────────────────
# Guards the obvious over-correction: pipefail must not turn healthy runs red.
STILL_OK=$(
    bash -c '
        set -e
        set -o pipefail
        if (exit 0) 2>&1 | tee /dev/null; then echo "REPORTED_SUCCESS"; else echo "REPORTED_FAILURE"; fi
    ' 2>/dev/null
)
check "with pipefail a succeeding command still reports success" "REPORTED_SUCCESS" "$STILL_OK"

if [ "$FAILURES" -ne 0 ]; then
    echo "FAIL — $FAILURES assertion(s)"
    exit 1
fi
echo "ok — pipefail is set before the first piped step, and the known-negative reproduces the original defect"
