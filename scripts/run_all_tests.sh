#!/usr/bin/env bash
# ============================================================================
# scripts/run_all_tests.sh — Phase 8.5 master test runner.
#
# Runs every Python test suite, then frontend typecheck + build, then the
# bash smoke test. Bail on first failure for fast feedback.
#
# Usage:
#   bash scripts/run_all_tests.sh
#   bash scripts/run_all_tests.sh --no-build      (skip npm build for speed)
#   bash scripts/run_all_tests.sh --python-only   (skip frontend entirely)
#
# Exit code 0 = everything passed. Non-zero = first failure.
#
# Zero network. Zero API credits. Read-only.
# ============================================================================

set -e

GREEN="\033[0;32m"; RED="\033[0;31m"; YELLOW="\033[0;33m"
BLUE="\033[0;34m"; DIM="\033[2m"; GOLD="\033[0;33m"; RESET="\033[0m"

ok() { echo -e "  ${GREEN}✓${RESET} $1"; }
err() { echo -e "  ${RED}✗${RESET} $1" >&2; }
step() { echo ""; echo -e "${BLUE}═══ $1 ═══${RESET}"; }

NO_BUILD=0
PYTHON_ONLY=0
for arg in "$@"; do
    case "$arg" in
        --no-build)    NO_BUILD=1 ;;
        --python-only) PYTHON_ONLY=1 ;;
        -h|--help)
            sed -n '2,18p' "$0"
            exit 0
            ;;
    esac
done

if [ ! -d ".git" ]; then
    err "must be run from repo root"
    exit 1
fi

PIPELINE_VENV="pipeline/.venv"
[ -d "$PIPELINE_VENV" ] && PY="$PIPELINE_VENV/bin/python" || PY="python3"

START_TIME=$(date +%s)

step "Python — pipeline test suites"
TESTS=(
    filter_test
    settle_test
    grouping_test
    diagnostics_test
    recent10_test
    export_results_test
    confidence_guardrails_test
    inspect_trends_test
    grouping_collision_test
    parlay_lab_test
    freshness_test
    active_slate_test
)
TOTAL_PASSED=0
RAN=0
SKIPPED=0
for t in "${TESTS[@]}"; do
    if [ ! -f "pipeline/${t}.py" ]; then
        echo -e "  ${YELLOW}–${RESET} pipeline.${t}: not present (skip)"
        SKIPPED=$((SKIPPED + 1))
        continue
    fi
    if $PY -m pipeline.$t > /tmp/gtp_test_$t.log 2>&1; then
        # Strip ANSI before grepping; descriptor may contain digits (e.g. "recent10")
        last=$(sed -E 's/\x1b\[[0-9;]*m//g' /tmp/gtp_test_$t.log \
               | grep -oE "all [0-9]+ [a-zA-Z0-9]*[a-zA-Z][a-zA-Z0-9]* ?assertions passed" \
               | tail -1)
        if [ -z "$last" ]; then
            last=$(sed -E 's/\x1b\[[0-9;]*m//g' /tmp/gtp_test_$t.log \
                   | grep -oE "all [0-9]+ assertions passed" | tail -1)
        fi
        if [ -n "$last" ]; then
            n=$(echo "$last" | grep -oE "[0-9]+" | head -1)
            TOTAL_PASSED=$((TOTAL_PASSED + n))
            ok "pipeline.${t}: $last"
        else
            ok "pipeline.${t}: passed"
        fi
        RAN=$((RAN + 1))
    else
        cat /tmp/gtp_test_$t.log
        err "pipeline.${t} FAILED"
        exit 1
    fi
done
echo ""
echo -e "  ${DIM}${RAN} suites ran, ${SKIPPED} skipped, ${TOTAL_PASSED} total assertions passed${RESET}"

if [ "$PYTHON_ONLY" = "1" ]; then
    step "Done (--python-only)"
    exit 0
fi

step "Frontend — typecheck"
cd app
[ -d node_modules ] || (echo "  installing node_modules..." && npm install --silent)
npm run typecheck && ok "typecheck" || { err "typecheck FAILED"; cd ..; exit 1; }

if [ "$NO_BUILD" = "0" ]; then
    step "Frontend — build"
    npm run build > /tmp/gtp_build.log 2>&1 \
        && ok "build" \
        || { tail -40 /tmp/gtp_build.log; err "build FAILED"; cd ..; exit 1; }
fi
cd ..

step "Bash — smoke test"
if [ -f "scripts/smoke_test.sh" ]; then
    bash scripts/smoke_test.sh > /tmp/gtp_smoke.log 2>&1 \
        && ok "smoke" \
        || { cat /tmp/gtp_smoke.log; err "smoke FAILED"; exit 1; }
else
    echo -e "  ${YELLOW}–${RESET} scripts/smoke_test.sh not present (skip)"
fi

ELAPSED=$(($(date +%s) - START_TIME))
echo ""
echo -e "${GREEN}═══ all green in ${ELAPSED}s ═══${RESET}"
echo ""
