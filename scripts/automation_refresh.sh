#!/usr/bin/env bash
# ============================================================================
# scripts/automation_refresh.sh — Phase 10 safe daily refresh.
#
# This is the script the GitHub Actions workflow calls. It also runs
# locally with the same behavior, so you can dry-run the automation
# end-to-end on your Mac before scheduling it.
#
# What it does (in order):
#   1. Hydrate recent10 sparkline data via free nba_api
#   2. Re-export any newly-settled results
#   3. Run all 7 Python test suites
#   4. Run frontend typecheck + build (skip if SKIP_BUILD=1)
#   5. Print a clear summary of estimated/actual Odds API credit usage
#      (always 0 — this script never calls The Odds API)
#
# What it does NOT do:
#   - Call The Odds API (ODDS_DRY_RUN is honored as a defensive layer)
#   - Regenerate the daily board (would burn Odds API credits)
#   - Run settlement (requires manual stat input)
#   - Mutate any code, only public-data + validation files
#   - Commit or push (the workflow handles git ops; locally you commit yourself)
#
# Exit codes:
#   0 = everything ran clean
#   1 = some required dependency or setup is missing
#   2 = a step failed (test, typecheck, or build)
# ============================================================================

set -e

GREEN="\033[0;32m"; RED="\033[0;31m"; YELLOW="\033[0;33m"
BLUE="\033[0;34m"; DIM="\033[2m"; GOLD="\033[0;33m"; RESET="\033[0m"

ok()    { echo -e "  ${GREEN}✓${RESET} $1"; }
err()   { echo -e "  ${RED}✗${RESET} $1" >&2; }
warn()  { echo -e "  ${YELLOW}!${RESET} $1"; }
info()  { echo -e "  ${BLUE}·${RESET} $1"; }
step()  { echo ""; echo -e "${BLUE}═══ $1 ═══${RESET}"; }

[ -d ".git" ] || { err "must run from repo root"; exit 1; }

START_TIME=$(date +%s)

PIPELINE_VENV="pipeline/.venv"
[ -d "$PIPELINE_VENV" ] && PY="$PIPELINE_VENV/bin/python" || PY="python3"

# Defensive: even though we don't call The Odds API, force the dry-run
# flag in case any imported module checks it.
export ODDS_DRY_RUN="${ODDS_DRY_RUN:-1}"

step "0/6  Pre-flight"
ok "ODDS_DRY_RUN=$ODDS_DRY_RUN (defensive — script does not call Odds API)"
ok "python: $($PY --version 2>&1)"
[ -d app/node_modules ] && ok "node_modules present" || warn "node_modules missing (run cd app && npm install)"
ok "boards directory: $(ls app/public/data/boards/ 2>/dev/null | wc -l | tr -d ' ') file(s)"

# ---------------------------------------------------------------------------
# 1 — Hydrate recent10 trend data (free nba_api)
# ---------------------------------------------------------------------------
step "1/6  Hydrate recent10 trend data (free nba_api)"
info "Calling python -m pipeline.attach_recent10 --all --verbose"
if $PY -m pipeline.attach_recent10 --all --verbose 2>&1 | tee /tmp/gtp_recent10.log; then
    ok "recent10 attachment completed"
else
    err "recent10 attachment FAILED — see /tmp/gtp_recent10.log"
    exit 2
fi

# Show what changed (informational; no commit here)
if git diff --quiet -- app/public/data/boards/ 2>/dev/null; then
    info "no board JSON changes (recent10 already up-to-date)"
else
    info "board JSON changes detected:"
    git diff --stat -- app/public/data/boards/ 2>/dev/null | sed 's|^|    |'
fi

# ---------------------------------------------------------------------------
# 2 — Export newly-settled results (no network)
# ---------------------------------------------------------------------------
step "2/6  Export settled results (pure transform, no network)"
# export_results is idempotent and safe to run even when nothing has been
# settled — it writes empty manifests that the empty-state UI handles.
if $PY -m pipeline.export_results 2>&1 | tee /tmp/gtp_export.log; then
    ok "export_results completed"
else
    # Don't fail the whole run just because there's nothing to export yet.
    # The exit code from export_results is the source of truth, but log
    # the soft-fail clearly.
    warn "export_results returned non-zero (likely no settled data — expected)"
fi

# ---------------------------------------------------------------------------
# 3 — Python test suites (regression check)
# ---------------------------------------------------------------------------
step "3/6  Python test suites (regression check)"
TESTS=(
    filter_test
    settle_test
    grouping_test
    recent10_test
    export_results_test
    confidence_guardrails_test
    inspect_trends_test
    grouping_collision_test
    parlay_lab_test
    freshness_test
    active_slate_test
    parlay_builder_test
    core_players_test
)
TOTAL_PASSED=0
for t in "${TESTS[@]}"; do
    if [ ! -f "pipeline/${t}.py" ]; then
        warn "pipeline.${t}: not present (skip)"
        continue
    fi
    if $PY -m pipeline.$t > /tmp/gtp_test_$t.log 2>&1; then
        last=$(sed -E 's/\x1b\[[0-9;]*m//g' /tmp/gtp_test_$t.log \
               | grep -oE "all [0-9]+ ?[a-zA-Z0-9]* ?assertions passed" | tail -1)
        if [ -n "$last" ]; then
            n=$(echo "$last" | grep -oE "[0-9]+" | head -1)
            TOTAL_PASSED=$((TOTAL_PASSED + n))
            ok "pipeline.${t}: $last"
        else
            ok "pipeline.${t}: passed"
        fi
    else
        cat /tmp/gtp_test_$t.log
        err "pipeline.${t} FAILED"
        exit 2
    fi
done

# diagnostics_test optional
if [ -f "pipeline/diagnostics_test.py" ]; then
    if $PY -m pipeline.diagnostics_test > /tmp/gtp_test_diag.log 2>&1; then
        last=$(sed -E 's/\x1b\[[0-9;]*m//g' /tmp/gtp_test_diag.log \
               | grep -oE "all [0-9]+ [a-zA-Z0-9]* assertions passed" | tail -1)
        n=$(echo "$last" | grep -oE "[0-9]+" | head -1)
        [ -n "$n" ] && TOTAL_PASSED=$((TOTAL_PASSED + n))
        ok "pipeline.diagnostics_test: ${last:-passed}"
    else
        warn "diagnostics_test had issues (non-blocking)"
    fi
fi

ok "${TOTAL_PASSED} total assertions passed"

# ---------------------------------------------------------------------------
# 4 — Frontend typecheck + build
# ---------------------------------------------------------------------------
step "4/6  Frontend typecheck + build"
cd app
[ -d node_modules ] || { info "running npm install"; npm install --silent; }

if npm run typecheck > /tmp/gtp_typecheck.log 2>&1; then
    ok "typecheck passed"
else
    cat /tmp/gtp_typecheck.log
    err "typecheck FAILED"
    cd ..
    exit 2
fi

if [ "${SKIP_BUILD:-0}" = "1" ]; then
    warn "SKIP_BUILD=1 — skipping npm run build"
else
    if npm run build > /tmp/gtp_build.log 2>&1; then
        ok "build passed"
    else
        tail -50 /tmp/gtp_build.log
        err "build FAILED"
        cd ..
        exit 2
    fi
fi
cd ..

# ---------------------------------------------------------------------------
# 5 — Coverage diagnostic (Phase 11)
# ---------------------------------------------------------------------------
step "5/6  recent10 coverage diagnostic"
if [ -f "pipeline/inspect_trends.py" ]; then
    # Don't fail the run on low coverage — just report it loudly so the
    # workflow log makes the state obvious.
    $PY -m pipeline.inspect_trends 2>&1 | tee /tmp/gtp_coverage.log | tail -15
else
    warn "pipeline.inspect_trends not present (skip coverage report)"
fi

# ---------------------------------------------------------------------------
# 6 — Summary
# ---------------------------------------------------------------------------
step "6/6  Summary"
ELAPSED=$(($(date +%s) - START_TIME))

echo -e "  ${GOLD}Phase 10 daily refresh — summary${RESET}"
echo "    elapsed:                ${ELAPSED}s"
echo "    Python tests:            ${TOTAL_PASSED} assertions passed"
echo "    Odds API credits used:   0 (script does not call The Odds API)"
echo "    Build:                   $([ "${SKIP_BUILD:-0}" = "1" ] && echo "SKIPPED" || echo "passed")"
echo ""

# Show what files would be committed (informational)
CHANGED=$(git status --porcelain 2>/dev/null \
          | awk '{print $2}' \
          | grep -E '^app/public/data/(boards/|results/|meta\.json)|^pipeline/validation/' \
          || true)

if [ -z "$CHANGED" ]; then
    ok "no public-data changes — site is already up-to-date"
else
    info "public-data files changed (will be committed by the workflow):"
    echo "$CHANGED" | sed 's|^|    |'
fi

echo ""
echo -e "  ${GREEN}═══ refresh complete ═══${RESET}"
echo ""
