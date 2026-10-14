#!/bin/sh
# Reproduce the MLB-001 audit. READ-ONLY against the repo; reads origin/main via git only.
# Usage: sh run_all.sh /path/to/gametimepicks   (default: /Users/yashwantbalaji/Downloads/gametimepicks)
set -e
REPO="${1:-/Users/yashwantbalaji/Downloads/gametimepicks}"
cd "$(dirname "$0")"
git -C "$REPO" fetch -q origin
python3 -I extract.py "$REPO"
python3 -I audit.py "$REPO" > out/audit_stdout.json
python3 -I crosscheck.py
python3 -I player_check.py "$REPO" > /dev/null
echo "outputs in $(pwd)/out"
