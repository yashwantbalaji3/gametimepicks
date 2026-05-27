#!/usr/bin/env bash
# =============================================================================
# scripts/automation_projections.sh
#
# Morning projection refresh orchestrator. Runs after the nightly
# settle so today's board lands on the live site with real model
# leans.
#
# What it does (in order):
#   1. Resolve today's date in America/New_York
#   2. Estimate paid credit cost for NBA + MLB today
#   3. Probe Odds API balance (free) via pipeline.credit_guard
#   4. STOP cleanly when cost > 75 OR projected balance < 300
#   5. NBA: run generate_daily_board (props + game logs) then
#      attach_recent10 so confidence tiers reflect real recent form
#   6. MLB: run generate_mlb_board with --min-credits-remaining 300
#   7. Print summary log + balance before/after
#
# Hard rules honored:
#   - No paid run when ODDS_API_KEY is unset → exit 0 with a clear log
#   - Estimated cost gates the run BEFORE any paid call
#   - Per-sport pipelines own the final guard layer (defense in depth)
#   - NHL / IPL stay schedule-only — no projection generation here
#
# Inputs (env):
#   ODDS_API_KEY            required for any paid call
#   PROJECTIONS_DATE        override today's date (YYYY-MM-DD)
#   SKIP_NBA / SKIP_MLB     "1" to skip a sport
#   MAX_PER_RUN             default 75
#   MIN_REMAINING           default 300
#   ODDS_MAX_EVENTS_PER_RUN forwarded to NBA pipeline (default 4)
#   DRY_RUN_PROJECTIONS     "1" prints plan only, no spend
#
# Exit codes:
#   0  ran cleanly (or honestly skipped)
#   1  setup / dependency error
#   2  a paid step failed mid-run
# =============================================================================

set -e

GREEN="\033[0;32m"; RED="\033[0;31m"; YELLOW="\033[0;33m"
BLUE="\033[0;34m"; RESET="\033[0m"

ok()    { echo -e "  ${GREEN}✓${RESET} $1"; }
err()   { echo -e "  ${RED}✗${RESET} $1" >&2; }
warn()  { echo -e "  ${YELLOW}!${RESET} $1"; }
info()  { echo -e "  ${BLUE}·${RESET} $1"; }
step()  { echo ""; echo -e "${BLUE}═══ $1 ═══${RESET}"; }

[ -d ".git" ] || { err "must run from repo root"; exit 1; }

PIPELINE_VENV="pipeline/.venv"
[ -d "$PIPELINE_VENV" ] && PY="$PIPELINE_VENV/bin/python" || PY="python3"

# ET date resolution. Linux GNU date and BSD date diverge; try both.
if [ -n "$PROJECTIONS_DATE" ]; then
    TARGET_DATE="$PROJECTIONS_DATE"
else
    if TARGET_DATE=$(TZ=America/New_York date '+%Y-%m-%d' 2>/dev/null); then
        :
    else
        TARGET_DATE=$(date '+%Y-%m-%d')
    fi
fi

MAX_PER_RUN="${MAX_PER_RUN:-75}"
MIN_REMAINING="${MIN_REMAINING:-300}"

# NBA cost per event = 3 markets × 1 region = 3 credits.
# MLB cost per event = 4 markets × 1 region = 4 credits (includes the
# hits+runs+RBIs market; verified against the live MLB pipeline).
# These constants exist on disk; we estimate against the worst case so
# the gate is conservative.
NBA_PER_EVENT=3
MLB_PER_EVENT=4

START_TIME=$(date +%s)

step "0/4  Pre-flight"
info "target date:       $TARGET_DATE (today in America/New_York)"
ok   "python:            $($PY --version 2>&1)"
info "MAX_PER_RUN:       $MAX_PER_RUN"
info "MIN_REMAINING:     $MIN_REMAINING"
info "SKIP_NBA=${SKIP_NBA:-0} · SKIP_MLB=${SKIP_MLB:-0} · DRY_RUN_PROJECTIONS=${DRY_RUN_PROJECTIONS:-0}"

if [ -z "$ODDS_API_KEY" ]; then
    warn "ODDS_API_KEY not set — projection refresh honestly skipped"
    warn "Schedule data and recent10 logs are still refreshed by automation_refresh.sh"
    exit 0
fi
ok   "ODDS_API_KEY:      set"

# ---------------------------------------------------------------------------
# Cricket / IPL projection pipeline was removed from user-facing surfaces
# in PR #113 (May 26). The data-pipeline calls that lived here were left
# behind by accident and were quietly committing cricket board / context
# JSONs to the public data directory on every morning cron — surfacing
# nowhere but adding noise to git history and burning ~2 credits/day.
# Removed in fix/may27-refresh-pipeline. If WNBA / cricket / NHL ship in
# the future, restore the relevant block then.
# ---------------------------------------------------------------------------
CRICKET_FAILED=0   # kept as a defined variable so the summary line below
                   # (and any other downstream references) stays well-formed
                   # without a behavior change.

# ---------------------------------------------------------------------------
# Cost estimation. We count today's MLB events from the on-disk
# schedule (if present) — the schedule itself is free to fetch from
# MLB Stats API, and the auto-refresh pass should have written it
# earlier. NBA we estimate at 1 event (playoff window); the pipeline
# itself caps via ODDS_MAX_EVENTS_PER_RUN as a second gate.
# ---------------------------------------------------------------------------
step "1/4  Estimate cost"
NBA_EVENTS=1
MLB_SCHEDULE="app/public/data/mlb/schedule/${TARGET_DATE}.json"
MLB_EVENTS=0
if [ -f "$MLB_SCHEDULE" ]; then
    MLB_EVENTS=$($PY -c "import json,sys; print(len(json.load(open('$MLB_SCHEDULE')).get('games',[])))" 2>/dev/null || echo 0)
fi
NBA_COST=$([ "${SKIP_NBA:-0}" = "1" ] && echo 0 || echo $(( NBA_EVENTS * NBA_PER_EVENT )))
MLB_COST=$([ "${SKIP_MLB:-0}" = "1" ] && echo 0 || echo $(( MLB_EVENTS * MLB_PER_EVENT )))
TOTAL_COST=$(( NBA_COST + MLB_COST ))
info "NBA events:        ${NBA_EVENTS} × ${NBA_PER_EVENT} = ${NBA_COST} credits"
info "MLB events:        ${MLB_EVENTS} × ${MLB_PER_EVENT} = ${MLB_COST} credits"
info "estimated total:   ${TOTAL_COST} credits"

# ---------------------------------------------------------------------------
# Credit gate. STOP cleanly when the run would exceed cap or drop below
# floor. credit_guard.py is the single source of truth for this math.
# ---------------------------------------------------------------------------
step "2/4  Credit guard probe"
GUARD_OUT=$($PY -m pipeline.credit_guard \
    --estimated-cost "$TOTAL_COST" \
    --max-per-run "$MAX_PER_RUN" \
    --min-remaining "$MIN_REMAINING" \
    --json 2>&1) || GUARD_RC=$?
GUARD_RC=${GUARD_RC:-0}
echo "$GUARD_OUT"
GUARD_OK=$($PY -c "import json,sys; d=json.loads('''$GUARD_OUT'''); print('1' if d.get('ok') else '0')" 2>/dev/null || echo "0")
BAL_BEFORE=$($PY -c "import json,sys; d=json.loads('''$GUARD_OUT'''); print(d.get('remaining') or 'unknown')" 2>/dev/null || echo "unknown")

if [ "$GUARD_OK" != "1" ]; then
    warn "credit guard refused the run — honestly stopping (no spend)"
    exit 0
fi
ok "credit guard OK · balance before: $BAL_BEFORE"

if [ "$DRY_RUN_PROJECTIONS" = "1" ]; then
    warn "DRY_RUN_PROJECTIONS=1 — plan accepted, no paid call"
    info "would run: $PY -m pipeline.generate_daily_board --date $TARGET_DATE"
    info "would run: $PY -m pipeline.attach_recent10 --date $TARGET_DATE"
    info "would run: $PY -m pipeline.mlb.generate_mlb_board --date $TARGET_DATE --min-credits-remaining $MIN_REMAINING"
    info "would run: $PY -m pipeline.snapshot_parlays --date $TARGET_DATE"
    info "would run: $PY -m pipeline.snapshot_optimizer --date $TARGET_DATE"
    exit 0
fi

# ---------------------------------------------------------------------------
# NBA paid run + rescue. ODDS_DRY_RUN=false force-overrides the .env
# default so the paid /odds calls actually fire. attach_recent10
# then rescues any R1-suppressed leans (see PR #58).
# ---------------------------------------------------------------------------
NBA_FAILED=0
MLB_FAILED=0

step "3/4  NBA projections · $TARGET_DATE"
if [ "${SKIP_NBA:-0}" = "1" ]; then
    warn "SKIP_NBA=1 — skipping NBA refresh"
else
    if ODDS_DRY_RUN=false ODDS_MAX_EVENTS_PER_RUN="${ODDS_MAX_EVENTS_PER_RUN:-4}" \
       $PY -m pipeline.generate_daily_board --date "$TARGET_DATE" 2>&1 | tee /tmp/gtp_nba_refresh.log; then
        ok "NBA board generation completed"
        if $PY -m pipeline.attach_recent10 --date "$TARGET_DATE" 2>&1 | tee /tmp/gtp_nba_recent10.log; then
            ok "NBA recent10 + R1 rescue completed"
        else
            warn "attach_recent10 returned non-zero — board still wrote; rescue may not have run"
        fi
    else
        err "NBA refresh FAILED — see /tmp/gtp_nba_refresh.log"
        NBA_FAILED=1
    fi
fi

step "4/4  MLB projections · $TARGET_DATE"
if [ "${SKIP_MLB:-0}" = "1" ]; then
    warn "SKIP_MLB=1 — skipping MLB refresh"
else
    # MLB pipeline owns its own internal credit floor + per-run cap.
    # We pass MIN_REMAINING so the pipeline's gate matches ours.
    if ODDS_DRY_RUN=false $PY -m pipeline.mlb.generate_mlb_board \
        --date "$TARGET_DATE" \
        --min-credits-remaining "$MIN_REMAINING" \
        --max-credits-per-run "$MAX_PER_RUN" \
        2>&1 | tee /tmp/gtp_mlb_refresh.log; then
        ok "MLB board generation completed"
    else
        err "MLB refresh FAILED — see /tmp/gtp_mlb_refresh.log"
        MLB_FAILED=1
    fi
fi

# Re-probe balance for the operator log. Free call.
BAL_AFTER_RAW=$($PY -m pipeline.credit_guard \
    --estimated-cost 0 \
    --max-per-run "$MAX_PER_RUN" \
    --min-remaining 0 \
    --json 2>/dev/null) || true
BAL_AFTER=$($PY -c "import json,sys; print(json.loads('''$BAL_AFTER_RAW''').get('remaining') or 'unknown')" 2>/dev/null || echo "unknown")

# ---------------------------------------------------------------------------
# Parlay candidate snapshot — pure local read of today's board; no
# paid API. Captures pregame candidate slips so pipeline.grade_parlays
# can later score them against settled results. Non-fatal: if the
# NBA board failed earlier or produced no eligible candidates, we
# still exit cleanly. Missing/empty snapshot is preferred over an
# invented one.
# ---------------------------------------------------------------------------
SNAPSHOT_FAILED=0
step "5/6  Legacy parlay candidate snapshot"
if [ "$NBA_FAILED" = "1" ] && [ "${SKIP_NBA:-0}" != "1" ]; then
    warn "NBA board failed earlier — skipping parlay snapshot to avoid stale data"
elif [ "${SKIP_NBA:-0}" = "1" ]; then
    warn "SKIP_NBA=1 — parlay snapshot relies on NBA board, skipped"
else
    if $PY -m pipeline.snapshot_parlays --date "$TARGET_DATE" 2>&1 | tee /tmp/gtp_snapshot_parlays.log; then
        ok "parlay snapshot written"
    else
        # Snapshot is best-effort. Surface a warning, don't break
        # the projections pipeline.
        warn "parlay snapshot returned non-zero — see /tmp/gtp_snapshot_parlays.log"
        SNAPSHOT_FAILED=1
    fi
fi

# ---------------------------------------------------------------------------
# Optimizer snapshot (PR #120 — fix/wire-snapshot-optimizer-cron) — pure
# local read of today's board(s); no paid API. Produces the snapshot
# the homepage carousel + Parlay Lab actually display:
#   app/public/data/parlays/optimizer/<date>.json
# The nightly settle workflow then grades this snapshot via
# `pipeline.grade_optimizer --all`, which writes the optimizer-graded
# file the audit + Results page consume. Without this step, those
# downstream artifacts stay empty for the date (which is what happened
# on 5/26 — board existed, snapshot was never produced via cron).
#
# Non-fatal by design: if both NBA failed AND MLB skipped, the
# optimizer still runs against whatever boards exist on disk and
# honestly emits 0 slips when the eligible pool is too small (1
# NBA Finals game + 0 MLB props → no 2+ leg parlays possible). We
# never invent slips.
# ---------------------------------------------------------------------------
OPTIMIZER_SNAPSHOT_FAILED=0
step "6/6  Optimizer snapshot · $TARGET_DATE"
if $PY -m pipeline.snapshot_optimizer --date "$TARGET_DATE" 2>&1 | tee /tmp/gtp_snapshot_optimizer.log; then
    # Surface the slip count from the snapshot itself for the operator
    # log. The file is JSON; a missing `totalSlips` field is treated
    # as 0 so the line never breaks the script.
    OPT_FILE="app/public/data/parlays/optimizer/${TARGET_DATE}.json"
    if [ -f "$OPT_FILE" ]; then
        OPT_COUNT=$($PY -c "import json; d=json.load(open('$OPT_FILE')); print(d.get('totalSlips') or 0)" 2>/dev/null || echo "?")
        ok "optimizer snapshot written ($OPT_COUNT slips) → $OPT_FILE"
    else
        warn "optimizer snapshot completed but no output file at $OPT_FILE"
        OPTIMIZER_SNAPSHOT_FAILED=1
    fi
else
    warn "optimizer snapshot returned non-zero — see /tmp/gtp_snapshot_optimizer.log"
    OPTIMIZER_SNAPSHOT_FAILED=1
fi

DURATION=$(( $(date +%s) - START_TIME ))

step "Summary"
info "target date:    $TARGET_DATE"
info "nba step:       $([ "${SKIP_NBA:-0}" = 1 ] && echo skipped || ([ "$NBA_FAILED" = 1 ] && echo FAILED || echo ok))"
info "mlb step:       $([ "${SKIP_MLB:-0}" = 1 ] && echo skipped || ([ "$MLB_FAILED" = 1 ] && echo FAILED || echo ok))"
info "snapshot step:  $([ "$SNAPSHOT_FAILED" = 1 ] && echo non-fatal-warn || echo ok)"
info "optimizer step: $([ "$OPTIMIZER_SNAPSHOT_FAILED" = 1 ] && echo non-fatal-warn || echo ok)"
info "balance before: $BAL_BEFORE"
info "balance after:  $BAL_AFTER"
info "elapsed:        ${DURATION}s"

if [ "$NBA_FAILED" = "1" ] || [ "$MLB_FAILED" = "1" ]; then
    exit 2
fi
exit 0
