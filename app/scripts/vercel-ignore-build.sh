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

# ── Duplicate-project guard (Vercel duplicate investigation, 2026-07-31) ─────────────────────
# Two Vercel projects deploy this repo. PROVEN canonical: `gametime-picks` (dash) — it serves
# gametimepicks.yashwantbalaji.com and gametime-picks.vercel.app (byte-identical builtAt
# fingerprint). The no-dash `gametimepicks` project serves NO public surface (its alias 404s,
# its deployment URLs are SSO-protected) yet has built every push since 2026-05-04 (~1,370
# production builds) and caused the June free-tier rate-limit that blocked PR #261.
# See docs/VERCEL_CANONICAL_PROJECT.md and docs/VERCEL_DUPLICATE_CONSOLIDATION_PLAN.md.
#
# This guard skips builds ONLY when Vercel identifies the running project as the known
# duplicate slug. It fails OPEN (build) when the variable is absent or unrecognized, so the
# canonical project — or any renamed future project — can never be silently frozen by it.
# Reversal: delete this block (or disconnect the duplicate in the dashboard, the real fix).
DUP_HOST="${VERCEL_PROJECT_PRODUCTION_URL:-}"
case "$DUP_HOST" in
    gametimepicks.vercel.app|gametimepicks-*.vercel.app)
        echo "[ignore-build] this is the duplicate 'gametimepicks' project (serves no public surface) — skipping build; canonical is 'gametime-picks'"
        exit 0
        ;;
esac

# ── Force hatch (2026-09-16) ────────────────────────────────────────────────────────────────
# ⚠ A BUILD-SKIP MAKES AN ENVIRONMENT-VARIABLE CHANGE UNDELIVERABLE.
# Vercel binds env vars to a deployment when it is BUILT. A dashboard "Redeploy" of the same commit
# reaches this script, finds no app/ diff, and skips — so the redeploy succeeds, changes nothing, and
# the new variable never takes effect. Observed during the v1.1 Stage 2 Live activation: both
# LIVE_GATEWAY_ENABLED and NEXT_PUBLIC_LIVE_ENABLED were set, production was redeployed, and
# build-info.json came back byte-identical (builtAt 2026-09-16T04:18:30Z) because no build ran.
#
# This hatch makes that recoverable WITHOUT inventing a commit whose only purpose is to touch app/.
# It can only ever cause MORE building, never less, which is the safety direction this whole script
# is written in. Set VERCEL_FORCE_BUILD=1, redeploy, then unset it.
if [ "${VERCEL_FORCE_BUILD:-}" = "1" ]; then
    echo "[ignore-build] VERCEL_FORCE_BUILD=1 — building regardless of the diff"
    exit 1
fi

BASE="${VERCEL_GIT_PREVIOUS_SHA:-}"

if [ -z "$BASE" ]; then
    echo "[ignore-build] no previous deployed SHA — building"
    exit 1
fi

if ! git cat-file -e "$BASE" 2>/dev/null; then
    echo "[ignore-build] previous deployed SHA $BASE not in clone (shallow gap / force push) — building"
    exit 1
fi

# ── What is deploy-worthy (docs/V17_DEPLOY_TRIGGER_AUDIT.md, 2026-09-22) ──────────────────────
# The deployed output is produced by `npm run build` in app/, which reads:
#   app/                           — code, config, and app/public/data (337 build-time fs readers +
#                                    the raw /data/ URLs the prune keep-set retains)
#   data/*-projection/             — repo-root projections the emit steps and the research/compare/
#                                    lab/ask pages + the search index read at build (v1.3–v1.6)
#   data/internal/<four paths>     — the only repo-root internal files a PUBLIC route reads at build:
#                                    /markets (calibrator manifest), /nfl/game + /results/nfl + /my
#                                    (NFL forecast receipts), /today (MLB prediction snapshots), and
#                                    (Session 13) the Forecast Ledger — /results/forecasts/**, /results,
#                                    /models, player Research pages, the search index and the Ask
#                                    projection. Its nightly commit touches ONLY this path; without it the
#                                    public Forecast Record stayed on the previous build's rows.
# Everything else under data/internal (85k files: pregame archive, linescores, research corpora) is
# read only by pipeline scripts that are not build steps, so it stays skip-able.
#
# Note on `[skip ci]`: it is a GitHub Actions convention. Vercel never reads the commit message —
# THIS diff is the only thing that decides. A bot commit that writes app/public/data always builds,
# by design: those files are baked into the HTML at build time, so a skip would serve stale pages.
#
# Note on VERCEL_GIT_PREVIOUS_SHA after a FAILED deploy: Vercel sets it to the last SUCCESSFUL
# deployment, so the next push's diff spans the failed commit too and its data is delivered by the
# next build. A failure therefore costs only the wait until the next app/-touching push.
#
# ':(top)' anchors each pathspec at the repo root regardless of the cwd Vercel runs us in.
#
# ── WHAT INSIDE app/ IS NOT A BUILD INPUT (P0 · 2026-09-24) ──────────────────────────────────
# `:(top)app/` above is deliberately coarse, but it is not free: on 2026-09-24 commit 8cccf8a9
# ("auto-refresh: zero Odds API credits") changed THREE files, all under app/public/data/ops/,
# and triggered a full production build that wedged for 46 minutes and burned 180 CPU-minutes to
# publish a byte-identical public site. 13 of the last 155 main commits (8.4%) were of exactly
# that shape.
#
# `prune-internal-routes.mjs` DELETES these trees from the export — out/data/ops does not exist in
# a built site, and neither does the /ops route. A commit confined to one of them therefore cannot
# change a single byte the public site serves, so building for it is pure waste.
#
# THIS LIST IS NOT TAKEN ON TRUST. `internal-route-exclusion.test.mjs` runs in the post-build phase
# and asserts, for every prefix named here, that (a) the source tree is non-empty — so the rule can
# never be vacuous — and (b) the corresponding out/ tree is absent from a REAL build. The day
# anything here starts shipping, the guard goes red and this exclusion must be revisited. Keep the
# marker line below: the test parses this array out of this file.
#
# Direction of safety: an entry here can only ever cause LESS building. Every path not listed still
# builds, and a malformed array makes `git diff` see the whole of app/ and build.
# admin/status.json (COST-001 Stage B, 2026-10-14): rewritten by every mlb-daily-production run (run
# stamps, workflow health) and read ONLY by the pruned /ops and /launch routes — guarded by
# internal-route-exclusion.test.mjs ("NON_BUILD_INPUT files are read only by internal routes"). The rest
# of admin/ stays a build input: model-health.json is read by public pages.
# GTP-NON-BUILD-INPUTS-BEGIN
NON_BUILD_INPUTS=(
    'app/public/data/ops/'
    'app/public/data/admin/status.json'
)
# GTP-NON-BUILD-INPUTS-END

BUILD_INPUTS=(
    ':(top)app/'
    ':(top)data/research-projection/'
    ':(top)data/compare-projection/'
    ':(top)data/lab-projection/'
    ':(top)data/ask-projection/'
    ':(top)data/internal/mlb/model-learning/calibrator-manifest.json'
    ':(top)data/internal/nfl/forecast-receipts/'
    ':(top)data/internal/mlb/prediction-snapshots/'
    ':(top)data/internal/forecast-ledger/'
)
for _nbi in "${NON_BUILD_INPUTS[@]}"; do
    BUILD_INPUTS+=( ":(top,exclude)${_nbi}" )
done

# ── FILES NO BUILD STEP READS (Vercel wedge investigation, 2026-10-15) ───────────────────────────
# A merge that changes only tests, end-to-end specs or CI tooling cannot change one byte the site serves,
# yet `:(top)app/` made each one a full Production build. #1089 (workflows + a CI script + a test) built
# for 46 minutes and was killed; over 14 days 13 of 183 code-merge builds were of exactly this shape.
# The build reads `npm run build`'s steps and everything they import (969 files on 2026-10-15). None of these
# globs is in that closure. That is NOT taken on trust: build-trigger-non-inputs.test.mjs recomputes the closure
# from the build script and the route tree, and fails if any file matching a glob below is ever read by it.
# Type errors in tests/specs are still caught where they always were: the PR quality gate runs a full build.
# Direction of safety: an entry here can only cause LESS building; a malformed array builds everything.
# GTP-NON-BUILD-GLOBS-BEGIN
NON_BUILD_GLOBS=(
    'app/**/*.test.mjs'
    'app/e2e/**'
    'app/scripts/ci/**'
)
# GTP-NON-BUILD-GLOBS-END
for _g in "${NON_BUILD_GLOBS[@]}"; do
    BUILD_INPUTS+=( ":(top,exclude,glob)${_g}" )
done

if git diff --quiet "$BASE" HEAD -- "${BUILD_INPUTS[@]}"; then
    echo "[ignore-build] no build-input changes (app/ minus ${NON_BUILD_INPUTS[*]}, data/*-projection, read internal paths) since deployed $BASE — skipping build"
    exit 0
fi

echo "[ignore-build] build inputs changed since deployed $BASE — building"
exit 1
