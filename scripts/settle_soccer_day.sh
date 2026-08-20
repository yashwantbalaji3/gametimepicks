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
# tsx resolves the `@/…` path alias from the tsconfig it discovers at its CWD. We invoke app/scripts/*.mjs
# from the REPO ROOT (where there is no `@/` mapping), so the settlement grading graph (soccer-markets.ts →
# leg-settlement.ts, etc.) fails to resolve `@/lib/...`. Pin tsx to app/tsconfig.json so the alias resolves
# regardless of cwd. (.git guard above guarantees PWD = repo root.)
export TSX_TSCONFIG_PATH="$PWD/app/tsconfig.json"

step "0/4  Soccer settlement · $DATE · $([ "$APPLY" = 1 ] && echo APPLY || echo DRY-RUN)"

# ── 1) Official results (operator bundle, else live fetch). API-unavailable → NO-OP. ───────────────
step "1/4  Official FT results"
if [ -n "${OFFICIAL:-}" ] && [ -f "${OFFICIAL:-}" ]; then
  # VALIDATE the operator bundle before trusting it as official truth (audit P1-11): it must be valid JSON
  # with a non-empty matches[] array carrying status fields. Refuse garbage rather than settle against it —
  # this is the one path where a hand-supplied file moves paper money, so it must be structurally sound.
  $PY - "$OFFICIAL" <<'PYEOF' || die "OFFICIAL bundle failed validation — refusing to settle against a malformed/empty results file. Fix the bundle and re-run."
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception as e:
    print(f"  not valid JSON: {e}"); sys.exit(1)
ms = d.get("matches")
if not isinstance(ms, list) or not ms:
    print("  no non-empty matches[] array"); sys.exit(1)
if not any(isinstance(m, dict) and m.get("status") for m in ms):
    print("  no match carries a status field"); sys.exit(1)
sys.exit(0)
PYEOF
  cp "$OFFICIAL" "$BUNDLE"; ok "using operator-supplied bundle: $OFFICIAL ($($PY -c "import json,sys;print(len(json.load(open('$OFFICIAL')).get('matches',[])))") matches, validated)"
elif [ -n "${API_FOOTBALL_KEY:-}" ]; then
  if $PY pipeline/fetch_official_soccer.py --date "$DATE" > "$BUNDLE" 2>/tmp/gtp_fetch_soccer.err && ! grep -q '"error"' "$BUNDLE"; then
    ok "fetched official FT results from API-Football"
  else
    warn "official fetch unavailable ($(head -1 /tmp/gtp_fetch_soccer.err 2>/dev/null)) — NO-OP, nothing written"; rm -f "$BUNDLE"; exit 0
  fi
else
  warn "no API_FOOTBALL_KEY and no OFFICIAL bundle — NO-OP, nothing written (settlement gated on official finals)"; exit 0
fi

# Gate: count matches whose 90' result is final — FT, or a knockout decided in extra time (AET) /
# penalties (PEN). Zero 90'-final → NO-OP (nothing to settle yet). PEN/AET count: the 90' score settles
# the team markets (player props still pend per the engine policy unless certain), so a knockout-heavy
# slate is no longer skipped just because nothing finished in regulation.
FT_COUNT=$($PY -c "import json,sys; d=json.load(open('$BUNDLE')); print(sum(1 for m in d.get('matches',[]) if str(m.get('status','')).upper() in ('FT','AET','PEN')))" 2>/dev/null || echo 0)
info "90'-final (FT/AET/PEN) matches: $FT_COUNT"
[ "$FT_COUNT" -gt 0 ] || { warn "no 90'-final matches yet — NO-OP (partial/early run)"; rm -f "$BUNDLE"; exit 0; }

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
step "4/6  Reconcile Mr. Dub ledger"
if [ "$APPLY" = 1 ]; then
  npx tsx app/scripts/build-mr-dub-ledger.mjs --now "${DATE}T18:00:00Z"
  ok "settlement applied + reconciled for $DATE"
else
  info "dry-run — ledger not rebuilt (no --apply)"
fi

# ── 5) Roll the daily portfolio forward so activeBankroll tracks the NEW canonical bankroll. ─────────
# ROOT-CAUSE FIX (2026-07-06): settling active lanes moves portfolio.json's bankroll, but the derived
# daily-portfolio.json still advertised the PRE-settlement activeBankroll — and verify-money-integrity's
# `daily=canonical-bankroll` invariant (step 6) then failed with exit 1, so BOTH nightly-settle and
# daily-lifecycle aborted overnight and produced no commit. We regenerate the daily portfolio for TODAY
# in ET (the roll-forward day) right here: the date-gated approved card no longer matches "today", so no
# stale settled lane resurfaces — the portfolio simply reflects the new bankroll with whatever is
# genuinely active today (an empty/no-play portfolio until today's card is approved). Fatal on failure:
# a stale daily portfolio must never slip past to the money gate.
step "5/6  Roll daily portfolio forward (activeBankroll ← new canonical bankroll)"
if [ "${GTP_SKIP_ROLL:-0}" = "1" ]; then
  # The CALLER owns the roll. nightly-settle sets this because the roll must happen AFTER the MLB
  # prop settler (which requires daily-portfolio to still be dated YESTERDAY), and because this
  # script runs under continue-on-error there — a roll buried in a step that is allowed to fail is
  # a roll that silently does not happen, which is exactly how the portfolio froze at 2026-08-18.
  info "roll-forward skipped — the caller performs it after settlement (GTP_SKIP_ROLL=1)"
elif [ "$APPLY" = 1 ]; then
  ROLL_DATE=$(TZ=America/New_York date +%F)
  npx tsx app/scripts/activate-daily-portfolio.mjs --date "$ROLL_DATE" --apply \
    || { err "daily-portfolio roll-forward FAILED for $ROLL_DATE — refusing to gate on a stale portfolio."; exit 1; }
  ok "daily portfolio rolled forward to $ROLL_DATE (activeBankroll now tracks canonical)"
else
  info "dry-run — daily portfolio not rolled (no --apply)"
fi

# ── 6) Money-integrity GATE — fail loudly on any corrupted bankroll (never publish on bad money). ───
step "6/6  Money-integrity gate"
if [ "$APPLY" = 1 ]; then
  npx tsx app/scripts/verify-money-integrity.mjs || { err "MONEY-INTEGRITY GATE FAILED — settlement produced an inconsistent bankroll. Investigate before publishing."; exit 1; }
  npx tsx app/scripts/forensic-money-audit.mjs >/dev/null || { err "FORENSIC MONEY AUDIT FAILED — a displayed value no longer reconciles to the canonical \$100→bankroll journey."; exit 1; }
  npx tsx app/scripts/health-check.mjs --today "$(TZ=America/New_York date +%F)" >/dev/null || { err "HEALTH CHECK FAILED — canonical data missing/stale/duplicated/non-reconciling. Aborting before publish."; exit 1; }
  # Heartbeat + (optional) external notification on a clean applied settlement (audit P0-2).
  ( cd app && node scripts/ops-notify.mjs --status pass --phase "settle $DATE" --message "$FT_COUNT FT match(es) settled, money gate green" ) >/dev/null 2>&1 || true
else
  info "dry-run — money gate runs on --apply"
fi
echo ""; ok "soccer settlement pipeline complete · $DATE · FT=$FT_COUNT · $([ "$APPLY" = 1 ] && echo APPLIED || echo DRY-RUN)"
