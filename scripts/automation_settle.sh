#!/usr/bin/env bash
# =============================================================================
# scripts/automation_settle.sh
#
# Nightly settlement orchestrator. Designed to run after 2:00 AM Eastern
# so the previous slate's late West-Coast games have finalized.
#
# What it does (in order):
#   1. Resolve yesterday's date in America/New_York
#   2. Run NBA settlement for that date (uses ESPN summary + nba_api;
#      no Odds API; in-progress games refused at source layer)
#   3. Run MLB settlement for that date (MLB Stats API; same rule)
#   4. Export both sport audits to app/public/data/{results,mlb/results}
#   5. Rebuild the model_audit.json artifact that powers /results and
#      /results/model-audit (free; pure aggregation over settled JSONLs)
#   6. Print a clear summary log
#
# Hard rules honored:
#   - No paid API calls — settlement uses free public APIs only.
#   - Pending / In-Progress games are refused at the pipeline source,
#     so they never count as losses.
#   - Pushes excluded from the hit-rate denominator.
#   - Re-runs are idempotent: settlement rewrites the date's rows in
#     settled_leans.jsonl; lifetime aggregates regenerate from disk.
#
# Inputs (env):
#   SETTLE_DATE      override the target date (YYYY-MM-DD).
#                    Default: yesterday in America/New_York.
#   SKIP_NBA         set to "1" to skip NBA settlement.
#   SKIP_MLB         set to "1" to skip MLB settlement.
#   DRY_RUN_SETTLE   set to "1" to print the plan without running.
#
# Exit codes:
#   0  every requested step succeeded (or was honestly skipped)
#   1  setup / dependency error
#   2  a step failed (settlement or export)
# =============================================================================

set -e

GREEN="\033[0;32m"; RED="\033[0;31m"; YELLOW="\033[0;33m"
BLUE="\033[0;34m"; DIM="\033[2m"; RESET="\033[0m"

ok()    { echo -e "  ${GREEN}✓${RESET} $1"; }
err()   { echo -e "  ${RED}✗${RESET} $1" >&2; }
warn()  { echo -e "  ${YELLOW}!${RESET} $1"; }
info()  { echo -e "  ${BLUE}·${RESET} $1"; }
step()  { echo ""; echo -e "${BLUE}═══ $1 ═══${RESET}"; }

[ -d ".git" ] || { err "must run from repo root"; exit 1; }

# Prefer the project venv. Tests + CI rely on the same path.
PIPELINE_VENV="pipeline/.venv"
[ -d "$PIPELINE_VENV" ] && PY="$PIPELINE_VENV/bin/python" || PY="python3"

# Resolve "yesterday" in America/New_York. GNU date supports -d; BSD date
# supports -v; we try both so the script works on Linux runners and Macs.
if [ -n "$SETTLE_DATE" ]; then
    TARGET_DATE="$SETTLE_DATE"
else
    if TARGET_DATE=$(TZ=America/New_York date -d 'yesterday' '+%Y-%m-%d' 2>/dev/null); then
        :
    else
        TARGET_DATE=$(TZ=America/New_York date -v-1d '+%Y-%m-%d')
    fi
fi

START_TIME=$(date +%s)

step "0/3  Pre-flight"
info "target date: $TARGET_DATE (yesterday in America/New_York)"
ok "python:       $($PY --version 2>&1)"
ok "SKIP_NBA=${SKIP_NBA:-0} · SKIP_MLB=${SKIP_MLB:-0} · DRY_RUN_SETTLE=${DRY_RUN_SETTLE:-0}"

if [ "$DRY_RUN_SETTLE" = "1" ]; then
    warn "DRY_RUN_SETTLE=1 — printing plan only, no settlement run"
    info "would run: $PY -m pipeline.settle_results --date $TARGET_DATE"
    info "would run: $PY -m pipeline.mlb.settle_mlb_results --date $TARGET_DATE"
    info "would run: $PY -m pipeline.export_results"
    info "would run: $PY -m pipeline.mlb.export_mlb_results"
    info "would run: $PY -m pipeline.model_audit"
    info "would run: $PY -m pipeline.grade_parlays --date $TARGET_DATE"
    info "would run: $PY -m pipeline.grade_curated --date $TARGET_DATE"
    info "would run: $PY -m pipeline.grade_optimizer --all"
    info "would run: $PY -m pipeline.audit_daily --date $TARGET_DATE"
    info "would run: $PY -m pipeline.audit_signal_policy"
    exit 0
fi

NBA_FAILED=0
MLB_FAILED=0
NBA_SKIPPED=0
MLB_SKIPPED=0

# ---------------------------------------------------------------------------
# NBA settlement — uses settle_results.py auto-sources (ESPN + nba_api).
# In-progress games are refused at the source layer (ESPN payload's
# competition.status.type.completed must be true). Manual overrides win
# if present in pipeline/overrides/results_overrides.json.
# ---------------------------------------------------------------------------
step "1/3  NBA settlement · $TARGET_DATE"
if [ "$SKIP_NBA" = "1" ]; then
    warn "SKIP_NBA=1 — skipping NBA settlement"
    NBA_SKIPPED=1
else
    if $PY -m pipeline.settle_results --date "$TARGET_DATE" 2>&1 | tee /tmp/gtp_settle_nba.log; then
        ok "NBA settlement completed"
    else
        err "NBA settlement FAILED — see /tmp/gtp_settle_nba.log"
        NBA_FAILED=1
    fi
fi

# ---------------------------------------------------------------------------
# MLB settlement — uses MLB Stats API. Pipeline returns partial: true when
# games are still In Progress; those games are excluded from W/L. A later
# run picks them up automatically (idempotent).
# ---------------------------------------------------------------------------
step "2/3  MLB settlement · $TARGET_DATE"
if [ "$SKIP_MLB" = "1" ]; then
    warn "SKIP_MLB=1 — skipping MLB settlement"
    MLB_SKIPPED=1
else
    if $PY -m pipeline.mlb.settle_mlb_results --date "$TARGET_DATE" 2>&1 | tee /tmp/gtp_settle_mlb.log; then
        ok "MLB settlement completed"
    else
        err "MLB settlement FAILED — see /tmp/gtp_settle_mlb.log"
        MLB_FAILED=1
    fi
fi

# ---------------------------------------------------------------------------
# Export — rewrites app/public/data/{results,mlb/results}/ aggregates so
# /results, /results/{nba,mlb}, /results/date/<date> reflect the settled
# data on the next deploy. Idempotent.
# ---------------------------------------------------------------------------
step "3/3  Export sanitized results"
EXPORT_FAILED=0
if [ "$NBA_SKIPPED" != "1" ]; then
    if $PY -m pipeline.export_results 2>&1 | tee /tmp/gtp_export_nba.log; then
        ok "NBA results exported"
    else
        err "NBA export FAILED — see /tmp/gtp_export_nba.log"
        EXPORT_FAILED=1
    fi
fi
if [ "$MLB_SKIPPED" != "1" ]; then
    if $PY -m pipeline.mlb.export_mlb_results 2>&1 | tee /tmp/gtp_export_mlb.log; then
        ok "MLB results exported"
    else
        err "MLB export FAILED — see /tmp/gtp_export_mlb.log"
        EXPORT_FAILED=1
    fi
fi

# ---------------------------------------------------------------------------
# Model audit JSON — rebuilt from the freshly-settled JSONLs. This is the
# artifact /results and /results/model-audit consume; rebuilding here keeps
# the audit notes in sync with the settled record without a separate cron.
# Pure aggregation, no API calls.
# ---------------------------------------------------------------------------
AUDIT_FAILED=0
if [ "$NBA_SKIPPED" != "1" ] || [ "$MLB_SKIPPED" != "1" ]; then
    if $PY -m pipeline.model_audit 2>&1 | tee /tmp/gtp_model_audit.log; then
        ok "model_audit.json rebuilt"
    else
        err "model_audit FAILED — see /tmp/gtp_model_audit.log"
        AUDIT_FAILED=1
    fi
fi

# ---------------------------------------------------------------------------
# Parlay grading — pure local read of the snapshot for the settled
# date + this date's settled_leans. No API calls. Honest no-op if no
# pregame snapshot exists for the date (we never invent history).
# Always rebuilds the summary so any earlier graded dates remain
# reflected.
# ---------------------------------------------------------------------------
#
# Three graders run in order. Each is a pure local read against
# `settled_leans` we just wrote — no API calls.
#
#   grade_parlays    — legacy snapshot_parlays output (kept for
#                      back-compat with /results/parlays).
#   grade_curated    — single-leg curated picks shown on /about and
#                      legacy curated rails.
#   grade_optimizer  — NEW (PR #98). Grades the optimizer snapshots
#                      that the homepage + /parlay-lab + parlay-first
#                      /results actually display. Must run AFTER
#                      settlement so settled_leans is current. Takes
#                      --all so it also picks up any older snapshot
#                      that wasn't fully decisive on its first run;
#                      the summary regenerates from every graded
#                      date on disk.
#
# Each grader is an honest no-op if no snapshot exists for the date,
# and always rebuilds its own summary so earlier dates stay reflected.
GRADE_FAILED=0
step "4/6  Legacy parlay grading · $TARGET_DATE"
if $PY -m pipeline.grade_parlays --date "$TARGET_DATE" 2>&1 | tee /tmp/gtp_grade_parlays.log; then
    ok "legacy parlay grading completed (no-op if no saved snapshot for $TARGET_DATE)"
else
    warn "legacy parlay grading returned non-zero — see /tmp/gtp_grade_parlays.log"
    GRADE_FAILED=1
fi

step "5/6  Curated single-leg grading · $TARGET_DATE"
if $PY -m pipeline.grade_curated --date "$TARGET_DATE" 2>&1 | tee /tmp/gtp_grade_curated.log; then
    ok "curated grading completed (no-op if no saved snapshot for $TARGET_DATE)"
else
    warn "curated grading returned non-zero — see /tmp/gtp_grade_curated.log"
    GRADE_FAILED=1
fi

step "6/7  Optimizer parlay grading · all dates on disk"
if $PY -m pipeline.grade_optimizer --all 2>&1 | tee /tmp/gtp_grade_optimizer.log; then
    ok "optimizer grading + summary refreshed"
else
    warn "optimizer grading returned non-zero — see /tmp/gtp_grade_optimizer.log"
    GRADE_FAILED=1
fi

# ---------------------------------------------------------------------------
# Daily audit (PR #117) — reads the freshly-graded optimizer file and writes
# a compact postmortem JSON to app/public/data/audit/daily/<date>.json. This
# is the foundation for the model-learning loop (docs/MODEL_LEARNING_LOOP.md):
# pure aggregation over the just-graded slate, no API calls, never adjusts
# weights. Runs LAST so it sees the up-to-date optimizer-graded artifact.
# Honest no-op if the graded file doesn't exist (writes empty payload +
# warning).
# ---------------------------------------------------------------------------
AUDIT_DAILY_FAILED=0
step "7/8  Daily postmortem audit · $TARGET_DATE"
if $PY -m pipeline.audit_daily --date "$TARGET_DATE" 2>&1 | tee /tmp/gtp_audit_daily.log; then
    ok "daily audit written to app/public/data/audit/daily/${TARGET_DATE}.json"
else
    warn "daily audit returned non-zero — see /tmp/gtp_audit_daily.log"
    AUDIT_DAILY_FAILED=1
fi

# ---------------------------------------------------------------------------
# Confirmed-signal policy (PR #118) — pure aggregation over the daily
# audit JSON rolling window. Emits app/public/data/audit/policy.json.
# Demotion-only; one bad slate cannot move the model (3 confirming days
# required for any model-changing signal). Non-fatal: a missing or
# malformed audit becomes a warning in the policy itself.
# ---------------------------------------------------------------------------
POLICY_FAILED=0
step "8/8  Audit signal policy · rolling window"
if $PY -m pipeline.audit_signal_policy 2>&1 | tee /tmp/gtp_audit_policy.log; then
    ok "policy written to app/public/data/audit/policy.json"
else
    warn "policy generation returned non-zero — see /tmp/gtp_audit_policy.log"
    POLICY_FAILED=1
fi

DURATION=$(( $(date +%s) - START_TIME ))

step "Summary"
info "target date:    $TARGET_DATE"
info "nba step:       $([ "$NBA_SKIPPED" = 1 ] && echo skipped || ([ "$NBA_FAILED" = 1 ] && echo FAILED || echo ok))"
info "mlb step:       $([ "$MLB_SKIPPED" = 1 ] && echo skipped || ([ "$MLB_FAILED" = 1 ] && echo FAILED || echo ok))"
info "export step:    $([ "$EXPORT_FAILED" = 1 ] && echo FAILED || echo ok)"
info "model_audit:    $([ "$AUDIT_FAILED" = 1 ] && echo FAILED || echo ok)"
info "grade step:     $([ "$GRADE_FAILED" = 1 ] && echo non-fatal-warn || echo ok)"
info "audit_daily:    $([ "$AUDIT_DAILY_FAILED" = 1 ] && echo non-fatal-warn || echo ok)"
info "audit_policy:   $([ "$POLICY_FAILED" = 1 ] && echo non-fatal-warn || echo ok)"
info "elapsed:        ${DURATION}s"
info "odds credits:   0 (settlement uses free public APIs only)"

# Surface partial settlement honestly so the operator can see which games
# are still pending and need a follow-up run.
if [ -f "pipeline/validation/mlb_comparison_report_${TARGET_DATE}.json" ]; then
    PENDING=$($PY -c "import json,sys; r=json.load(open('pipeline/validation/mlb_comparison_report_${TARGET_DATE}.json')); print(r.get('pendingGames', 0))" 2>/dev/null || echo "?")
    if [ "$PENDING" != "0" ] && [ "$PENDING" != "?" ]; then
        warn "MLB partial: $PENDING game(s) still in progress — rerun later for full settlement"
    fi
fi

if [ "$NBA_FAILED" = "1" ] || [ "$MLB_FAILED" = "1" ] || [ "$EXPORT_FAILED" = "1" ] || [ "$AUDIT_FAILED" = "1" ]; then
    exit 2
fi
exit 0
