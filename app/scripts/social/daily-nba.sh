#!/usr/bin/env bash
# Daily NBA recap + game-day library. Safe from cron/launchd: fixes its own working directory and PATH, and leaves a
# FAILED report even when node itself cannot start. GTP_ODDS_DISPLAY_KEY comes from the environment, never an argument.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")/../.." || exit 1
day="$(TZ=America/New_York date +%F)"
npx tsx scripts/social/daily-nba.mjs "$@"
code=$?
reports="$HOME/gtp-private/graphics/reports"
if [ "$code" -ne 0 ] && [ ! -f "$reports/FAILED-$day.json" ]; then
  mkdir -p "$reports"
  printf '{"date":"%s","reasons":["daily-nba exited %s before writing a report"]}\n' "$day" "$code" > "$reports/FAILED-$day.json"
fi
exit "$code"
