#!/usr/bin/env bash
# Forward test B · materialise one date AFTER its games (AMENDMENT-2.md). Refuses unless the model code is byte-identical
# to the frozen registration (df30f710a2), so a later merge can never silently change the forward model.
#   bash docs/research/mlb/mlb-003-004/forward/materialize.sh 2026-10-10
set -euo pipefail
D="${1:?date YYYY-MM-DD}"
ROOT="$(git rev-parse --show-toplevel)"
FREEZE=df30f710a2
FROZEN=(app/src/lib/mlb/full-game app/src/lib/game-simulations/rng.ts app/src/lib/results/mlb-leans-of-record.mjs docs/research/mlb/mlb-003-004/forward/run-forward-b.mjs docs/research/mlb/mlb-003-004/forward/grade-forward-b.mjs)
cd "$ROOT"
if ! git diff --quiet "$FREEZE" -- "${FROZEN[@]}"; then echo "REFUSED: model code differs from the frozen registration $FREEZE:"; git diff --stat "$FREEZE" -- "${FROZEN[@]}"; exit 2; fi
cd app
node scripts/mlb/capture-mlb-boxscore-outcomes.mjs --from "$(date -u -j -v-1d -f %Y-%m-%d "$D" +%Y-%m-%d 2>/dev/null || date -u -d "$D -1 day" +%Y-%m-%d)" --to "$D" --write
npx tsx ../docs/research/mlb/mlb-003-004/forward/run-forward-b.mjs --date "$D" --write
