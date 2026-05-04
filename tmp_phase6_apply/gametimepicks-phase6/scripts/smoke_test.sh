#!/usr/bin/env bash
# ============================================================================
# GametimePicks — smoke test
#
# Verifies that the project is in a runnable state. Designed to be cheap
# and idempotent. Run it before pushing to GitHub or deploying to Vercel.
#
# Checks:
#   1. Pipeline runs end-to-end without errors (demo mode)
#   2. All required JSON files exist in app/public/data/
#   3. All JSON files parse cleanly
#   4. meta.json has the keys the frontend expects
#   5. board.json has at least one lean
#   6. Required public assets exist
#
# Exits non-zero on first failure. Usage:
#     bash scripts/smoke_test.sh
# ============================================================================

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PASS="\033[0;32m✓\033[0m"
FAIL="\033[0;31m✗\033[0m"
INFO="\033[0;34m·\033[0m"

ok()   { echo -e "  ${PASS} $1"; }
err()  { echo -e "  ${FAIL} $1" >&2; exit 1; }
info() { echo -e "  ${INFO} $1"; }

echo ""
echo "=========================================="
echo "  GametimePicks — smoke test"
echo "=========================================="

# ---------------------------------------------------------------------------
# 1. Pipeline runs end-to-end (demo mode forced)
# ---------------------------------------------------------------------------
echo ""
echo "[1/5] Pipeline run (demo mode)"

# Force demo mode so this works without API keys / nba_api
export NBA_DATA_MODE=demo
export ODDS_DATA_MODE=demo

if python3 -m pipeline.generate_daily_board > /tmp/gtp_smoke.log 2>&1; then
    ok "pipeline ran without errors"
else
    cat /tmp/gtp_smoke.log
    err "pipeline failed"
fi

# ---------------------------------------------------------------------------
# 2. Required JSON files exist
# ---------------------------------------------------------------------------
echo ""
echo "[2/5] Required JSON files"

REQUIRED_FILES=(
    "app/public/data/board.json"
    "app/public/data/schedule.json"
    "app/public/data/players.json"
    "app/public/data/odds_props.json"
    "app/public/data/trends.json"
    "app/public/data/meta.json"
    "app/public/data/hit_rates.json"
)

for f in "${REQUIRED_FILES[@]}"; do
    if [ -f "$f" ]; then
        size=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null)
        ok "$f (${size} bytes)"
    else
        err "missing: $f"
    fi
done

# ---------------------------------------------------------------------------
# 3. JSON files parse
# ---------------------------------------------------------------------------
echo ""
echo "[3/5] JSON validity"

for f in "${REQUIRED_FILES[@]}"; do
    if python3 -c "import json; json.load(open('$f'))" 2>/dev/null; then
        ok "$f parses"
    else
        err "$f does not parse as JSON"
    fi
done

# ---------------------------------------------------------------------------
# 4. Frontend contract — meta.json + board.json shape
# ---------------------------------------------------------------------------
echo ""
echo "[4/5] Frontend data contract"

python3 << 'PYEOF' || err "frontend contract check failed"
import json, sys

# meta.json must have these keys for the DataSourceBadge to render correctly
meta = json.load(open("app/public/data/meta.json"))
required_meta = [
    "appName", "version", "lastPipelineRun", "isDemo",
    "dataMode", "nbaScheduleSource", "oddsSource",
    "providerStatuses", "fallbackSourcesAvailable",
]
missing = [k for k in required_meta if k not in meta]
if missing:
    print(f"  ✗ meta.json missing keys: {missing}", file=sys.stderr)
    sys.exit(1)

# providerStatuses should have at least 4 entries (2 nba + 2 odds at minimum)
if len(meta.get("providerStatuses", [])) < 4:
    print(f"  ✗ meta.json providerStatuses too short: {len(meta.get('providerStatuses', []))}", file=sys.stderr)
    sys.exit(1)

# board.json must have at least 1 lean
board = json.load(open("app/public/data/board.json"))
if not board.get("leans"):
    print("  ✗ board.json has no leans", file=sys.stderr)
    sys.exit(1)

# Each lean must have the fields PropCard reads
required_lean = [
    "id", "date", "tipoff", "playerId", "playerName", "team", "opponent",
    "homeAway", "market", "line", "oddsOver", "oddsUnder",
    "projection", "modelProbability", "impliedProbability", "edgePct",
    "lean", "confidence", "reason", "status",
]
sample = board["leans"][0]
missing = [k for k in required_lean if k not in sample]
if missing:
    print(f"  ✗ board.json lean missing keys: {missing}", file=sys.stderr)
    sys.exit(1)

# trends.json must have players (frontend renders empty state if not)
trends = json.load(open("app/public/data/trends.json"))
if not isinstance(trends.get("players"), list):
    print("  ✗ trends.json missing 'players' list", file=sys.stderr)
    sys.exit(1)

print(f"  ✓ meta.json has {len(required_meta)} required keys")
print(f"  ✓ meta.json providerStatuses: {len(meta['providerStatuses'])} entries")
print(f"  ✓ board.json has {len(board['leans'])} leans")
print(f"  ✓ board.json sample lean has all {len(required_lean)} required fields")
print(f"  ✓ trends.json has {len(trends['players'])} players")
PYEOF

# ---------------------------------------------------------------------------
# 5. Public-facing files exist
# ---------------------------------------------------------------------------
echo ""
echo "[5/5] Required public files"

REQUIRED_PUBLIC=(
    "README.md"
    "LICENSE"
    ".env.example"
    ".gitignore"
    "app/package.json"
    "app/tsconfig.json"
    "app/next.config.mjs"
    "app/tailwind.config.ts"
    "pipeline/requirements.txt"
    "scripts/run_pipeline.sh"
    "docs/deploy.md"
    "docs/project_brief.md"
    "docs/portfolio_integration.md"
    "docs/screenshots.md"
    "docs/social_templates.md"
)

for f in "${REQUIRED_PUBLIC[@]}"; do
    if [ -f "$f" ]; then
        ok "$f"
    else
        err "missing: $f"
    fi
done

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo "=========================================="
echo "  smoke test PASSED"
echo "=========================================="
echo ""
info "next: cd app && npm run typecheck && npm run build"
echo ""
