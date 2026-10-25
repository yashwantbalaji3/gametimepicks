#!/usr/bin/env bash
# Finish a `git pull --rebase` that stopped ONLY on the Level A grade file, by regenerating it — never by picking a side.
#
#   git pull --rebase --autostash origin main || bash scripts/ci/regrade-level-a-on-conflict.sh || exit 1
#
# WHY. data/internal/products/level-a/graded.jsonl has two writers: nightly-settle (every entry) and nba-results-refresh
# (`--only-sport nba`, inside the commit that adds the finals). Both APPEND, so two runs that each graded something
# conflict at the end of the file even when they graded different entries. nightly-settle used to answer any rebase
# conflict with `|| exit 1`, which threw away the whole settlement commit for an append-only file nobody disputed.
#
# HOW. For each stopped commit whose ONLY conflicted path is the grade file:
#   1. take main's copy (in a rebase, --ours is the upstream being rebased onto) — every line main already has stays;
#   2. re-run the grader, which is idempotent and append-only (src/lib/products/level-a/grade.mjs: an already graded entry
#      is never graded again, and its guard refuses an entry graded twice) — so whatever this run graded that main has not
#      is appended once, from the same committed finals this commit carries;
#   3. continue.
# Any other conflicted path, or a grader failure, aborts the rebase and exits 1: exactly the old behaviour.
#
# LEVEL_A_REGRADE_CMD overrides the grader command (tests only).
set -euo pipefail
F="data/internal/products/level-a/graded.jsonl"
P="${LOG_PREFIX:-level-a regrade}"
REGRADE="${LEVEL_A_REGRADE_CMD:-cd app && npx --yes tsx scripts/products/grade-level-a-suggestions.mjs --now \"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\" --write}"
rebasing() { [ -d "$(git rev-parse --git-path rebase-merge)" ] || [ -d "$(git rev-parse --git-path rebase-apply)" ]; }

if ! rebasing; then
  echo "::error::$P: not in a rebase — the pull failed for another reason; nothing to resolve"
  exit 1
fi
while rebasing; do
  conflicted="$(git diff --name-only --diff-filter=U)"
  if [ -n "$conflicted" ]; then
    if [ "$conflicted" != "$F" ]; then
      echo "::error::$P: conflict on $(echo "$conflicted" | tr '\n' ' ')— not only the Level A grade file; aborting, nothing forced"
      git rebase --abort
      exit 1
    fi
    git checkout --ours -- "$F"
    set +e
    ( eval "$REGRADE" )
    code=$?
    set -e
    # 3 = the grader reported a CONFLICT (a final disagreeing with an existing grade): it rewrote nothing and still
    # appended every new grade, exactly as in the settlement step itself. Anything else non-zero is a real failure.
    if [ "$code" != "0" ] && [ "$code" != "3" ]; then
      echo "::error::$P: the grader failed (exit $code) while regenerating $F; aborting the rebase"
      git rebase --abort
      exit 1
    fi
    git add -- "$F"
    echo "$P: $F regenerated on main's copy (both runs had appended grades)"
  fi
  if ! GIT_EDITOR=true git rebase --continue >/dev/null 2>&1; then
    [ -n "$(git diff --name-only --diff-filter=U)" ] && continue
    git rebase --skip >/dev/null 2>&1 || true   # nothing left in this commit: main already had all of it
  fi
done
if ! git merge-base --is-ancestor origin/main HEAD; then
  echo "::error::$P: HEAD is not on origin/main after the rebase"
  exit 1
fi
