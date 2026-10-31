#!/usr/bin/env bash
# Sunday NFL render, after the capture. Safe from cron/launchd: fixes its own working directory and PATH, and leaves a
# FAILED report even when node itself cannot start. Uses saved captures only; reads no key.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")/../.." || exit 1
day="$(TZ=America/New_York date +%F)"
npx tsx scripts/social/daily-nfl.mjs "$@"
code=$?
reports="$HOME/gtp-private/graphics/reports"
if [ "$code" -ne 0 ] && [ ! -f "$reports/FAILED-nfl-$day.json" ]; then
  mkdir -p "$reports"
  printf '{"date":"%s","reasons":["daily-nfl exited %s before writing a report"]}\n' "$day" "$code" > "$reports/FAILED-nfl-$day.json"
fi
exit "$code"
