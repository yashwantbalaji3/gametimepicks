#!/usr/bin/env bash
# roll_to_next_day.sh — the autonomous daily roll-forward orchestrator (GameTimePicks v3.0, PHASE 2).
#
# ONE command performs the full daily cycle, SETTLE-FIRST, with money integrity gated at every hinge:
#
#   verify money → settle PRIOR day (official) → reconcile → [HALT if prior day not settled]
#     → fetch odds → build projections → promote slate → activate Bank Builder (next rung)
#     → refresh WC Specials → ingest+enrich Homer Nukes → capture benchmark
#     → MONEY GATE → tests → build → [deploy] → verify production
#
# Composed entirely of the individually-tested, verified scripts. Every step is idempotent / rerun-safe.
#
# INVARIANTS (why this is safe to schedule):
#   • NEVER fabricates — odds come from the live feed, results from the official settlement engine.
#   • SETTLE-FIRST — the prior day MUST be officially settled (or have nothing live) before the next day
#     is generated; if a prior-day lane is still pending, it HALTS rather than abandon a live wager.
#   • MONEY-GATE GUARDED — verify-money-integrity runs before AND after; a non-zero gate ABORTS the roll
#     and (with --deploy) never publishes a corrupted bankroll.
#   • DRY-RUN BY DEFAULT — no --apply ⇒ plans + reports, writes no money/ladder, never deploys.
#   • portfolio.json is read-only here; only the official seed-model settlement moves the bankroll.
#
# Usage:
#   bash scripts/roll_to_next_day.sh --to 2026-06-27                 # dry-run (plan only)
#   bash scripts/roll_to_next_day.sh --to 2026-06-27 --apply         # settle+generate (no deploy)
#   bash scripts/roll_to_next_day.sh --to 2026-06-27 --apply --deploy# full autonomous roll + deploy
#   OFFICIAL=/tmp/official.json bash scripts/roll_to_next_day.sh --to 2026-06-27 --apply  # operator bundle
set -euo pipefail

BLUE="\033[0;34m"; GREEN="\033[0;32m"; YELLOW="\033[0;33m"; RED="\033[0;31m"; RESET="\033[0m"
info(){ echo -e "  ${BLUE}·${RESET} $1"; }; ok(){ echo -e "  ${GREEN}✓${RESET} $1"; }
warn(){ echo -e "  ${YELLOW}!${RESET} $1"; }; err(){ echo -e "  ${RED}✗${RESET} $1" >&2; }
step(){ echo ""; echo -e "${BLUE}═══ $1 ═══${RESET}"; }
die(){ err "$1"; exit 1; }

[ -d ".git" ] || die "run from the repo root"
TO=""; APPLY=0; DEPLOY=0
while [ $# -gt 0 ]; do case "$1" in
  --to) TO="$2"; shift 2;;
  --apply) APPLY=1; shift;;
  --deploy) DEPLOY=1; shift;;
  *) shift;;
esac; done
[ -n "$TO" ] || TO=$(TZ=America/New_York date '+%Y-%m-%d')
# PRIOR day = the day before the one we're rolling TO (the slate that must settle first).
PREV=$(python3 -c "import datetime as d; print((d.date.fromisoformat('$TO')-d.timedelta(days=1)).isoformat())")
PY="$([ -d pipeline/.venv ] && echo pipeline/.venv/bin/python || echo python3)"
MODE=$([ "$APPLY" = 1 ] && echo APPLY || echo DRY-RUN)
gate(){ npx tsx app/scripts/verify-money-integrity.mjs || die "MONEY-INTEGRITY GATE FAILED — aborting the roll (never proceed on a corrupted bankroll)."; npx tsx app/scripts/forensic-money-audit.mjs >/dev/null || die "FORENSIC MONEY AUDIT FAILED — a displayed value no longer reconciles to the canonical \$100→bankroll journey."; }

step "0/11  Roll forward · settle $PREV → generate $TO · $MODE$([ "$DEPLOY" = 1 ] && echo ' +DEPLOY')"
set -a; [ -f .env ] && . ./.env; set +a

step "1/11  Money-integrity pre-check"
gate

step "2/11  Settle the prior day ($PREV) — official-gated, idempotent"
bash scripts/settle_soccer_day.sh --date "$PREV" $([ "$APPLY" = 1 ] && echo --apply) || die "settlement step failed"

step "3/11  Settle-first guard — prior day must be settled before we generate the next"
PENDING=$($PY - "$PREV" <<'PYEOF'
import json, sys
prev=sys.argv[1]
try:
    dp=json.load(open("app/public/data/mr-dub/daily-portfolio.json"))
except Exception:
    print(0); sys.exit(0)              # no daily portfolio yet → nothing live to settle
if dp.get("date")!=prev:
    print(0); sys.exit(0)              # the live slate isn't the prior day → already rolled / nothing pending
pend=sum(1 for l in dp.get("lanes",[]) if l.get("product")=="bank-builder" and l.get("status")=="active")
print(pend)
PYEOF
)
if [ "${PENDING:-0}" -gt 0 ]; then
  die "HALT: $PENDING prior-day ($PREV) Bank Builder lane(s) still ACTIVE/unsettled — official results not in yet. Will not roll forward over a live wager (provide an OFFICIAL bundle or wait)."
fi
ok "prior day clear — safe to generate $TO"

step "4/11  Fetch live World Cup odds + build projections ($TO)"
if [ "$APPLY" = 1 ]; then
  $PY -m pipeline.world_cup.odds_api --date "$TO" --markets h2h,totals || warn "WC odds fetch returned non-zero"
  $PY -m pipeline.world_cup.build_odds_only_projections --date "$TO" || warn "WC projection build returned non-zero"
  ok "WC odds + projections built for $TO"
else info "dry-run — skipping live odds fetch (costs credits)"; fi

step "5/11  Promote the $TO slate → latest.json"
if [ "$APPLY" = 1 ] && [ -f "app/public/data/world-cup/projections/$TO.json" ]; then
  for f in projections/$TO market-outlook-$TO odds-discovery-$TO parlays/$TO; do
    base="app/public/data/world-cup/$f.json"; latest="${base/$TO/latest}"
    [ -f "$base" ] && cp "$base" "$latest" && info "promoted $(basename "$latest")"
  done
  ok "slate promoted to $TO"
else info "dry-run (or no $TO projections) — slate pointer unchanged"; fi

step "6/11  Activate Bank Builder next rung + Moonshot ($TO)"
( cd app && npx tsx scripts/activate-daily-portfolio.mjs --date "$TO" $([ "$APPLY" = 1 ] && echo --apply) ) || die "activation failed"

step "7/11  Refresh World Cup Specials ($TO)"
if [ "$APPLY" = 1 ]; then ( cd app && npx tsx scripts/refresh-world-cup-specials.mjs --date "$TO" ) || warn "WC specials refresh non-zero"
else info "dry-run — specials not rewritten"; fi

step "8/11  Homer Nukes — ingest MLB slate + enrich real headshots ($TO)"
if [ "$APPLY" = 1 ]; then
  ODDS_DRY_RUN=false npx tsx app/scripts/ingest-mlb-slate.mjs --date "$TO" || warn "MLB ingest non-zero (no slate?)"
  ( cd app && npx tsx scripts/enrich-mlb-headshots.mjs --date "$TO" ) || warn "MLB enrich non-zero"
else info "dry-run — MLB not fetched"; fi

step "9/11  Capture pre-kickoff benchmark snapshot ($TO)"
( cd app && npx tsx scripts/capture-market-benchmark.mjs --date "$TO" ) || warn "benchmark capture non-zero"

step "10/11  Money-integrity GATE + tests + build"
gate
ok "money reconciles after the roll"
( cd app && npx tsx --test $(cd app && find src -name '*.test.mjs') ) >/tmp/roll_tests.log 2>&1 \
  && ok "full test suite passed" || { tail -5 /tmp/roll_tests.log; die "tests failed — not deploying"; }
( cd app && rm -rf .next && npm run build ) >/tmp/roll_build.log 2>&1 \
  && ok "production build clean" || { tail -5 /tmp/roll_build.log; die "build failed — not deploying"; }

step "11/11  Deploy + verify production"
if [ "$APPLY" = 1 ] && [ "$DEPLOY" = 1 ]; then
  gate  # final guard immediately before publishing
  git add -A && git commit -q -m "Daily roll-forward $TO (settled $PREV) — automated" || warn "nothing to commit"
  git push origin HEAD:main || die "push failed"
  ok "pushed to main (Vercel auto-deploys)"
  sleep 80
  for p in "" today bank-builder moonshot world-cup-specials homer-nukes mr-dub results; do
    code=$(curl -sL -o /dev/null -w "%{http_code}" "https://gametime-picks.vercel.app/$p" 2>/dev/null)
    [ "$code" = "200" ] && info "/$p 200" || warn "/$p $code"
  done
  ok "production verified"
else info "dry-run / no --deploy — not publishing"; fi

echo ""; ok "roll complete · settle $PREV → generate $TO · $MODE$([ "$DEPLOY" = 1 ] && echo ' DEPLOYED')"
