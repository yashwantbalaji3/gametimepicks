#!/bin/bash
# Install / uninstall the user LaunchAgent for one NBA slate. No sudo.
#   install-nba-slate.sh install DATE TOOL_COMMIT [--first-utc HH] [--last-utc HH] [--import-root DIR] [--top5-min-rows N]
#   install-nba-slate.sh uninstall DATE
# Hours are UTC on DATE (default 07 to 15); they are written as local hours for launchd.
# GTP_PLIST_ONLY=FILE writes and lints the plist to FILE and stops (no copy, no launchctl).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ACT="${1:?install|uninstall}"; DATE="${2:?date}"
LABEL="com.gametimepicks.nba-slate-$DATE"
PL="$HOME/Library/LaunchAgents/$LABEL.plist"
if [ "$ACT" = uninstall ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PL"; echo "removed $LABEL"; exit 0
fi
TOOL="${3:?tool commit}"; shift 3
FIRST=07; LAST=15; ROOT="$HOME/gtp-private/graphics"; MIN=5
while [ $# -gt 0 ]; do case "$1" in
  --first-utc) FIRST="$2"; shift 2;; --last-utc) LAST="$2"; shift 2;;
  --import-root) ROOT="$2"; shift 2;; --top5-min-rows) MIN="$2"; shift 2;;
  *) echo "unknown $1" >&2; exit 2;; esac; done
HOURS=""
for h in $(seq "$((10#$FIRST))" "$((10#$LAST))"); do
  L=$(date -j -f "%Y-%m-%d %H:%M %z" "$DATE $(printf %02d "$h"):00 +0000" "+%m %d %H")
  read -r MO DA HO <<< "$L"
  HOURS="$HOURS<dict><key>Month</key><integer>$((10#$MO))</integer><key>Day</key><integer>$((10#$DA))</integer><key>Hour</key><integer>$((10#$HO))</integer><key>Minute</key><integer>0</integer></dict>"
done
[ -n "${GTP_PLIST_ONLY:-}" ] && PL="$GTP_PLIST_ONLY"
[ -z "${GTP_PLIST_ONLY:-}" ] && mkdir -p "$HOME/gtp-runner/nba-slate/bin" "$HOME/gtp-evidence/nba-slate-$DATE" "$HOME/Library/LaunchAgents"
[ -z "${GTP_PLIST_ONLY:-}" ] && cp "$HERE/../nba-slate-runner.sh" "$HOME/gtp-runner/nba-slate/bin/nba-slate-runner.sh"
sed -e "s#__HOME__#$HOME#g" -e "s#__DATE__#$DATE#g" -e "s#__TOOL_COMMIT__#$TOOL#g" -e "s#__IMPORT_ROOT__#$ROOT#g" \
    -e "s#__NOT_AFTER__#${DATE}T$(printf %02d "$((10#$LAST))"):00:00Z#g" -e "s#__MIN_ROWS__#$MIN#g" -e "s#__HOURS__#$HOURS#" \
    "$HERE/com.gametimepicks.nba-slate.plist.template" > "$PL"
plutil -lint "$PL"
[ -n "${GTP_PLIST_ONLY:-}" ] && exit 0
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PL"
echo "installed $LABEL: $(printf %02d "$((10#$FIRST))"):00Z to $(printf %02d "$((10#$LAST))"):00Z on $DATE, import root $ROOT"
