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
    parlay_builder_test
    core_players_test
    playerid_coverage_test
    auto_settlement_test
    simulation_test
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

# ── Python — pipeline/mlb suites ────────────────────────────────────────────
# These were NEVER wired into any runner or workflow: the loop above only reaches
# `pipeline.<name>_test`, so every `pipeline/mlb/*_test.py` — settlement grading, board identity,
# settlement lineage, capture provenance — sat on disk and never ran in CI. Regressions written
# against them (e.g. the July-30 void-denominator fix) were only ever exercised by hand.
step "Python — pipeline/mlb test suites"
MLB_TESTS=(
    settle_mlb_results_test
    generate_mlb_board_identity_test
    settlement_lineage_test
    export_mlb_results_test
    mlb_model_test
    capture_provenance_test
    event_scope_equivalence_test
    pre_event_boundary_test
    test_runner_coverage_test
)
MLB_FAILED=0
for t in "${MLB_TESTS[@]}"; do
    if [ ! -f "pipeline/mlb/${t}.py" ]; then
        echo -e "  ${YELLOW}–${RESET} pipeline.mlb.${t}: not present (skip)"
        continue
    fi
    if $PY -m pipeline.mlb.$t > /tmp/gtp_mlbtest_$t.log 2>&1; then
        ok "pipeline.mlb.${t}"
    else
        err "pipeline.mlb.${t} FAILED — see /tmp/gtp_mlbtest_$t.log"
        tail -12 /tmp/gtp_mlbtest_$t.log | sed 's/^/      /'
        MLB_FAILED=$((MLB_FAILED + 1))
    fi
done
[ "$MLB_FAILED" -eq 0 ] || exit 1

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

    # Accessibility. The product-quality launch gate was PARTIAL on exactly this: an audit existed
    # nowhere and the e2e specs were wired into no runner. A measurement taken once is a snapshot,
    # not a gate — the skipped heading level, the invisible focus ring on the whole desktop nav, and
    # four sub-AA colour tokens were all introduced by ordinary changes that no check would catch.
    step "Frontend — accessibility (structural)"
    node scripts/audit-accessibility.mjs > /tmp/gtp_a11y.log 2>&1 \
        && ok "structural a11y (9 routes)" \
        || { cat /tmp/gtp_a11y.log; err "structural a11y FAILED"; cd ..; exit 1; }

    # Contrast/keyboard/reflow need a real engine. Skipped with a LOUD notice when browsers are
    # absent rather than silently passing — an absent browser must never read as a green gate.
    step "Frontend — accessibility (browser: contrast · keyboard · reflow)"
    if npx playwright install --dry-run chromium > /dev/null 2>&1 && [ -d "$HOME/Library/Caches/ms-playwright" -o -d "$HOME/.cache/ms-playwright" ]; then
        npx playwright test e2e/accessibility.spec.ts > /tmp/gtp_a11y_browser.log 2>&1 \
            && ok "browser a11y ($(grep -oE '[0-9]+ passed' /tmp/gtp_a11y_browser.log | tail -1))" \
            || { tail -30 /tmp/gtp_a11y_browser.log; err "browser a11y FAILED"; cd ..; exit 1; }
    else
        echo -e "  ${YELLOW}!${RESET} playwright browsers not installed — browser a11y NOT RUN (run: cd app && npm run e2e:install)"
    fi
fi
cd ..

step "Bash — orchestrator pipefail guards"
# These prove the automation scripts cannot report a crashed step as success. They existed but were
# wired into nothing, so when automation_projections.sh reacquired the exact defect Sprint 049 had
# already fixed in automation_settle.sh, no runner noticed for two days. A drift guard that never
# runs is not a guard.
for t in scripts/automation_settle_pipefail_test.sh scripts/automation_projections_pipefail_test.sh scripts/ops_alert_test.sh scripts/cron_watchdog_test.sh; do
    if [ -f "$t" ]; then
        bash "$t" > /tmp/gtp_pipefail.log 2>&1 \
            && ok "$(basename "$t")" \
            || { cat /tmp/gtp_pipefail.log; err "$(basename "$t") FAILED"; exit 1; }
    fi
done

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
