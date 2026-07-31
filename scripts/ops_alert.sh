#!/usr/bin/env bash
# Operations alert — one message per failed RUN, carrying exactly the contract in
# docs/OPS_ALERTING_CONTRACT.md and nothing else.
#
# WHY THIS EXISTS
# On 2026-07-30 a real production failure (nightly-settle, board file not found) was surfaced
# correctly by the orchestrator and then went unread for two days, because the only place it
# appeared was the Actions tab. A failure nobody is told about is operationally identical to a
# failure that was swallowed. The four workflows each carried their own inline notify block with
# slightly different content and no slate context, so this centralises them.
#
# CONTRACT — the payload carries ONLY:
#   workflow + failing phase · ET slate date · exit status · newest board date ·
#   newest settled date · run URL · a short redacted error class/message
# and NEVER: secrets or env values, raw sportsbook payloads, user data, bankroll or protected
# hashes, or large logs / stack traces containing local paths.
#
# Delivery never masks the primary failure: this script always exits 0. The workflow's own
# failure is what fails the run, and GitHub Actions remains the authoritative audit trail.
#
# Usage (from a workflow step with `if: failure()`):
#   PHASE=nightly-settle EXIT_STATUS=2 ERROR_LINE="..." bash scripts/ops_alert.sh
set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BOARDS_DIR="${OPS_ALERT_BOARDS_DIR:-$REPO_ROOT/app/public/data/mlb/boards}"
LEDGER="${OPS_ALERT_LEDGER:-$REPO_ROOT/app/public/data/mlb/results/settled_leans.jsonl}"

PHASE="${PHASE:-unknown-phase}"
EXIT_STATUS="${EXIT_STATUS:-unknown}"
SLATE_DATE="${SLATE_DATE:-$(TZ=America/New_York date +%F)}"
RUN_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-unknown/repo}/actions/runs/${GITHUB_RUN_ID:-0}"
RUN_ID="${GITHUB_RUN_ID:-0}"
ATTEMPT="${GITHUB_RUN_ATTEMPT:-1}"
BRANCH="${GITHUB_REF_NAME:-unknown}"

# ── freshness context: what the operator needs to judge severity at a glance ────
newest_board="none"
if [ -d "$BOARDS_DIR" ]; then
    b="$(ls "$BOARDS_DIR" 2>/dev/null | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}\.json$' | sort | tail -1)"
    [ -n "$b" ] && newest_board="${b%.json}"
fi

newest_settled="none"
if [ -f "$LEDGER" ]; then
    s="$(python3 - "$LEDGER" <<'PY' 2>/dev/null || true
import json, sys
newest = ""
try:
    with open(sys.argv[1]) as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line).get("date") or ""
            except Exception:
                continue
            if d > newest:
                newest = d
except Exception:
    pass
print(newest)
PY
)"
    [ -n "$s" ] && newest_settled="$s"
fi

# ── redaction ──────────────────────────────────────────────────────────────────
# The error line is the only free-form field, so it is the only place a secret, a local path or a
# whole stack trace can leak in. Truncate hard, strip absolute paths, and drop anything shaped like
# a key. Belt and braces: the payload is assembled in Python so quoting cannot break the redaction.
REDACTED_ERROR="$(printf '%s' "${ERROR_LINE:-}" | python3 -c '
import re, sys
s = sys.stdin.read().strip().splitlines()
s = s[0] if s else ""
s = re.sub(r"/(?:Users|home|root)/[^\s\"]*", "<path>", s)          # local filesystem paths
s = re.sub(r"/home/runner/work/[^\s\"]*", "<path>", s)             # CI checkout paths
s = re.sub(r"\b[A-Za-z0-9_-]{24,}\b", "<redacted>", s)             # key-shaped tokens
s = re.sub(r"\b[0-9a-f]{32,}\b", "<redacted>", s)                  # hashes, incl. protected md5s
s = re.sub(r"(apiKey|api_key|token|secret|password)=\S+", r"\1=<redacted>", s, flags=re.I)
print(s[:200])
')"

# OPS_ALERT_TEST=1 sends the same payload through the same delivery path, but labeled as an
# informational delivery test so it can never be mistaken for a production failure.
# OPS_ALERT_KIND=warning labels an operational WARNING (e.g. credit-budget anomaly) — the run
# did not fail, but an operator should look. Anything else is a failure alert.
if [ "${OPS_ALERT_TEST:-0}" = "1" ]; then
    SUMMARY="GameTimePicks ops-alert delivery TEST on ${BRANCH} (informational — nothing failed)"
    echo "::notice::${SUMMARY} - ${RUN_URL}"
elif [ "${OPS_ALERT_KIND:-failure}" = "warning" ]; then
    SUMMARY="GameTimePicks ${PHASE} WARNING on ${BRANCH} (run succeeded — attention needed)"
    echo "::warning::${SUMMARY} - ${RUN_URL}"
else
    SUMMARY="GameTimePicks ${PHASE} FAILED on ${BRANCH} (exit ${EXIT_STATUS})"
    echo "::error::${SUMMARY} - ${RUN_URL}"
fi

PAYLOAD="$(python3 -c '
import json, sys
summary, phase, slate, status, board, settled, url, run_id, attempt, err = sys.argv[1:11]
text = (
    f"{summary}\n"
    f"slate {slate} · newest board {board} · newest settled {settled}\n"
    + (f"{err}\n" if err else "")
    + f"{url}"
)
print(json.dumps({
    "text": text, "content": text,
    "workflow": phase, "slateDate": slate, "exitStatus": status,
    "newestBoard": board, "newestSettled": settled,
    "runUrl": url, "runId": run_id, "runAttempt": attempt,
    "error": err or None,
}))
' "$SUMMARY" "$PHASE" "$SLATE_DATE" "$EXIT_STATUS" "$newest_board" "$newest_settled" "$RUN_URL" "$RUN_ID" "$ATTEMPT" "$REDACTED_ERROR")"

if [ "${OPS_ALERT_PRINT_ONLY:-0}" = "1" ]; then
    printf '%s\n' "$PAYLOAD"
    exit 0
fi

DELIVERY="not attempted (OPS_WEBHOOK_URL unset)"
if [ -n "${OPS_WEBHOOK_URL:-}" ]; then
    if curl -sS --max-time 15 -X POST -H 'content-type: application/json' --data "$PAYLOAD" "$OPS_WEBHOOK_URL" >/dev/null 2>&1; then
        DELIVERY="delivered"
    else
        DELIVERY="FAILED to deliver (the run failure above still stands)"
        echo "::warning::ops alert delivery failed - the workflow failure is already surfaced above"
    fi
else
    echo "::notice::OPS_WEBHOOK_URL unset - this failure is visible only in the Actions tab. Set the secret to receive alerts."
fi

# Record delivery in the run summary so the audit trail says whether anyone was actually told.
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
        echo "### Operations alert"
        echo ""
        echo "- run: [\`${RUN_ID}\` attempt ${ATTEMPT}](${RUN_URL})"
        echo "- phase: \`${PHASE}\` · exit \`${EXIT_STATUS}\` · slate \`${SLATE_DATE}\`"
        echo "- newest board: \`${newest_board}\` · newest settled: \`${newest_settled}\`"
        [ -n "$REDACTED_ERROR" ] && echo "- error: \`${REDACTED_ERROR}\`"
        echo "- delivery: **${DELIVERY}**"
    } >> "$GITHUB_STEP_SUMMARY"
fi

# Always 0: alerting is observability, not a gate. The failing step is what fails the run.
exit 0
