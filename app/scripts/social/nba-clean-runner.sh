#!/bin/bash
# UNATTENDED CLEAN EXPORT of founder-approved NBA slate packages (launchd-safe; no AI, no paid call, no sudo, posts nothing).
#
#   nba-clean-runner.sh run       one pass (launchd: WatchPaths on the approvals file + a 120 s StartInterval backstop)
#
# Env: GTP_TOOL_COMMIT (pinned claude/p2-social-pack commit), GTP_IMPORT_ROOT (default ~/gtp-private/graphics),
# GTP_RUNNER_HOME (default ~/gtp-runner/nba-slate; its repo/ clone must be set up by nba-slate-runner.sh setup),
# GTP_EVIDENCE_ROOT (default ~/gtp-evidence; where the slate runner's DELIVERED markers are, and where this logs).
#
# One pass: no approvals file -> nothing. Unchanged approvals file since the last good pass -> nothing. Otherwise, for each
# slate date named by an approved entry that the slate runner DELIVERED: a separate worktree of the runner clone (so a slate
# attempt in repo/ is never disturbed) at the pinned tool commit, data from that delivery's dataCommit, the delivery's
# unified roster, then scripts/social/nba-slate-clean.mts. That script writes temp-then-rename into packages/, never rewrites
# an export that exists, and logs each outcome to <import-root>/approvals/clean-export-log.jsonl.
# Exit: 0 done or nothing to do; 4 setup, fetch or checkout failed; 7 a date's export run failed.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
[ "${1:-}" = run ] || { echo "usage: $0 run" >&2; exit 2; }
TOOL="${GTP_TOOL_COMMIT:?}"
RH="${GTP_RUNNER_HOME:-$HOME/gtp-runner/nba-slate}"; R="$RH/repo"; W="$RH/clean-wt"
IMPORT_ROOT="${GTP_IMPORT_ROOT:-$HOME/gtp-private/graphics}"
EVR="${GTP_EVIDENCE_ROOT:-$HOME/gtp-evidence}"
EV="$EVR/nba-clean"; mkdir -p "$EV"; LOG="$EV/runner.log"
APPROVALS="$IMPORT_ROOT/approvals/approved-for-clean-export.json"
log() { echo "$(date -u +%FT%TZ) $*" >> "$LOG"; }
finish() { [ "$1" = 0 ] && [ "$2" = quiet ] || log "EXIT $1 $2"; [ -n "${LOCKED:-}" ] && { rm -f "$EV/.lock/pid"; rmdir "$EV/.lock" 2>/dev/null; }; exit "$1"; }

[ -f "$APPROVALS" ] || exit 0
STAMP=$(shasum -a 256 "$APPROVALS" | cut -c1-64)
[ "$(cat "$EV/.last-good" 2>/dev/null)" = "$STAMP:$TOOL" ] && exit 0
if ! mkdir "$EV/.lock" 2>/dev/null; then
  AGE=$(( $(date +%s) - $(stat -f %m "$EV/.lock" 2>/dev/null || date +%s) ))
  if [ "$AGE" -lt 1800 ]; then exit 0; fi
  log "reclaiming stale $EV/.lock (${AGE}s old, holder $(cat "$EV/.lock/pid" 2>/dev/null || echo unknown))"
  rm -f "$EV/.lock/pid"; rmdir "$EV/.lock" 2>/dev/null
  mkdir "$EV/.lock" 2>/dev/null || exit 0
fi
LOCKED=1; echo $$ > "$EV/.lock/pid"
log "pass: approvals $STAMP tool $TOOL import-root $IMPORT_ROOT"

DATES=$(node -e '
  const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const e = Array.isArray(d) ? d : d.approved ?? d.entries ?? [];
  console.log([...new Set(e.map((x) => String(x.dedupeId).match(/^gtp-social:nba:(\d{4}-\d{2}-\d{2}):/)?.[1]).filter(Boolean))].sort().join(" "));
' "$APPROVALS" 2>> "$LOG") || finish 4 "approvals file unreadable"
[ -n "$DATES" ] || { echo "$STAMP:$TOOL" > "$EV/.last-good"; finish 0 "no NBA entries"; }

[ -d "$R/.git" ] || finish 4 "runner clone missing ($R); run nba-slate-runner.sh setup"
git -C "$R" fetch -q --depth 1 --filter=blob:none origin "$TOOL" >> "$LOG" 2>&1 || finish 4 "fetch tool commit failed"
if [ ! -d "$W/.git" ] && [ ! -f "$W/.git" ]; then git -C "$R" worktree add -q --detach "$W" "$TOOL" >> "$LOG" 2>&1 || finish 4 "worktree add failed"; fi
git -C "$W" reset -q --hard >> "$LOG" 2>&1
git -C "$W" checkout -q -f --detach "$TOOL" >> "$LOG" 2>&1 || finish 4 "checkout tool commit failed"
[ -e "$W/app/node_modules" ] || ln -s "$R/app/node_modules" "$W/app/node_modules"

RC=0
for D in $DATES; do
  M="$EVR/nba-slate-$D/DELIVERED"
  [ -f "$M" ] || { log "$D: no slate delivery marker ($M); skipped"; continue; }
  DC=$(sed -n 's/^dataCommit //p' "$M"); RUNDIR=$(dirname "$(sed -n 's/^report //p' "$M")")
  ROSTER="$RUNDIR/roster/roster.json"
  [ -f "$ROSTER" ] || { log "$D: roster missing at $ROSTER"; RC=7; continue; }
  git -C "$R" fetch -q --depth 1 --filter=blob:none origin "$DC" >> "$LOG" 2>&1 || { log "$D: fetch data commit $DC failed"; RC=4; continue; }
  git -C "$W" clean -fdq -- app/public/data data >> "$LOG" 2>&1
  git -C "$W" checkout -q "$DC" -- app/public/data/nba data/internal/research/nba >> "$LOG" 2>&1 || { log "$D: data from $DC failed"; RC=4; continue; }
  (cd "$W/app" && GTP_NBA_UNIFIED_ROSTER="$ROSTER" npx tsx scripts/social/nba-slate-clean.mts --date "$D" --import-root "$IMPORT_ROOT") >> "$LOG" 2>&1 \
    || { log "$D: clean export run failed or a render/write failed (retried next pass)"; RC=7; continue; }
  log "$D: pass done (data $DC)"
done
git -C "$W" reset -q --hard >> "$LOG" 2>&1
[ $RC -eq 0 ] && echo "$STAMP:$TOOL" > "$EV/.last-good"
finish $RC "pass complete"
