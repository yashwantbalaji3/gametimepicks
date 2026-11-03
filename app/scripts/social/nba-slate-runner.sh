#!/bin/bash
# UNATTENDED NBA SLATE RUN (launchd-safe; no AI, no paid call, no sudo).
#
#   nba-slate-runner.sh setup          one-time: a sparse blobless clone of the public repo under $GTP_RUNNER_HOME
#                                      (outside ~/Downloads, which launchd jobs may not be allowed to read) + npm ci
#   nba-slate-runner.sh run            one attempt (launchd calls this hourly)
#
# Env: GTP_SLATE_DATE (ET date), GTP_TOOL_COMMIT (pinned claude/p2-social-pack commit), GTP_IMPORT_ROOT (default
# ~/gtp-private/graphics), GTP_NOT_AFTER (ISO, default <date>T15:00:00Z), GTP_TOP5_MIN_ROWS (default 5),
# GTP_RUNNER_HOME (default ~/gtp-runner/nba-slate), GTP_LAUNCHD_LABEL (unloads itself after delivery when set),
# GTP_AS_OF (tests only; refused for the live import folder).
#
# One attempt: fetch origin main -> refuse unless the lane for the date is on it -> code at the pinned commit, data from
# origin/main -> unified roster (free ESPN) -> build, QA and deliver (scripts/social/nba-slate-deliver.mts). Logs and
# per-attempt folders go to ~/gtp-evidence/nba-slate-<date>/. A DELIVERED marker stops every later attempt.
# Exit: 0 delivered or nothing to do; 3 lane not on origin/main; 4 setup or fetch failed; 5 ESPN inputs incomplete;
# 10/11 build refused or delivery failed (see the attempt's result.json).
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
REPO_URL="https://github.com/yashwantbalaji3/gametimepicks.git"
RH="${GTP_RUNNER_HOME:-$HOME/gtp-runner/nba-slate}"
R="$RH/repo"

if [ "${1:-}" = setup ]; then
  set -e
  mkdir -p "$RH"
  if [ ! -d "$R/.git" ]; then
    git clone --filter=blob:none --no-checkout --depth 1 "$REPO_URL" "$R"
    git -C "$R" sparse-checkout set --no-cone '/*' '!/*/' '/app/' '!/app/public/data/' '/app/public/data/nba/' \
      '/data/internal/research/nba/prop-grades/' '/data/internal/research/nba/experimental/boxscores/' '/data/internal/research/nba/experimental-v0.1/forecasts/'
  fi
  git -C "$R" fetch -q --depth 1 --filter=blob:none origin "${GTP_TOOL_COMMIT:?}"
  git -C "$R" checkout -q -f --detach "$GTP_TOOL_COMMIT"
  (cd "$R/app" && npm ci --no-audit --no-fund --loglevel=error)
  echo "runner ready at $R ($(git -C "$R" rev-parse HEAD))"
  exit 0
fi
[ "${1:-}" = run ] || { echo "usage: $0 setup|run" >&2; exit 2; }

DATE="${GTP_SLATE_DATE:?}"; TOOL="${GTP_TOOL_COMMIT:?}"
IMPORT_ROOT="${GTP_IMPORT_ROOT:-$HOME/gtp-private/graphics}"
NOT_AFTER="${GTP_NOT_AFTER:-${DATE}T15:00:00Z}"
EV="$HOME/gtp-evidence/nba-slate-$DATE"; mkdir -p "$EV"
LOG="$EV/runner.log"
log() { echo "$(date -u +%FT%TZ) $*" >> "$LOG"; }
finish() { log "EXIT $1 $2"; [ -n "${LOCKED:-}" ] && rmdir "$EV/.lock" 2>/dev/null; exit "$1"; }

if [ -f "$EV/DELIVERED" ]; then log "already delivered ($(head -1 "$EV/DELIVERED")); nothing to do"; exit 0; fi
if [ "$(date -u +%s)" -gt "$(date -u -j -f %Y-%m-%dT%H:%M:%SZ "$NOT_AFTER" +%s)" ]; then log "past $NOT_AFTER; no attempt"; exit 0; fi
if ! mkdir "$EV/.lock" 2>/dev/null; then log "another attempt holds $EV/.lock; skipping"; exit 0; fi
LOCKED=1
log "attempt: date $DATE tool $TOOL import-root $IMPORT_ROOT"

[ -d "$R/.git" ] || finish 4 "runner not set up ($R); run: $0 setup"
git -C "$R" fetch -q --depth 1 --filter=blob:none origin main >> "$LOG" 2>&1 || finish 4 "fetch origin main failed"
MAIN=$(git -C "$R" rev-parse FETCH_HEAD)
LANE="app/public/data/nba/experimental-public/$DATE.json"
git -C "$R" cat-file -e "$MAIN:$LANE" 2>/dev/null || finish 3 "LANE_MISSING: $LANE not on origin/main $MAIN"
log "lane on origin/main $MAIN"

git -C "$R" fetch -q --depth 1 --filter=blob:none origin "$TOOL" >> "$LOG" 2>&1 || finish 4 "fetch tool commit failed"
git -C "$R" checkout -q -f --detach "$TOOL" >> "$LOG" 2>&1 || finish 4 "checkout tool commit failed"
git -C "$R" clean -fdq -- app/public/data data >> "$LOG" 2>&1
git -C "$R" checkout -q "$MAIN" -- app/public/data/nba data/internal/research/nba >> "$LOG" 2>&1 || finish 4 "data from origin/main failed"

RUN="$EV/attempt-$(date -u +%Y%m%dT%H%M%SZ)"; mkdir -p "$RUN"
log "attempt folder $RUN"
cd "$R/app" || finish 4 "no app dir"
node scripts/social/nba-unified-roster.mjs --date "$DATE" --out "$RUN/roster" > "$RUN/roster.log" 2>&1 || finish 5 "roster script failed (see $RUN/roster.log)"
# ESPN returns {} on outage; refuse thin inputs rather than render a slate without starters.
node -e '
  const [ri, ro, lane] = process.argv.slice(1).map((f) => JSON.parse(require("fs").readFileSync(f, "utf8")));
  const teams = lane.games.flatMap((g) => [g.away.abbr, g.home.abbr]);
  const bad = teams.filter((t) => !ri[t] || ri[t].starters.length < 5 || !Object.keys(ri[t].names).length || !ri[t].teamGames || !(ro[t] ?? []).length);
  if (bad.length) { console.error("ESPN inputs incomplete for " + bad.join(",")); process.exit(1); }
' "$RUN/roster/ready_in.json" "$RUN/roster/roster.json" "public/data/nba/experimental-public/$DATE.json" >> "$LOG" 2>&1 || finish 5 "ESPN_INPUTS_INCOMPLETE"

GTP_NBA_UNIFIED_ROSTER="$RUN/roster/roster.json" GTP_DATA_COMMIT="$MAIN" GTP_RENDER_CACHE="$EV/render-cache" \
  npx tsx scripts/social/nba-slate-deliver.mts --date "$DATE" --stage "$RUN" --import-root "$IMPORT_ROOT" \
  --top5-min-rows "${GTP_TOP5_MIN_ROWS:-5}" ${GTP_AS_OF:+--as-of "$GTP_AS_OF"} > "$RUN/deliver.log" 2>&1
RC=$?
[ $RC -eq 0 ] || finish $RC "build/deliver refused or failed: $(tail -1 "$RUN/deliver.log" | cut -c1-300)"

printf '%s\ndataCommit %s\ntool %s\nimport root %s\nreport %s\n' "$(date -u +%FT%TZ)" "$MAIN" "$TOOL" "$IMPORT_ROOT" "$RUN/report.md" > "$EV/DELIVERED"
log "DELIVERED: $(node -p 'const r=require(process.argv[1]);`${r.games.length} games, ${r.packages} packages, ${r.images} images`' "$RUN/result.json"); report $RUN/report.md"
[ -n "${GTP_LAUNCHD_LABEL:-}" ] && { log "unloading $GTP_LAUNCHD_LABEL"; rmdir "$EV/.lock"; launchctl bootout "gui/$(id -u)/$GTP_LAUNCHD_LABEL" 2>/dev/null; }
finish 0 "delivered"
