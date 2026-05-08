#!/usr/bin/env bash
# ============================================================================
# Operator settlement helper — Phase 17
#
# Walks through end-to-end settlement for a slate date with prompts at
# every step. Tries auto-fetch from nba_api first; falls back to a clean
# manual workflow if auto-fetch isn't available.
#
# Usage:
#   bash scripts/operator_settle.sh 2026-05-05
#
# What this DOES NOT do:
#   - Fabricate stats. If nba_api can't reach the box score and the
#     operator hasn't filled in the manual template, settlement aborts.
#   - Call the Odds API. Settlement uses official box scores only.
#   - Push to git. After successful settlement the script tells you what
#     to commit; you run git push yourself.
# ============================================================================

set -e

GREEN="\033[0;32m"; RED="\033[0;31m"; YELLOW="\033[0;33m"
BLUE="\033[0;34m"; DIM="\033[2m"; GOLD="\033[0;33m"; RESET="\033[0m"

ok()    { echo -e "  ${GREEN}✓${RESET} $1"; }
err()   { echo -e "  ${RED}✗${RESET} $1" >&2; }
warn()  { echo -e "  ${YELLOW}!${RESET} $1"; }
info()  { echo -e "  ${BLUE}·${RESET} $1"; }
step()  { echo ""; echo -e "${BLUE}═══ $1 ═══${RESET}"; }

if [ -z "$1" ]; then
    err "usage: bash scripts/operator_settle.sh YYYY-MM-DD"
    exit 1
fi

DATE="$1"
PIPELINE_VENV="pipeline/.venv"
[ -d "$PIPELINE_VENV" ] && PY="$PIPELINE_VENV/bin/python" || PY="python3"

step "1/5  Verify board exists for $DATE"
if [ ! -f "app/public/data/boards/${DATE}.json" ]; then
    err "no board file at app/public/data/boards/${DATE}.json"
    err "either the date is wrong, or the pipeline never ran for $DATE"
    exit 1
fi
LEANS=$($PY -c "import json; print(len(json.load(open('app/public/data/boards/${DATE}.json'))['leans']))")
ok "board exists · $LEANS leans on $DATE"

step "2/5  Generate / refresh settlement template"
TEMPLATE_PATH="pipeline/overrides/results_overrides.json"
EXISTING_DATE=""
if [ -f "$TEMPLATE_PATH" ]; then
    EXISTING_DATE=$($PY -c "import json; print(json.load(open('$TEMPLATE_PATH')).get('date', ''))" 2>/dev/null || echo "")
fi

if [ "$EXISTING_DATE" = "$DATE" ]; then
    info "template already targets $DATE"
    read -p "Regenerate (will overwrite existing operator work)? [y/N] " yn
    if [[ "$yn" =~ ^[Yy]$ ]]; then
        $PY -m pipeline.settle_template --date "$DATE" --force
        ok "template regenerated"
    else
        info "keeping existing template"
    fi
else
    $PY -m pipeline.settle_template --date "$DATE"
    ok "template generated"
fi

step "3/5  Fill in stats (operator manual step)"
echo ""
echo "  Open this file:"
echo -e "    ${GOLD}$TEMPLATE_PATH${RESET}"
echo ""
echo "  For each player, fill in PTS / REB / AST as integers from the"
echo "  final box score. Sources:"
echo "    · NBA.com box scores (most authoritative)"
echo "    · basketball-reference.com (easier UI)"
echo ""
echo "  Use null for any stat you can't verify — settlement will skip"
echo "  those rows rather than fabricate."
echo ""
read -p "Done filling in stats? [y/N] " yn
if [[ ! "$yn" =~ ^[Yy]$ ]]; then
    info "aborted — re-run when stats are filled in"
    exit 0
fi

# Sanity-check that at least one stat is non-null
NON_NULL_COUNT=$($PY -c "
import json
t = json.load(open('$TEMPLATE_PATH'))
n = 0
for g in t.get('games', []):
    for p in g.get('players', []):
        for k in ('PTS', 'REB', 'AST'):
            if p.get(k) is not None:
                n += 1
print(n)
" 2>/dev/null || echo "0")

if [ "$NON_NULL_COUNT" = "0" ]; then
    err "every stat in the template is still null. nothing to settle."
    err "fill in some stats first, then re-run."
    exit 1
fi
ok "$NON_NULL_COUNT non-null stat values found in template"

step "4/5  Run settlement"
if $PY -m pipeline.settle_results --date "$DATE" --manual-only; then
    ok "settlement complete"
else
    err "settlement failed — see error above"
    exit 2
fi

step "5/5  Export public results data"
if $PY -m pipeline.export_results; then
    ok "results exported to app/public/data/results/"
else
    err "export failed"
    exit 2
fi

# Show summary of what changed
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════${RESET}"
echo -e "${GREEN}  Settlement complete for $DATE${RESET}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${RESET}"
echo ""

if [ -f "app/public/data/results/lifetime_summary.json" ]; then
    SUMMARY=$($PY -c "
import json
s = json.load(open('app/public/data/results/lifetime_summary.json'))
print(f\"  total graded:     {s.get('totalDecisive', 0)}\")
print(f\"  wins:             {s.get('wins', 0)}\")
print(f\"  losses:           {s.get('losses', 0)}\")
print(f\"  pushes:           {s.get('pushes', 0)}\")
hr = s.get('hitRate')
if hr is not None:
    print(f\"  hit rate:         {hr * 100:.1f}%\")
" 2>/dev/null)
    echo "$SUMMARY"
    echo ""
fi

echo -e "${GOLD}Next steps:${RESET}"
echo ""
echo "  Verify locally:"
echo "    cd app && npm run dev"
echo "    Visit /results — should show $DATE with hit/miss counts"
echo ""
echo "  Commit + deploy:"
echo "    git add app/public/data/results/ pipeline/validation/"
echo "    git commit -m 'Settle slate $DATE'"
echo "    git push"
echo ""
echo "  If something's wrong, settlement is idempotent — fix the template"
echo "  and re-run this script. Existing settled rows for $DATE will be"
echo "  rewritten; other dates are preserved."
echo ""
