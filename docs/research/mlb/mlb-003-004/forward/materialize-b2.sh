#!/usr/bin/env bash
# Forward test B2 · materialise one date AFTER its games. Refuses unless the model code is byte-identical to the B2
# registration commit (the commit that added FORWARD-PREREGISTRATION-B2.md, with this file and the B2 code).
#   bash docs/research/mlb/mlb-003-004/forward/materialize-b2.sh 2026-10-10
set -euo pipefail
D="${1:?date YYYY-MM-DD}"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
FREEZE="$(git log --diff-filter=A --format=%H -- docs/research/mlb/mlb-003-004/forward/FORWARD-PREREGISTRATION-B2.md | tail -1)"
[ -n "$FREEZE" ] || { echo "REFUSED: B2 registration not committed"; exit 2; }
FROZEN=(app/src/lib/mlb/full-game app/src/lib/game-simulations/rng.ts app/src/lib/results/mlb-leans-of-record.mjs docs/research/mlb/mlb-003-004/forward/run-forward-b2.mjs docs/research/mlb/mlb-003-004/forward/grade-forward-b2.mjs docs/research/mlb/mlb-003-004/forward/materialize-b2.sh)
if ! git diff --quiet "$FREEZE" -- "${FROZEN[@]}"; then echo "REFUSED: model code differs from the B2 freeze $FREEZE:"; git diff --stat "$FREEZE" -- "${FROZEN[@]}"; exit 2; fi
cd app
node scripts/mlb/capture-mlb-boxscore-outcomes.mjs --from "$(date -u -j -v-1d -f %Y-%m-%d "$D" +%Y-%m-%d 2>/dev/null || date -u -d "$D -1 day" +%Y-%m-%d)" --to "$D" --write
npx tsx ../docs/research/mlb/mlb-003-004/forward/run-forward-b2.mjs --date "$D" --write
