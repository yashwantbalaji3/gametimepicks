#!/bin/bash
# Install / uninstall the clean-export LaunchAgent. No sudo.
#   install-nba-clean.sh install TOOL_COMMIT [--import-root DIR] [--evidence-root DIR] [--label-suffix S]
#   install-nba-clean.sh uninstall [--label-suffix S]
# Temp-root test: --import-root <tmp>/graphics --evidence-root <tmp>/evidence --label-suffix test (a separate label, so the
# live agent, if any, is untouched). GTP_PLIST_ONLY=FILE writes and lints the plist to FILE and stops.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ACT="${1:?install|uninstall}"; shift
TOOL=""; [ "$ACT" = install ] && { TOOL="${1:?tool commit}"; shift; }
ROOT="$HOME/gtp-private/graphics"; EVR="$HOME/gtp-evidence"; SUF=""
while [ $# -gt 0 ]; do case "$1" in
  --import-root) ROOT="$2"; shift 2;; --evidence-root) EVR="$2"; shift 2;; --label-suffix) SUF="-$2"; shift 2;;
  *) echo "unknown $1" >&2; exit 2;; esac; done
LABEL="com.gametimepicks.nba-clean$SUF"
PL="$HOME/Library/LaunchAgents/$LABEL.plist"
if [ "$ACT" = uninstall ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PL"; echo "removed $LABEL"; exit 0
fi
[ -n "${GTP_PLIST_ONLY:-}" ] && PL="$GTP_PLIST_ONLY"
if [ -z "${GTP_PLIST_ONLY:-}" ]; then
  mkdir -p "$HOME/gtp-runner/nba-slate/bin" "$EVR/nba-clean" "$ROOT/approvals" "$HOME/Library/LaunchAgents"
  cp "$HERE/../nba-clean-runner.sh" "$HOME/gtp-runner/nba-slate/bin/nba-clean-runner.sh"
fi
sed -e "s#__HOME__#$HOME#g" -e "s#__LABEL__#$LABEL#g" -e "s#__TOOL_COMMIT__#$TOOL#g" -e "s#__IMPORT_ROOT__#$ROOT#g" -e "s#__EVIDENCE_ROOT__#$EVR#g" \
  "$HERE/com.gametimepicks.nba-clean.plist.template" > "$PL"
plutil -lint "$PL"
[ -n "${GTP_PLIST_ONLY:-}" ] && exit 0
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PL"
echo "installed $LABEL: tool $TOOL, import root $ROOT, evidence $EVR"
