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
# skipped docs-only build can never make the site read as stale. Non-critical data is batched
# (coalescing gate at the end of this file); critical pre-start forecasts and code still build
# on their own push.
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
#   data/internal/<listed paths>   — the repo-root internal files a PUBLIC route or a build step reads at
#                                    build: /markets (calibrator manifest), /nfl/game + /results/nfl + /my
#                                    (NFL forecast receipts), /today (MLB prediction snapshots), and
#                                    (Session 13) the Forecast Ledger — /results/forecasts/**, /results,
#                                    /models, player Research pages, the search index and the Ask
#                                    projection. Its nightly commit touches ONLY this path; without it the
#                                    public Forecast Record stayed on the previous build's rows.
#                                    2026-10-17 coverage audit added the rest (the "four paths" claim was
#                                    false): /nfl/simulation/[eventId] + /nfl/game (sim-v2 shadow receipts —
#                                    they decide WHICH receipt is the pre-kickoff record), /models + / + /epl
#                                    (Model Lab receipts/reports), /results + /results/date + Ask projection
#                                    (NFL experimental settlement, UFC graded ledger, winner corrections, side
#                                    cutover, parlay reconstruction receipts), /results/model-audit (readout).
# Everything else under data/internal (85k files: pregame archive, linescores, research corpora) is
# read only by pipeline scripts that are not build steps, so it stays skip-able.
# THIS LIST IS NOT TAKEN ON TRUST: build-input-coverage.test.mjs walks the import graph of every non-internal
# route and every `npm run build` step, extracts each data/internal path they name, and FAILS when one is not
# covered below (or when an entry below is no longer read by anything public). Keep the marker lines.
#
# Note on `[skip ci]`: it is a GitHub Actions convention. Nothing in a commit message can SKIP a build —
# THIS diff decides. A bot commit that writes app/public/data is always a build input, by design: those
# files are baked into the HTML at build time. Since 2026-10-26 a span of NON-critical data only is
# batched for up to GTP_COALESCE_SECONDS (see the coalescing gate at the end); the one message token read
# is [deploy], and it can only force a build.
#
# Note on VERCEL_GIT_PREVIOUS_SHA after a FAILED deploy: Vercel sets it to the last SUCCESSFUL
# deployment, so the next push's diff spans the failed commit too and its data is delivered by the
# next build. A failure therefore costs only the wait until the next app/-touching push — or, since
# 2026-10-26, until the deploy-flush workflow notices the undeployed change and pushes a [deploy] commit.
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

# GTP-BUILD-INPUTS-BEGIN
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
    ':(top)data/internal/research/nfl/sim-v2/shadow/'
    ':(top)data/internal/nfl/experimental-settlement/'
    ':(top)data/internal/nfl/winner-corrections/'
    ':(top)data/internal/nfl/side-decision-cutover.json'
    # Gap 5 postgame box score on settled /nfl/game pages, 2026-10-23: the official lines and quarter scores the week
    # reconciliation graded against. Written only in the same settlement commit as app/public/data/nfl/reconciliation,
    # so these entries add no Production build of their own.
    ':(top)data/internal/nfl/official-stats/'
    ':(top)data/internal/nfl/official-periods/'
    ':(top)data/internal/research/ufc/model-vs-market/graded.jsonl'
    ':(top)data/internal/parlays/optimizer-reconstruction/receipts/'
    ':(top)data/internal/model-eval/latest-readout.json'
    ':(top)data/internal/research/epl/forward/receipt.json'
    ':(top)data/internal/research/epl/forward-totals/receipt.json'
    ':(top)data/internal/research/epl/reports/epl-totals-shadow-forward-protocol.json'
    ':(top)data/internal/research/epl/reports/epl-history-replay-evaluation.json'
    ':(top)data/internal/research/epl/reports/epl-elo-poisson-forward-protocol.json'
    ':(top)data/internal/research/epl/reports/epl-totals-replay-evaluation.json'
    ':(top)data/internal/research/nfl/replay/player-props-share-level-forward/receipt.json'
    ':(top)data/internal/research/nfl/reports/player-props-share-level-second-look.json'
    ':(top)data/internal/research/nfl/reports/player-props-share-level-estimate-adoption.json'
    ':(top)data/internal/research/nfl/reports/anytime-td-historical-replay-evaluation.json'
    ':(top)data/internal/research/nfl/reports/win-margin-historical-replay-evaluation.json'
    ':(top)data/internal/research/nfl/reports/matchup-totals-historical-replay-evaluation.json'
    # NBA Simulation Theater possession runs, PR 1167, founder 2026-10-21, release owner decision: read by the public
    # /nba/simulation/<eventId> route and by the /nba lane cards that link to it. Committed ONLY inside the once-per-slate
    # lane publish commit, so this entry adds no Production build beyond the one the lane publish already triggers.
    # Comments inside this array must contain no quote and no closing round bracket: build-input-coverage.test.mjs
    # parses the block with a lazy regex up to the first closing bracket and reads entries between single quotes.
    ':(top)data/internal/research/nba/theater-possession/'
    # Results F05, audit 2026-10-23: the deployment evidence the /results pages read to decide which MLB calls were
    # public at first pitch. A one-off committed classification that no workflow rewrites, so it adds no build.
    ':(top)data/internal/ops/forecast-of-record-shadow/classification.json'
    # NBA Top Boards postgame actuals, overnight sprint 2026-10-23: the public /nba/projections/<date> pages show each
    # player's actual figures from the graders' stored box scores, read at build time by
    # src/lib/sports/nba/projection-board-actuals.ts BOX_DIRS. New box scores land in the daily NBA research commit,
    # in the same automation window as the lane publish; v0.3-candidate directories are never read.
    ':(top)data/internal/research/nba/boxscores/'
    ':(top)data/internal/research/nba/experimental/boxscores/'
)
# GTP-BUILD-INPUTS-END
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
    # ── The one ops/ file a public page reads (COST-001 Stage B, 2026-10-14) ────────────────────
    # ops/ is a NON_BUILD_INPUT because the prune deletes it from the export — but
    # lib/ops/read-publication-slo.ts reads ops/publication-slo.json at BUILD time and Home/MLB render
    # its deadline. Its checkedAt moves on every run, so it stays out of the path rule; when a field a
    # page reads moves, that is a reader-visible change and builds on its own instead of waiting for an
    # unrelated deploy. Any error (no node, unreadable file, missing at either end) BUILDS.
    if ! git diff --quiet "$BASE" HEAD -- ':(top)app/public/data/ops/publication-slo.json'; then
        _top="$(git rev-parse --show-toplevel 2>/dev/null)"
        if ! node "${_top}/app/scripts/ops/publication-slo-public-changed.mjs" "$BASE" HEAD; then
            echo "[ignore-build] the publication-SLO fields public pages read changed (or could not be compared) since $BASE — building"
            exit 1
        fi
    fi
    echo "[ignore-build] no build-input changes (app/ minus ${NON_BUILD_INPUTS[*]}, data/*-projection, read internal paths) since deployed $BASE — skipping build"
    exit 0
fi

# ══ TWO-TIER COALESCING GATE (build-cost reduction, 2026-10-26) ════════════════════════════════════════════════════════
# Reached only when a build input DID change since the deployed $BASE. Measured over the 7 days to 2026-10-26: 720 main
# commits → 337 successful Production builds (~48/day, ~9.4 min each on the 8-vCPU Enhanced machine), 168 canceled and
# 14 killed at the 45-minute limit; ~300 of the 337 were started by automation DATA commits, ~39 by merges. A data-only
# span therefore no longer builds on every push. Tiers 1-3 build at once; only tier 4 can skip, and only for a while:
#
#   1. CODE    — anything under app/ outside app/public/data/ (NON_BUILD_GLOBS still excluded)  → build now
#   2. MARKER  — the HEAD commit message carries the exact token [deploy]                       → build now
#   3. CRITICAL DATA — a path in GTP-CRITICAL-DATA below: official pre-start forecasts and same-day publishes, where a
#                late deploy could leave a pre-start forecast unserved at start                    → build now
#   4. OTHER DATA — coalesce: build only once the OLDEST undeployed build-input commit is GTP_COALESCE_SECONDS old
#                (default 5400 = 90 min); otherwise skip and let a later push, or the 30-minute deploy-flush workflow
#                (.github/workflows/deploy-flush.yml), carry it. The flush pushes an empty [deploy] commit, so the
#                worst case for non-critical data is ~window + 30 min + one build, about 2 h.
#
# The commit message is read for ONE purpose: the [deploy] token, whose only effect is exit 1. Nothing in a message can
# skip a build — `[skip ci]` is still ignored, and a message that cannot be read BUILDS.
#
# Rollback without a code change: set GTP_COALESCE_SECONDS=0 in the Vercel project — 0 means never coalesce, i.e. every
# build-input change builds exactly as before this gate existed.
#
# Fail-safe: every git error, empty output, non-numeric time, malformed window or clock anomaly BUILDS. The flush
# workflow runs THIS script to decide, and reads the GTP_GATE line each decision prints, so the two cannot disagree on
# which paths are code, critical or coalescible.

# Prints the machine-readable decision line deploy-flush reads, then exits: 0 = skip, 1 = build.
_gate() {
    echo "[ignore-build] GTP_GATE verdict=$1 tier=$2 trigger_epoch=${3:-}"
    if [ "$1" = "skip" ]; then exit 0; fi
    exit 1
}

# Commit time of the OLDEST commit in BASE..HEAD that touched the given pathspecs. Empty on any error or no commit.
# The minimum is taken over every line instead of trusting log order, so clock-skewed or rebased commits cannot hide.
_oldest_epoch() {
    local _out _t _min=""
    _out="$(git log --format=%ct "$BASE..HEAD" -- "$@" 2>/dev/null)" || return 0
    for _t in $_out; do
        case "$_t" in ''|*[!0-9]*) echo ""; return 0 ;; esac
        if [ -z "$_min" ] || [ "$_t" -lt "$_min" ]; then _min="$_t"; fi
    done
    echo "$_min"
}

_window="${GTP_COALESCE_SECONDS:-5400}"
case "$_window" in
    ''|*[!0-9]*)
        echo "[ignore-build] GTP_COALESCE_SECONDS=${_window} is not a whole number of seconds — build inputs changed since deployed $BASE — building"
        _gate build window-malformed ;;
esac
if [ "${#_window}" -gt 9 ]; then
    echo "[ignore-build] GTP_COALESCE_SECONDS=${_window} is implausibly large — build inputs changed since deployed $BASE — building"
    _gate build window-malformed
fi
if [ "$_window" -eq 0 ]; then
    echo "[ignore-build] GTP_COALESCE_SECONDS=0 (coalescing off) — build inputs changed since deployed $BASE — building"
    _gate build coalesce-off
fi

# ── Tier 1 · CODE ───────────────────────────────────────────────────────────────────────────────────────────────────
CODE_INPUTS=( ':(top)app/' ':(top,exclude)app/public/data/' )
for _g in "${NON_BUILD_GLOBS[@]}"; do
    CODE_INPUTS+=( ":(top,exclude,glob)${_g}" )
done
git diff --quiet "$BASE" HEAD -- "${CODE_INPUTS[@]}"
_rc=$?
if [ "$_rc" -ne 0 ]; then
    if [ "$_rc" -eq 1 ]; then
        echo "[ignore-build] build inputs changed since deployed $BASE, including code under app/ outside app/public/data — building now"
        _gate build code "$(_oldest_epoch "${CODE_INPUTS[@]}")"
    fi
    echo "[ignore-build] build inputs changed since deployed $BASE; the code-path comparison failed (git exit $_rc) — building"
    _gate build git-error
fi

# ── Tier 2 · explicit [deploy] marker ───────────────────────────────────────────────────────────────────────────────
if ! _msg="$(git log -1 --format=%B HEAD 2>/dev/null)"; then
    echo "[ignore-build] build inputs changed since deployed $BASE; the HEAD commit message could not be read — building"
    _gate build git-error
fi
case "$_msg" in
    *"[deploy]"*)
        echo "[ignore-build] build inputs changed since deployed $BASE and HEAD carries [deploy] — building now"
        _gate build marker "$(git log -1 --format=%ct HEAD 2>/dev/null)" ;;
esac

# ── Tier 3 · CRITICAL data ──────────────────────────────────────────────────────────────────────────────────────────
# Official pre-start forecasts and same-day publishes. A change here builds on its own push. Every entry is also a
# BUILD_INPUT (vercel-ignore-build.behavior.test.mjs checks it) and names its producer. Results, settlement, grading and
# odds captures are deliberately NOT here: they describe games already started, so 90 minutes of batching costs nothing
# a reader can act on. Keep the marker lines; the tests and the deploy-flush workflow parse this block. Comments inside
# the array must contain no quote and no closing round bracket.
# GTP-CRITICAL-DATA-BEGIN
CRITICAL_DATA_INPUTS=(
    # NBA public lane file, the official composition - app/scripts/nba/publish-nba-experimental-lane.mjs, nba-forecast-window.yml
    ':(top)app/public/data/nba/experimental-public/'
    # NBA Simulation Theater runs, same once-per-slate lane commit - app/scripts/nba/research/build-theater-possession-runs.mjs
    ':(top)data/internal/research/nba/theater-possession/'
    # NFL public pre-kickoff forecasts - app/scripts/nfl/build-nfl-public-forecasts.mjs, nfl-event-window.yml
    ':(top)app/public/data/nfl/forecasts/'
    # NFL immutable pre-kickoff forecast receipts, same writer and commit - build-nfl-public-forecasts.mjs
    ':(top)data/internal/nfl/forecast-receipts/'
    # MLB pre-first-pitch prediction snapshots - app/scripts/generate-mlb-predictions.mjs, mlb-daily-production + mlb-lineup-refresh
    ':(top)data/internal/mlb/prediction-snapshots/'
    # MLB public game predictions, same writer and commit as the snapshots - generate-mlb-predictions.mjs
    ':(top)app/public/data/mlb/predictions/'
    # EPL public match forecasts - app/scripts/epl/build-epl-forecasts.mjs, epl-matchweek.yml
    ':(top)app/public/data/soccer/epl/forecasts/'
    # EPL public player projections, pre-match - app/scripts/epl/build-epl-player-projections.mjs, epl-matchweek.yml
    ':(top)app/public/data/soccer/epl/player-projections/'
    # Ligue 1 public match forecasts - app/scripts/soccer/build-league-forecasts.mjs, soccer-leagues.yml
    ':(top)app/public/data/soccer/ligue-1/forecasts/'
    # UFC public card with each bout model prediction, the only UFC forecast a public page reads - app/scripts/ufc/build-ufc-card.mjs, ufc-fight-week.yml
    ':(top)app/public/data/ufc/card-latest.json'
)
# GTP-CRITICAL-DATA-END
git diff --quiet "$BASE" HEAD -- "${CRITICAL_DATA_INPUTS[@]}"
_rc=$?
if [ "$_rc" -ne 0 ]; then
    if [ "$_rc" -eq 1 ]; then
        echo "[ignore-build] build inputs changed since deployed $BASE, including a critical pre-start forecast path — building now"
        _gate build critical "$(_oldest_epoch "${CRITICAL_DATA_INPUTS[@]}")"
    fi
    echo "[ignore-build] build inputs changed since deployed $BASE; the critical-path comparison failed (git exit $_rc) — building"
    _gate build git-error
fi

# ── Tier 4 · non-critical data: coalesce ────────────────────────────────────────────────────────────────────────────
# "now" is the builder's clock, not HEAD's commit time: HEAD can be old (a push batch, a merge of an old branch), and
# the question is how long the oldest change has been waiting. GTP_NOW_EPOCH exists for tests.
_oldest="$(_oldest_epoch "${BUILD_INPUTS[@]}")"
_now="${GTP_NOW_EPOCH:-$(date +%s 2>/dev/null)}"
case "$_oldest" in
    ''|*[!0-9]*)
        echo "[ignore-build] build inputs changed since deployed $BASE but the oldest such commit time could not be read — building"
        _gate build git-error ;;
esac
case "$_now" in
    ''|*[!0-9]*)
        echo "[ignore-build] build inputs changed since deployed $BASE but the current time could not be read — building"
        _gate build clock-error "$_oldest" ;;
esac
_age=$(( _now - _oldest ))
if [ "$_age" -lt 0 ]; then
    echo "[ignore-build] build inputs changed since deployed $BASE; the oldest such commit is dated ${_age#-}s in the future (clock skew) — building"
    _gate build clock-error "$_oldest"
fi
if [ "$_age" -ge "$_window" ]; then
    echo "[ignore-build] build inputs changed since deployed $BASE (data only); the oldest undeployed change is ${_age}s old, at or past the ${_window}s coalescing window — building"
    _gate build coalesce-expired "$_oldest"
fi
echo "[ignore-build] coalescing: only non-critical data changed since deployed $BASE; the oldest undeployed change is ${_age}s old, inside the ${_window}s window — skipping build (a later push or the deploy-flush backstop will carry it)"
_gate skip coalesce-wait "$_oldest"
