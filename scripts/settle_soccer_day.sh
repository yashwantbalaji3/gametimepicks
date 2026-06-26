#!/usr/bin/env bash
# settle_soccer_day.sh — the cohesive, automated daily World Cup / Mr. Dub settlement pipeline.
#
# Composes the tested pieces into one safe daily run:
#   1) fetch official FT results  (pipeline/fetch_official_soccer.py — API-Football v3 /fixtures)
#   2) grade + persist history     (app/scripts/persist-soccer-settlement.mjs — NEVER touches money)
#   3) apply the seed model        (app/scripts/settle-daily-portfolio.mjs --apply — BB bankroll/ladder)
#   4) reconcile derived ledgers   (app/scripts/build-mr-dub-ledger.mjs — portfolio/ledger/daily-summary)
#
# INVARIANTS (why this is safe to schedule nightly):
#   • NEVER fabricates — every result comes from the official bundle through the tested grading engine.
#   • OFFICIAL-FINAL GATED — only matches with status "FT" grade; the engine pends anything else.
#   • IDEMPOTENT / rerun-safe — settle-daily-portfolio skips ladder steps already "settled"; persist
#     dedupes ledger rows by date+card; build-mr-dub-ledger is a pure rebuild from the artifacts.
#   • PARTIALLY-SAFE — if only some games are final, only those cards settle; the rest stay pending.
#   • API-UNAVAILABLE-SAFE — no key / fetch failure / zero finals → NO-OP (writes nothing, exits 0).
#   • crown is never written; only lost $100 seeds move the bankroll (enforced by the lib guards).
#
# Usage:
#   bash scripts/settle_soccer_day.sh --date 2026-06-24            # dry-run (grade + plan, no money)
#   bash scripts/settle_soccer_day.sh --date 2026-06-24 --apply    # apply the seed model
#   OFFICIAL=/tmp/official.json bash scripts/settle_soccer_day.sh --date 2026-06-24 --apply  # operator bundle
set -euo pipefail

BLUE="\033[0;34m"; GREEN="\033[0;32m"; YELLOW="\033[0;33m"; RED="\033[0;31m"; RESET="\033[0m"
info() { echo -e "  ${BLUE}·${RESET} $1"; }
ok()   { echo -e "  ${GREEN}✓${RESET} $1"; }
warn() { echo -e "  ${YELLOW}!${RESET} $1"; }
err()  { echo -e "  ${RED}✗${RESET} $1" >&2; }
step() { echo ""; echo -e "${BLUE}═══ $1 ═══${RESET}"; }

[ -d ".git" ] || { err "run from repo root"; exit 1; }
DATE=""; APPLY=0
while [ $# -gt 0 ]; do case "$1" in
  --date) DATE="$2"; shift 2;;
  --apply) APPLY=1; shift;;
  *) shift;;
esac; done
[ -n "$DATE" ] || DATE=$(TZ=America/New_York date -v-1d '+%Y-%m-%d' 2>/dev/null || TZ=America/New_York date -d 'yesterday' '+%Y-%m-%d')
PY="$([ -d pipeline/.venv ] && echo pipeline/.venv/bin/python || echo python3)"
BUNDLE="app/public/data/world-cup/settlement/${DATE}.official-input.json"

step "0/4  Soccer settlement · $DATE · $([ "$APPLY" = 1 ] && echo APPLY || echo DRY-RUN)"

# ── 1) Official results (operator bundle, else live fetch). API-unavailable → NO-OP. ───────────────
step "1/4  Official FT results"
if [ -n "${OFFICIAL:-}" ] && [ -f "${OFFICIAL:-}" ]; then
  cp "$OFFICIAL" "$BUNDLE"; ok "using operator-supplied bundle: $OFFICIAL"
elif [ -n "${API_FOOTBALL_KEY:-}" ]; then
  if $PY pipeline/fetch_official_soccer.py --date "$DATE" > "$BUNDLE" 2>/tmp/gtp_fetch_soccer.err && ! grep -q '"error"' "$BUNDLE"; then
    ok "fetched official FT results from API-Football"
  else
    warn "official fetch unavailable ($(head -1 /tmp/gtp_fetch_soccer.err 2>/dev/null)) — NO-OP, nothing written"; rm -f "$BUNDLE"; exit 0
  fi
else
  warn "no API_FOOTBALL_KEY and no OFFICIAL bundle — NO-OP, nothing written (settlement gated on official finals)"; exit 0
fi

# Gate: count officially-FINAL (FT) matches. Zero finals → NO-OP (nothing to settle yet).
FT_COUNT=$($PY -c "import json,sys; d=json.load(open('$BUNDLE')); print(sum(1 for m in d.get('matches',[]) if str(m.get('status','')).upper()=='FT'))" 2>/dev/null || echo 0)
info "officially-final (FT) matches: $FT_COUNT"
[ "$FT_COUNT" -gt 0 ] || { warn "no FT matches yet — NO-OP (partial/early run)"; rm -f "$BUNDLE"; exit 0; }

# ── 2) Grade + persist history (idempotent; NEVER touches money). ──────────────────────────────────
step "2/4  Grade + persist (history/ledgers only)"
npx tsx app/scripts/persist-soccer-settlement.mjs --date "$DATE" --official "$BUNDLE"

# ── 3) Apply the seed model (idempotent — skips already-settled steps). ─────────────────────────────
step "3/4  Seed-model settlement (Bank Builder bankroll + ladder)"
if [ "$APPLY" = 1 ]; then
  npx tsx app/scripts/settle-daily-portfolio.mjs --date "$DATE" --apply
else
  npx tsx app/scripts/settle-daily-portfolio.mjs --date "$DATE"   # dry-run
fi

# ── 4) Reconcile derived ledgers (pure rebuild from the artifacts). ─────────────────────────────────
step "4/5  Reconcile Mr. Dub ledger"
if [ "$APPLY" = 1 ]; then
  npx tsx scripts/build-mr-dub-ledger.mjs --now "${DATE}T18:00:00Z"
  ok "settlement applied + reconciled for $DATE"
else
  info "dry-run — ledger not rebuilt (no --apply)"
fi

# ── 5) Money-integrity GATE — fail loudly on any corrupted bankroll (never publish on bad money). ───
step "5/5  Money-integrity gate"
if [ "$APPLY" = 1 ]; then
  npx tsx app/scripts/verify-money-integrity.mjs || { err "MONEY-INTEGRITY GATE FAILED — settlement produced an inconsistent bankroll. Investigate before publishing."; exit 1; }
else
  info "dry-run — money gate runs on --apply"
fi
echo ""; ok "soccer settlement pipeline complete · $DATE · FT=$FT_COUNT · $([ "$APPLY" = 1 ] && echo APPLIED || echo DRY-RUN)"
