#!/usr/bin/env bash
# Phase 7B-3 — Check ODDS_API_KEY without burning credits.
#
# Thin wrapper around `python -m pipeline.check_odds_key`. Picks up the
# project venv if present, otherwise falls back to system python3.
#
# Usage:
#   bash scripts/check_odds_key.sh
#   bash scripts/check_odds_key.sh --verbose

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

if [ -d "pipeline/.venv" ]; then
    PY="pipeline/.venv/bin/python"
else
    PY="python3"
fi

exec $PY -m pipeline.check_odds_key "$@"
