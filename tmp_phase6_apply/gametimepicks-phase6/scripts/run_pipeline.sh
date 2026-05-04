#!/usr/bin/env bash
# ============================================================================
# GametimePicks — run the daily pipeline.
#
# Usage:
#     bash scripts/run_pipeline.sh [DATE]
#
# DATE is optional and defaults to today (in TIMEZONE from .env).
#
# What this does:
#   1. Activates pipeline/.venv (creates it if missing)
#   2. Installs requirements
#   3. Loads .env (if present)
#   4. Generates today's board → app/public/data/*.json
#   5. Settles yesterday's pending leans (no-op in demo mode)
#
# This script works WITHOUT API keys — falls through to demo provider.
# Set ODDS_API_KEY in .env to enable live data.
# ============================================================================

set -e

DATE_ARG="${1:-}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo ""
echo "=========================================="
echo "  GametimePicks — daily pipeline"
echo "  date: ${DATE_ARG:-today}"
echo "=========================================="
echo ""

# 1. venv
if [ ! -d "pipeline/.venv" ]; then
    echo "[1/4] Creating pipeline venv..."
    python3 -m venv pipeline/.venv
else
    echo "[1/4] venv exists."
fi

# shellcheck disable=SC1091
source pipeline/.venv/bin/activate

# 2. requirements
echo ""
echo "[2/4] Installing requirements..."
pip install --upgrade pip --quiet
pip install -r pipeline/requirements.txt --quiet

# 3. generate board
echo ""
echo "[3/4] Generating model board..."
if [ -n "$DATE_ARG" ]; then
    python -m pipeline.generate_daily_board --date "$DATE_ARG"
else
    python -m pipeline.generate_daily_board
fi

# 4. settle yesterday's pending leans
echo ""
echo "[4/4] Settling pending leans..."
python -m pipeline.settle_results || echo "  (settle skipped — demo mode or nothing to settle)"

echo ""
echo "=========================================="
echo "  Pipeline complete."
echo "  Outputs: app/public/data/"
echo "  Build the frontend: cd app && npm run build"
echo "=========================================="
