#!/usr/bin/env bash
# refresh_daily_products.sh — ONE command to regenerate every daily display product for a slate date.
#
#   bash scripts/refresh_daily_products.sh --date 2026-07-05                # full refresh (WC + MLB)
#   bash scripts/refresh_daily_products.sh --date 2026-07-05 --sport wc     # World Cup only
#   bash scripts/refresh_daily_products.sh --date 2026-07-05 --dry-run      # print the plan, run nothing
#
# GUARANTEES (fail-closed):
#   · DISPLAY artifacts only — canonical money (portfolio.json, banked-ladders.json) is md5-guarded:
#     if either changes during the run, the script exits 1 LOUDLY. This script can never settle.
#   · No API keys → exits 1 before any fetch (never half-refreshes).
#   · Runs the proven pipeline order (projections BEFORE board/props; specials + daily-portfolio
#     RE-RUN after props exist — the stale-$0/Moonshot-awaiting gotcha).
#   · MLB schedule is rewritten to board-shape + retired home-run-props removed (Homer stays retired).
#   · Ends with the health gate. NEVER deploys — deploy is a separate, human-reviewed step.
#
# Settlement is NOT this script: use scripts/settle_soccer_day.sh (official-gated) first when games
# have completed, then refresh the NEXT slate here. See docs/DAILY_OPS.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
BLUE='\033[0;34m'; GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
say()  { printf "${BLUE}═══ %s ═══${NC}\n" "$*"; }
ok()   { printf "${GREEN}  ✓ %s${NC}\n" "$*"; }
die()  { printf "${RED}  ✗ %s${NC}\n" "$*" >&2; exit 1; }

DATE=""; SPORT="all"; DRY=0
while [[ $# -gt 0 ]]; do case "$1" in
  --date) DATE="$2"; shift 2 ;;
  --sport) SPORT="$2"; shift 2 ;;
  --dry-run) DRY=1; shift ;;
  *) die "unknown arg: $1" ;;
esac; done
[[ "$DATE" =~ ^2[0-9]{3}-[0-9]{2}-[0-9]{2}$ ]] || die "--date YYYY-MM-DD is required"
[[ "$SPORT" =~ ^(all|wc|mlb)$ ]] || die "--sport must be all|wc|mlb"

PLAN=()
[[ "$SPORT" != "mlb" ]] && PLAN+=(
  "WC projections        python3 pipeline/world_cup/build_odds_only_projections.py --date $DATE"
  "WC knockout board     python3 pipeline/world_cup/build_round_of_32_board.py --horizon <auto> --slate-label $DATE --fetch-future"
  "WC player props       python3 pipeline/world_cup/build_player_props.py --date $DATE"
  "WC specials (post-props)  npx tsx app/scripts/refresh-world-cup-specials.mjs --date $DATE"
  "WC suggested parlays  python3 pipeline/world_cup/build_suggested_parlays.py --date $DATE"
  "WC expanded markets   npx tsx app/scripts/ingest-wc-expanded-markets.mjs --write --date $DATE (~2 credits/game, optional)"
)
[[ "$SPORT" != "wc" ]] && PLAN+=(
  "MLB board             python3 -m pipeline.mlb.generate_mlb_board --date $DATE"
  "MLB props ingest      npx tsx app/scripts/ingest-mlb-slate.mjs --date $DATE"
  "MLB team markets      npx tsx app/scripts/ingest-mlb-team-markets.mjs --write --date $DATE (~3 credits)"
  "MLB schedule→board-shape + rm home-run-props (Homer retired)"
)
PLAN+=(
  "Daily portfolio       npx tsx app/scripts/activate-daily-portfolio.mjs --date $DATE --apply"
  "Master ledger         npx tsx app/scripts/build-master-ledger.mjs"
  "Health gate           npx tsx app/scripts/health-check.mjs --today $DATE"
)

say "Daily product refresh · $DATE · sport=$SPORT $([[ $DRY == 1 ]] && echo '· DRY-RUN')"
for p in "${PLAN[@]}"; do echo "  · $p"; done
[[ $DRY == 1 ]] && { ok "dry-run — nothing executed"; exit 0; }

# ── Fail-closed preconditions ──────────────────────────────────────────────────────────────────
set -a; source .env 2>/dev/null || true; set +a
[[ "$SPORT" != "mlb" && -z "${ODDS_API_KEY:-}" ]] && die "ODDS_API_KEY missing (.env) — refusing a keyless WC refresh"
[[ "$SPORT" != "wc"  && -z "${ODDS_API_KEY:-}" ]] && die "ODDS_API_KEY missing (.env) — refusing a keyless MLB refresh"
export PYTHONPATH="$ROOT/pipeline/world_cup" ODDS_DRY_RUN=false TSX_TSCONFIG_PATH="$ROOT/app/tsconfig.json"

# ── Odds-API credit-floor guard (fail-closed) ──────────────────────────────────────────────────
# Before ANY paid fetch, check remaining credits via the FREE /v4/sports endpoint. If the balance is
# below the floor (default 5,000, override with ODDS_CREDIT_FLOOR), abort LOUDLY so a low-balance day
# can't silently burn the last credits. Advisory-only when the API doesn't report remaining credits
# (check exits 0 + warns) — a provider that omits the header must not hard-stop ops. See docs/OWNER_ACTIONS.md.
CREDIT_FLOOR="${ODDS_CREDIT_FLOOR:-5000}"
PY_BIN="$([ -d pipeline/.venv ] && echo pipeline/.venv/bin/python || echo python3)"
if [[ -n "${ODDS_API_KEY:-}" ]]; then
  "$PY_BIN" -m pipeline.check_odds_key --min-credits "$CREDIT_FLOOR" >/dev/null 2>/tmp/gtp_credit_floor.err \
    || { code=$?; if [[ "$code" == "3" ]]; then die "Odds API credits below floor ($CREDIT_FLOOR) — refusing the paid refresh. Override with ODDS_CREDIT_FLOOR=<n> only if you mean it. $(cat /tmp/gtp_credit_floor.err 2>/dev/null | tail -1)"; else printf "${RED}  ! credit check failed (exit %s) — proceeding (advisory)${NC}\n" "$code"; fi; }
  REMAIN=$("$PY_BIN" -m pipeline.check_odds_key --emit-remaining 2>/dev/null | tail -1)
  ok "Odds API credits: ${REMAIN:-unknown} (floor ${CREDIT_FLOOR})"
fi

# Canonical-money guard: snapshot before, verify after. This script must NEVER move money.
MONEY_FILES=(app/public/data/mr-dub/portfolio.json app/public/data/mr-dub/banked-ladders.json)
BEFORE=$(cat "${MONEY_FILES[@]}" | md5)

if [[ "$SPORT" != "mlb" ]]; then
  say "World Cup · $DATE"
  python3 pipeline/world_cup/build_odds_only_projections.py --date "$DATE"
  # Horizon = last knockout date in the schedule (falls back to date+3) so the board looks forward.
  HORIZON=$(python3 - "$DATE" <<'PY'
import json,sys,datetime
d=sys.argv[1]
try:
    s=json.load(open("app/public/data/world-cup/schedule.json"))
    ds=sorted({(g.get("matchDate") or g.get("date") or "")[:10] for g in (s.get("games") or []) if (g.get("matchDate") or g.get("date") or "")[:10]>=d})
    print(ds[min(len(ds)-1,3)] if ds else d)
except Exception:
    print((datetime.date.fromisoformat(d)+datetime.timedelta(days=3)).isoformat())
PY
)
  python3 pipeline/world_cup/build_round_of_32_board.py --horizon "$HORIZON" --slate-label "$DATE" --fetch-future
  python3 pipeline/world_cup/build_player_props.py --date "$DATE"
  npx tsx app/scripts/refresh-world-cup-specials.mjs --date "$DATE"
  python3 pipeline/world_cup/build_suggested_parlays.py --date "$DATE"
  # Expanded WC team markets (Asian handicap + team totals, de-vigged) → the soccer Game Center.
  # Optional: fails CLOSED for the module (|| true) so a missing expanded feed never breaks the refresh.
  npx tsx app/scripts/ingest-wc-expanded-markets.mjs --write --date "$DATE" | tail -3 || echo "  ! WC expanded markets skipped (optional, non-blocking)"
  ok "World Cup artifacts written (projections, board→$HORIZON, props, specials, parlays, expanded markets)"
fi

if [[ "$SPORT" != "wc" ]]; then
  say "MLB · $DATE"
  python3 -m pipeline.mlb.generate_mlb_board --date "$DATE" | tail -3
  npx tsx app/scripts/ingest-mlb-slate.mjs --date "$DATE"
  node -e "
const fs=require('fs');
const b=JSON.parse(fs.readFileSync('app/public/data/mlb/boards/$DATE.json'));
const sP='app/public/data/mlb/schedule/$DATE.json';
const s=JSON.parse(fs.readFileSync(sP));
fs.writeFileSync(sP, JSON.stringify({sport:'mlb',date:'$DATE',generatedAt:s.generatedAt||b.generatedAt,source:b.source||'odds_api+statsapi',games:b.games||[]},null,2)+'\n');
console.log('  schedule → board-shape ('+(b.games||[]).length+' games)');"
  rm -f "app/public/data/mlb/home-run-props/$DATE.json" && echo "  home-run-props/$DATE.json removed (Homer retired)"
  # Full-market team markets (moneyline / run line / total, de-vigged) → the Game Center.
  # One extra bulk Odds call (~3 credits); credit-guarded (fail-closed); needs the board above.
  npx tsx app/scripts/ingest-mlb-team-markets.mjs --write --date "$DATE" | tail -2
  ok "MLB artifacts written (board, props, schedule, team markets)"
fi

say "Cross-product · daily portfolio + master ledger"
npx tsx app/scripts/activate-daily-portfolio.mjs --date "$DATE" --apply | tail -4
npx tsx app/scripts/build-master-ledger.mjs | tail -1
npx tsx app/scripts/build-admin-status.mjs | tail -1

# ── Money-mutation guard (hard fail) ───────────────────────────────────────────────────────────
AFTER=$(cat "${MONEY_FILES[@]}" | md5)
[[ "$BEFORE" == "$AFTER" ]] || die "CANONICAL MONEY CHANGED during a display refresh — investigate NOW (portfolio/banked-ladders md5 moved)"
ok "canonical money untouched (md5 verified)"

say "Health gate"
npx tsx app/scripts/health-check.mjs --today "$DATE" | tail -2

ok "refresh complete · $DATE · rebuild + deploy is a separate step (see docs/DAILY_OPS.md)"
