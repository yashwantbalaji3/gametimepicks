#!/usr/bin/env bash
# Bounded LOCAL job runner (Program 235 · Release B).
#
# THE INCIDENT THIS ENCODES. Program 163 built watch-gate.sh for remote CI runs and wrote the rules
# down. Program 234 leaked a watcher anyway — not by breaking those rules, but by being outside
# them: it was waiting on a LOCAL `npm run gate`, for which no helper existed, so it hand-rolled
#
#     until grep -q "GATE_EXIT=" /tmp/gate2.log; do sleep 20; done
#
# The marker was echoed to the command's own stdout and never reached that file, so the predicate
# could never be satisfied. The job itself had already finished. And the harness's foreground
# timeout stopped applying the moment the loop was backgrounded, so it ran unbounded for two hours.
#
# WHAT THIS GUARANTEES
#   - the command's REAL exit code is captured and written to a receipt, by the wrapper that ran it;
#   - the deadline is enforced by `timeout(1)` INSIDE this process, so backgrounding cannot defeat it;
#   - completion is the receipt, never a string in a log — a truncated log cannot hide a result and
#     a log containing "success" cannot invent one;
#   - every terminal state is distinct and is the exit code, so a caller need not parse anything.
#
# Usage: scripts/ops/run-job.sh <name> [--deadline SECS] [--cwd DIR] [--sha SHA] -- <command...>
# Exit:  0 SUCCESS · 2 FAILURE · 3 CANCELLED · 4 TIMEOUT · 7 UNKNOWN · 64 usage
set -uo pipefail

NAME="${1:?usage: run-job.sh <name> [--deadline SECS] [--cwd DIR] [--sha SHA] -- <command...>}"
shift
DEADLINE=1800
JOB_CWD="$PWD"
SHA=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --deadline) DEADLINE="${2:?--deadline needs a value}"; shift 2 ;;
    --cwd)      JOB_CWD="${2:?--cwd needs a value}"; shift 2 ;;
    --sha)      SHA="${2:?--sha needs a value}"; shift 2 ;;
    --)         shift; break ;;
    *)          echo "run-job: unknown option $1" >&2; exit 64 ;;
  esac
done
[[ $# -gt 0 ]] || { echo "run-job: no command given (did you forget --?)" >&2; exit 64; }

DIR="${TMPDIR:-/tmp}/gtp-jobs"
mkdir -p "$DIR"
RECEIPT="$DIR/${NAME}.json"
LOG="$DIR/${NAME}.log"

# A previous receipt must not be readable as this run's result while this run is in flight.
rm -f "$RECEIPT"

# `timeout` on Linux, `gtimeout` from coreutils on macOS. Without either, the deadline cannot be
# enforced and that is reported rather than silently dropped.
TIMEOUT_BIN=""
command -v timeout  >/dev/null 2>&1 && TIMEOUT_BIN="timeout"
[[ -z "$TIMEOUT_BIN" ]] && command -v gtimeout >/dev/null 2>&1 && TIMEOUT_BIN="gtimeout"

STARTED_MS=$(($(date +%s) * 1000))
STARTED_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [[ -n "$TIMEOUT_BIN" ]]; then
  ( cd "$JOB_CWD" && "$TIMEOUT_BIN" --signal=TERM --kill-after=30s "${DEADLINE}s" "$@" ) >"$LOG" 2>&1
  CODE=$?
else
  ( cd "$JOB_CWD" && "$@" ) >"$LOG" 2>&1
  CODE=$?
  echo "run-job: no timeout(1) available — the deadline was NOT enforced for $NAME" >&2
fi

ENDED_MS=$(($(date +%s) * 1000))
ENDED_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
ELAPSED=$(( (ENDED_MS - STARTED_MS) / 1000 ))

case "$CODE" in
  0)   STATUS="SUCCESS";   REASON="exited 0";                                        EXIT=0 ;;
  124) STATUS="TIMEOUT";   REASON="no terminal result within its ${DEADLINE}s deadline — killed, not left running"; EXIT=4 ;;
  130) STATUS="CANCELLED"; REASON="interrupted by SIGINT";                           EXIT=3 ;;
  143) STATUS="CANCELLED"; REASON="interrupted by SIGTERM";                          EXIT=3 ;;
  *)   STATUS="FAILURE";   REASON="exited ${CODE}";                                  EXIT=2 ;;
esac

# The receipt is written LAST and atomically: a reader either sees a complete terminal record or no
# record at all, never a half-written one it might parse as finished.
cat > "$RECEIPT.tmp" <<JSON
{
  "schemaVersion": 1,
  "artifact": "local-job-receipt",
  "name": "${NAME}",
  "command": "$(printf '%s ' "$@" | sed 's/"/\\"/g; s/ $//')",
  "cwd": "${JOB_CWD}",
  "expectedSha": "${SHA}",
  "startedAt": "${STARTED_ISO}",
  "endedAt": "${ENDED_ISO}",
  "elapsedSecs": ${ELAPSED},
  "deadlineSecs": ${DEADLINE},
  "deadlineEnforced": $([[ -n "$TIMEOUT_BIN" ]] && echo true || echo false),
  "exitCode": ${CODE},
  "status": "${STATUS}",
  "reason": "${REASON}",
  "log": "${LOG}"
}
JSON
mv -f "$RECEIPT.tmp" "$RECEIPT"

echo "${STATUS} job=${NAME} exit=${CODE} elapsed=${ELAPSED}s receipt=${RECEIPT}"
exit "$EXIT"
