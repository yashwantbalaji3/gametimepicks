#!/usr/bin/env bash
# Rerunnable clean export for one batch: refreshes data files from origin/main, then renders banner-free.
#   app/scripts/social/social-batch.sh A [--as-of ISO]     (D and E: GTP_ODDS_DISPLAY_KEY in the environment)
# Only working-tree data changes, nothing is staged or committed, so package snapshotRefs equal origin/main's bytes.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")/../.."
batch="$1"; shift
git fetch -q origin main
git restore --source=FETCH_HEAD --worktree -- public/data ../data/internal/research/nba ../data/odds-display
export GTP_DATA_COMMIT="$(git rev-parse FETCH_HEAD)"
echo "data from origin/main $GTP_DATA_COMMIT"
GTP_CLEAN_EXPORT=1 npx tsx scripts/social/social-batch.mjs --batch "$batch" "$@"
