#!/usr/bin/env bash
# Commit and push GENERATED artifacts without losing a run to a same-day conflict (P257 pipeline review).
#
#   GENERATED_PATHS="app/public/data/parlays/ data/internal/products/" \
#     bash scripts/ci/commit-generated.sh "auto: daily products 2026-09-11 [skip ci]"
#
# Why: two runs regenerating the same day's derived files (the lab ledger, forward coverage, today's receipt)
# both commit; the second's rebase hits a content conflict and the whole run fails — 2026-09-11 15:13 UTC
# (daily-products), and earlier in epl-matchweek and auto-refresh. For a REGENERATED file, the run that
# pushes last has the freshest derivation, so a conflict inside GENERATED_PATHS resolves to this run's copy.
#
# Guard rails:
#   · only paths under GENERATED_PATHS may be auto-resolved; any other conflict aborts the rebase and fails loud
#   · the protected money files are NEVER auto-resolved, whatever GENERATED_PATHS says
#   · the caller stages; this script only commits what is staged, retries the push, and never force-pushes
set -euo pipefail
MSG="${1:?commit message required}"
: "${GENERATED_PATHS:?GENERATED_PATHS required (space-separated path prefixes)}"
# Protected first-publication-wins paths and the conflict rules live in rebase-onto-main.sh (shared with
# nfl-event-window's publish step, OPS-001).
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if git diff --cached --quiet; then echo "commit-generated: nothing staged"; exit 0; fi
git commit -q -m "$MSG"

for attempt in 1 2 3 4 5; do
  if git push -q origin HEAD:main; then echo "commit-generated: pushed (attempt $attempt)"; exit 0; fi
  echo "commit-generated: push rejected (attempt $attempt) — rebasing onto origin/main"
  git fetch -q origin main
  # Rebases, auto-resolves only regenerable paths to this run's copy, and refuses (exit 1, ::error::) anything
  # else — including a rebase that cannot start, which the old loop retried five times unchanged (OPS-001a).
  LOG_PREFIX=commit-generated bash "$HERE/rebase-onto-main.sh"
  sleep $((attempt * 3))
done
echo "::error::commit-generated: push never landed after 5 attempts"; exit 1
