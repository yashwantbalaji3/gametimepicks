#!/usr/bin/env bash
# Bounded single-target gate watcher (Program 163 · Release A).
#
# WHY THIS EXISTS. Program 162 leaked four watchers that ran for hours after their targets went
# terminal. Root cause: each polled `gh run list --limit 1` (the NEWEST run) filtered by its own
# SHA — after a newer push superseded that run, the newest run never carried the SHA again, so the
# predicate was permanently unfulfillable. This helper closes every hole structurally:
#   - the target is resolved to ONE run id up front and polled BY ID (immune to supersession);
#   - a hard deadline always exits (the harness timeout is not enforced on backgrounded loops);
#   - a cancelled conclusion exits distinctly as SUPERSEDED — check the covering tip instead;
#   - transient API errors are UNKNOWN_RETRYABLE inside the bound, never success or a respawn;
#   - a per-run lockfile refuses duplicate watchers for the same target (stale locks self-clear).
#
# Usage: scripts/ops/watch-gate.sh <run-id | commit-sha> [deadline-secs=1800] [interval-secs=30]
# Exit codes: 0 success · 2 failure/other-terminal · 3 superseded(cancelled) · 4 deadline ·
#             5 duplicate-watcher · 6 target-not-found
set -uo pipefail

REPO="yashwantbalaji3/gametimepicks"
TARGET="${1:?usage: watch-gate.sh <run-id|sha> [deadline-secs] [interval-secs]}"
DEADLINE="${2:-1800}"
INTERVAL="${3:-30}"

# Resolve a sha to its run id EXACTLY ONCE; from then on the run id is the only identity.
if [[ "$TARGET" =~ ^[0-9]+$ ]]; then
  RUN_ID="$TARGET"
else
  RUN_ID="$(gh run list --repo "$REPO" --branch main --workflow quality-gate.yml --limit 20 \
    --json databaseId,headSha --jq ".[] | select(.headSha|startswith(\"$TARGET\")) | .databaseId" 2>/dev/null | head -1)"
  if [[ -z "$RUN_ID" ]]; then echo "TARGET_NOT_FOUND: no quality-gate run for sha $TARGET in the last 20"; exit 6; fi
fi

LOCK="${TMPDIR:-/tmp}/gtp-watch-gate-${RUN_ID}.pid"
if [[ -f "$LOCK" ]] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  echo "DUPLICATE_WATCHER: pid $(cat "$LOCK") already watches run $RUN_ID — one watcher per target"
  exit 5
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT INT TERM

START=$SECONDS
while true; do
  CONCLUSION="$(gh run view "$RUN_ID" --repo "$REPO" --json conclusion --jq '.conclusion // empty' 2>/dev/null)" || CONCLUSION=""
  if [[ -n "$CONCLUSION" ]]; then
    ELAPSED=$((SECONDS - START))
    case "$CONCLUSION" in
      success)   echo "TERMINAL run=$RUN_ID conclusion=success elapsed=${ELAPSED}s"; exit 0 ;;
      cancelled) echo "SUPERSEDED run=$RUN_ID conclusion=cancelled elapsed=${ELAPSED}s — check the covering tip run instead"; exit 3 ;;
      *)         echo "TERMINAL run=$RUN_ID conclusion=$CONCLUSION elapsed=${ELAPSED}s"; exit 2 ;;
    esac
  fi
  # Empty conclusion = in progress OR an API hiccup: UNKNOWN_RETRYABLE inside the bound.
  if (( SECONDS - START >= DEADLINE )); then
    echo "DEADLINE run=$RUN_ID after ${DEADLINE}s without a terminal conclusion — exiting, not lingering"
    exit 4
  fi
  sleep "$INTERVAL"
done
