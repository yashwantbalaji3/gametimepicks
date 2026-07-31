#!/usr/bin/env bash
# Vercel Ignored Build Step (wired via app/vercel.json `ignoreCommand`).
#
# Exit 0  = SKIP the build (nothing the deployed site is built from changed)
# Exit 1  = BUILD
#
# Why: production builds every push to main — measured 2026-07-31 when a commit touching only
# repo-root scripts/ and .github/ was built and deployed 24s after push. At ~20 pushes/day
# (bot slate/settle commits + docs) that is ~600 full builds/month of a ~424 MB checkout,
# most of which change nothing under app/.
#
# Safety properties (fail toward BUILDING, never toward silently not deploying):
#   - Compares against VERCEL_GIT_PREVIOUS_SHA (the last successfully deployed commit) when
#     available, so a push batch whose head is a docs commit cannot strand an earlier app/
#     change — the diff spans everything since the last deploy, not just HEAD^..HEAD.
#   - If the previous SHA is unknown or unreachable (first deploy, shallow clone gap, force
#     push), we BUILD.
#   - Any unexpected error → BUILD.
#
# The deployment observer judges currency by buildEtDate (date-based), and bot data commits
# always touch app/public/data — so at least one real build happens every slate day and a
# skipped docs-only build can never make the site read as stale.
set -u

BASE="${VERCEL_GIT_PREVIOUS_SHA:-}"

if [ -z "$BASE" ]; then
    echo "[ignore-build] no previous deployed SHA — building"
    exit 1
fi

if ! git cat-file -e "$BASE" 2>/dev/null; then
    echo "[ignore-build] previous deployed SHA $BASE not in clone (shallow gap / force push) — building"
    exit 1
fi

# The deployed output is produced exclusively from app/ (next build in this directory).
# ':(top)' anchors the pathspec at the repo root regardless of the cwd Vercel runs us in.
if git diff --quiet "$BASE" HEAD -- ':(top)app/'; then
    echo "[ignore-build] no app/ changes since deployed $BASE — skipping build"
    exit 0
fi

echo "[ignore-build] app/ changed since deployed $BASE — building"
exit 1
