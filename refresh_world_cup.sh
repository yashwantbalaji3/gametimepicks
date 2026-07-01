#!/usr/bin/env bash
#
# refresh_world_cup.sh — the SINGLE World Cup daily-refresh orchestrator.
#
# Runs the proven pipeline in order from ONE live odds fetch so every product is generated from the same
# dataset and every page ends up on the same slate:
#
#   odds fetch → projections → board → player props → WC specials → suggested parlays
#             → daily-portfolio activation → master ledger → health check → build verify
#
# GUARANTEES
#   • fail-closed: `set -euo pipefail`; any step's non-zero exit aborts the whole run (no partial refresh).
#   • credit guard: aborts before spending if The Odds API balance is below --min-credits.
#   • money-safe: it NEVER settles and NEVER writes canonical money. It snapshots app/public/data/mr-dub/
#     portfolio.json before and after and ABORTS if that file changed (canonical crown/bankroll must be
#     mutated ONLY by an explicit settlement, never by a refresh).
#   • --dry-run: prints the plan + checks preconditions/credits and makes NO odds spend and NO writes.
#
# USAGE
#   ./refresh_world_cup.sh --date 2026-07-02 [--horizon 2026-07-04] [--dry-run] [--min-credits 200]
#
set -euo pipefail

# ─────────────────────────────── args ───────────────────────────────
DATE=""; HORIZON=""; DRY_RUN=0; MIN_CREDITS=200
while [[ $# -gt 0 ]]; do
  case "$1" in
    --date) DATE="$2"; shift 2;;
    --horizon) HORIZON="$2"; shift 2;;
    --dry-run) DRY_RUN=1; shift;;
    --min-credits) MIN_CREDITS="$2"; shift 2;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done
[[ -z "$DATE" ]] && { echo "ERROR: --date YYYY-MM-DD is required" >&2; exit 2; }
[[ "$DATE" =~ ^2026-[0-9]{2}-[0-9]{2}$ ]] || { echo "ERROR: --date must be YYYY-MM-DD" >&2; exit 2; }
# Default horizon = date + 3 days (covers the R32/R16 window without hardcoding).
[[ -z "$HORIZON" ]] && HORIZON="$(python3 -c "import datetime;print(datetime.date.fromisoformat('$DATE')+datetime.timedelta(days=3))")"

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO"
PORTFOLIO="app/public/data/mr-dub/portfolio.json"
LOG_PREFIX="[refresh-wc $DATE]"
step() { echo ""; echo "$LOG_PREFIX ── $* ──"; }
fail() { echo "$LOG_PREFIX ✗ FAILED: $*" >&2; exit 1; }

# ─────────────────────────── preconditions ───────────────────────────
step "preconditions"
[[ -f .env ]] || fail ".env not found (needs ODDS_API_KEY)"
set -a; source .env; set +a
[[ -n "${ODDS_API_KEY:-}" ]] || fail "ODDS_API_KEY not set in .env"
[[ -f "$PORTFOLIO" ]] || fail "canonical portfolio.json missing"
export PYTHONPATH="$REPO/pipeline/world_cup:${PYTHONPATH:-}"
MONEY_BEFORE="$(md5 -q "$PORTFOLIO" 2>/dev/null || md5sum "$PORTFOLIO" | cut -d' ' -f1)"
echo "$LOG_PREFIX date=$DATE horizon=$HORIZON dry_run=$DRY_RUN min_credits=$MIN_CREDITS"
echo "$LOG_PREFIX canonical portfolio md5 (pre) = $MONEY_BEFORE"

# ─────────────────────────── credit guard ───────────────────────────
# A cheap /sports probe returns the x-requests-remaining balance WITHOUT spending an odds credit.
step "credit guard (min $MIN_CREDITS)"
CREDITS="$(python3 - <<PY
import os, urllib.request, json
key=os.environ["ODDS_API_KEY"]
try:
    with urllib.request.urlopen(f"https://api.the-odds-api.com/v4/sports?apiKey={key}", timeout=20) as r:
        print(r.headers.get("x-requests-remaining") or "unknown")
except Exception as e:
    print("error")
PY
)"
echo "$LOG_PREFIX creditsRemaining=$CREDITS"
if [[ "$CREDITS" == "error" ]]; then fail "could not reach The Odds API to check credits"; fi
if [[ "$CREDITS" != "unknown" ]] && (( ${CREDITS%.*} < MIN_CREDITS )); then
  fail "creditsRemaining $CREDITS is below --min-credits $MIN_CREDITS — refusing to spend"
fi

if [[ "$DRY_RUN" == "1" ]]; then
  step "DRY-RUN plan (no odds spend, no writes)"
  cat <<PLAN
  1. odds_api                 --date $DATE            (real fetch, ~1-2 credits)
  2. build_odds_only_projections --date $DATE
  3. build_round_of_32_board.py  --horizon $HORIZON --slate-label $DATE --fetch-future
  4. build_player_props.py       --date $DATE
  5. refresh-world-cup-specials.mjs --date $DATE       (RE-RUN after props exist)
  6. build_suggested_parlays.py  --date $DATE
  7. activate-daily-portfolio.mjs --date $DATE --apply  (paper only; canonical money untouched)
  8. build-master-ledger.mjs
  9. health-check.mjs --today $DATE
 10. npm run build             (verify static export)
PLAN
  echo "$LOG_PREFIX ✓ dry-run OK — preconditions met, $CREDITS credits available."
  exit 0
fi

# ─────────────────────────── pipeline ───────────────────────────
step "1/10 odds fetch"          ; python3 pipeline/world_cup/odds_api.py --date "$DATE" || fail "odds_api"
step "2/10 projections"         ; python3 pipeline/world_cup/build_odds_only_projections.py --date "$DATE" || fail "projections"
step "3/10 knockout board"      ; python3 pipeline/world_cup/build_round_of_32_board.py --horizon "$HORIZON" --slate-label "$DATE" --fetch-future || fail "board"
step "4/10 player props"        ; python3 pipeline/world_cup/build_player_props.py --date "$DATE" || fail "player_props"
step "5/10 WC specials"         ; ( cd app && npx tsx scripts/refresh-world-cup-specials.mjs --date "$DATE" ) || fail "specials"
step "6/10 suggested parlays"   ; python3 pipeline/world_cup/build_suggested_parlays.py --date "$DATE" || fail "parlays"
step "7/10 daily-portfolio"     ; npx tsx app/scripts/activate-daily-portfolio.mjs --date "$DATE" --apply || fail "daily_portfolio"
step "8/10 master ledger"       ; npx tsx app/scripts/build-master-ledger.mjs || fail "master_ledger"

# ─────────────────────── money-mutation guard ───────────────────────
step "money-mutation guard"
MONEY_AFTER="$(md5 -q "$PORTFOLIO" 2>/dev/null || md5sum "$PORTFOLIO" | cut -d' ' -f1)"
if [[ "$MONEY_BEFORE" != "$MONEY_AFTER" ]]; then
  fail "canonical portfolio.json CHANGED during refresh (before=$MONEY_BEFORE after=$MONEY_AFTER). A refresh must never mutate canonical money — investigate before deploying."
fi
echo "$LOG_PREFIX ✓ canonical portfolio md5 unchanged ($MONEY_AFTER)"

step "9/10 health check"        ; export TSX_TSCONFIG_PATH="$REPO/app/tsconfig.json"; npx tsx app/scripts/health-check.mjs --today "$DATE" || fail "health_check"
step "10/10 build verify"       ; ( cd app && npm run build > /tmp/refresh-wc-build.log 2>&1 ) || { tail -20 /tmp/refresh-wc-build.log; fail "build"; }

echo ""
echo "$LOG_PREFIX ✓ REFRESH COMPLETE — all products regenerated for $DATE, canonical money unchanged, health + build green."
echo "$LOG_PREFIX review the diff, then commit + deploy (this script does NOT push)."
