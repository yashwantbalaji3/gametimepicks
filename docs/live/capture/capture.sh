#!/bin/sh
# Live Hub acceptance capture — read-only evidence for one or more NFL events (v3, 2026-10-16).
# Reads ONLY our own Production gateway/pages, ESPN's free public summary (ground truth), origin/main via git and
# GitHub's deployment records via `gh api`. No writes to the repo, no workflow triggers, no paid calls.
#
#   sh capture.sh --events 401872996,401872999 --settle-date 2026-10-18 \
#                 --until <UTC ISO> --settle-until <UTC ISO> [--interval 300] [--once] \
#                 [--out <dir>] [--mirror <dir>] [--shot-every 3] [--no-shots]
#   Every flag can also come from the environment: EVENTS, SETTLE_DATE, INTERVAL, UNTIL, SETTLE_UNTIL, CAPTURE_OUT,
#   CAPTURE_MIRROR, SHOT_EVERY, NO_SHOTS=1, ONCE=1, PRE_MIN (60), POST_MIN (270), GH_DEPLOYMENTS (1), NO_FETCH=1 (tests),
#   GTP_BASE / ESPN_BASE (tests point them at a closed port), GTP_REPO.
#
#   Phase A  every INTERVAL s until UNTIL. A pass captures the events INSIDE THEIR WINDOW (kickoff − PRE_MIN …
#            kickoff + POST_MIN; kickoffs come from the schedule on origin/main). For each: the event envelope with
#            players=1, the game-page HTML and ESPN's summary. When at least one event is active, the pass also
#            captures the slate envelope, the /live HTML and build-info. A pass with no active event makes no request.
#            Screenshots (390/1440 px) are taken every SHOT_EVERY-th pass.
#   Phase B  every PHASE_B_INTERVAL s (1800) until SETTLE_UNTIL: every event, to catch settlement and its serving. Screenshots every
#            SHOT_EVERY-th pass and on the first pass on which every event's canonical settlement is served.
#   --once   exactly one pass (all events, whatever their window), then the report. For dry runs.
#
# Every request is one valid JSON line in captures.jsonl: "http" is a number (0 when there was no response), "error"
# is curl's reason or null, and "mitigated" is the x-vercel-mitigated header or "". A failed request is RECORDED,
# never skipped.
# Settlement (git-watch.mjs), per event:
#   - the first origin/main commit where the live-props artifact reads FINAL (provisional), and the first where it
#     reads CANONICAL;
#   - the prop-settlement ledger counts and the market paper record;
#   - whether Production serves each commit, judged by this pass's build-info AND by GitHub's Production deployments.
# Phase B ends after a second consecutive pass on which every event's CANONICAL commit is served, or at SETTLE_UNTIL.
# SIGTERM/INT/HUP write a "stopped" line, so an interrupted run is distinguishable from one still running.
set -u
B="${GTP_BASE:-https://gametimepicks.yashwantbalaji.com}"
ESPN="${ESPN_BASE:-https://site.api.espn.com}"
REPO="${GTP_REPO:-$(cd "$(dirname "$0")/../../.." && pwd)}"
HERE="$(cd "$(dirname "$0")" && pwd)"
EVENTS="${EVENTS:-}"; SETTLE_DATE="${SETTLE_DATE:-}"; INTERVAL="${INTERVAL:-300}"; UNTIL="${UNTIL:-}"; SETTLE_UNTIL="${SETTLE_UNTIL:-}"
ONCE="${ONCE:-0}"; SHOT_EVERY="${SHOT_EVERY:-3}"; NO_SHOTS="${NO_SHOTS:-0}"; OUT="${CAPTURE_OUT:-}"; MIRROR="${CAPTURE_MIRROR:-}"
PRE_MIN="${PRE_MIN:-60}"; POST_MIN="${POST_MIN:-270}"; GH="${GH_DEPLOYMENTS:-1}"; B_INTERVAL="${PHASE_B_INTERVAL:-1800}"
while [ $# -gt 0 ]; do
  case "$1" in
    --events) EVENTS="$2"; shift 2 ;;
    --settle-date) SETTLE_DATE="$2"; shift 2 ;;
    --interval) INTERVAL="$2"; shift 2 ;;
    --until) UNTIL="$2"; shift 2 ;;
    --settle-until) SETTLE_UNTIL="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --mirror) MIRROR="$2"; shift 2 ;;
    --shot-every) SHOT_EVERY="$2"; shift 2 ;;
    --no-shots) NO_SHOTS=1; shift ;;
    --once) ONCE=1; shift ;;
    *) echo "unknown argument $1" >&2; exit 2 ;;
  esac
done
usage="usage: sh capture.sh --events <espnId,...> --settle-date <ET YYYY-MM-DD> (--until ISO --settle-until ISO | --once)"
[ -n "$EVENTS" ] && [ -n "$SETTLE_DATE" ] || { echo "$usage" >&2; exit 2; }
case "$EVENTS" in *[!0-9,]*|,*|*,|*,,*) echo "--events must be comma-separated ESPN ids" >&2; exit 2 ;; esac
case "$SETTLE_DATE" in [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;; *) echo "--settle-date must be YYYY-MM-DD (ET)" >&2; exit 2 ;; esac
EVS=$(echo "$EVENTS" | tr ',' ' ')
TAG=$(echo "$EVENTS" | tr ',' '-')
OUT="${OUT:-$HOME/gtp-evidence/live-v2-$TAG/captures}"
[ "$MIRROR" = none ] && MIRROR="" # optional second copy (rsync after every pass); none by default
export GTP_REPO="$REPO"           # report.mjs resolves the repo's live-prop-state module through it
mkdir -p "$OUT"; [ -n "$MIRROR" ] && mkdir -p "$MIRROR"
ep() { date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$1" +%s 2>/dev/null || date -u -d "$1" +%s; }
now_s() { date -u +%s; }
if [ "$ONCE" = 1 ]; then until_a=0; until_b=$(( $(now_s) + 1 )); else
  [ -n "$UNTIL" ] && [ -n "$SETTLE_UNTIL" ] || { echo "$usage" >&2; exit 2; }
  until_a=$(ep "$UNTIL") && until_b=$(ep "$SETTLE_UNTIL") || { echo "--until/--settle-until must be YYYY-MM-DDTHH:MM:SSZ" >&2; exit 2; }
fi
J="$OUT/captures.jsonl"
# JSON string body for short single-line text (curl errors, header values): control chars dropped, \ and " escaped.
jstr() { printf '%s' "$1" | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g'; }
get() { # name url file [event] — HTTP status (always a number), size, curl's error, Vercel mitigation header
  rc=0
  meta=$(curl -sS -L --max-time 30 -A "gtp-acceptance-capture/1.0 (read-only)" -D "$3.headers" -o "$3" -w '%{http_code} %{size_download}' "$2" 2>"$3.err") || rc=$?
  code=$(printf '%s' "${meta%% *}" | sed 's/^0*//'); case "$code" in ''|*[!0-9]*) code=0 ;; esac
  bytes=$(printf '%s' "${meta##* }" | sed 's/^0*//'); case "$bytes" in ''|*[!0-9]*) bytes=0 ;; esac
  err=null; [ "$rc" -ne 0 ] && err="\"curl exit $rc: $(jstr "$(head -c 200 "$3.err" 2>/dev/null)")\""
  mit=$(grep -i '^x-vercel-mitigated:' "$3.headers" 2>/dev/null | tail -1 | awk '{print $2}' | tr -d '\r')
  rm -f "$3.headers" "$3.err"
  [ "$code" = 0 ] && [ "$bytes" = 0 ] && rm -f "$3"
  evf=""; [ -n "${4:-}" ] && evf=",\"event\":\"$4\""
  printf '{"t":"%s","name":"%s"%s,"http":%s,"bytes":%s,"file":"%s","mitigated":"%s","error":%s}\n' \
    "$T" "$1" "$evf" "$code" "$bytes" "$(basename "$3")" "$(jstr "${mit:-}")" "$err" >> "$J"
}
# Kickoff (epoch s) per event from the canonical schedule on origin/main; empty when unknown (the event is then
# treated as always active, which costs requests but never loses evidence).
kickoff() { git -C "$REPO" show origin/main:app/public/data/nfl/schedule/latest.json 2>/dev/null | python3 -c "
import json,sys,calendar,time
r=[x for x in json.load(sys.stdin).get('rows',[]) if str(x.get('providerEventId'))=='$1']
print(calendar.timegm(time.strptime(r[0]['dateUtc'],'%Y-%m-%dT%H:%MZ')) if r else '')" 2>/dev/null; }
active() { # event → success when inside its window (always in Phase B and with --once)
  [ "$ONCE" = 1 ] && return 0; [ "$(now_s)" -ge "$until_a" ] && return 0
  ko=$(kickoff "$1"); [ -z "$ko" ] && return 0
  n_=$(now_s); [ "$n_" -ge $((ko - PRE_MIN * 60)) ] && [ "$n_" -le $((ko + POST_MIN * 60)) ]
}
n=0; NAP_PID=""
stopped() { [ -n "$NAP_PID" ] && kill "$NAP_PID" 2>/dev/null; echo "{\"t\":\"$(date -u +%FT%TZ)\",\"name\":\"stopped\",\"signal\":\"$1\",\"captures\":$n}" >> "$J"; [ -n "$MIRROR" ] && rsync -a "$OUT/" "$MIRROR/" 2>/dev/null; exit 1; }
trap 'stopped TERM' TERM; trap 'stopped INT' INT; trap 'stopped HUP' HUP
nap() { sleep "$1" & NAP_PID=$!; wait "$NAP_PID"; NAP_PID=""; } # a background sleep: a signal is handled at once
evjson=$(echo "$EVENTS" | sed 's/[0-9][0-9]*/"&"/g')
echo "{\"t\":\"$(date -u +%FT%TZ)\",\"name\":\"start\",\"events\":[$evjson],\"settleDate\":\"$SETTLE_DATE\",\"interval\":$INTERVAL,\"until\":\"$UNTIL\",\"settleUntil\":\"$SETTLE_UNTIL\",\"once\":$([ "$ONCE" = 1 ] && echo true || echo false),\"preMin\":$PRE_MIN,\"postMin\":$POST_MIN,\"phaseBInterval\":$B_INTERVAL,\"kit\":\"$(cat "$HERE"/capture.sh "$HERE"/git-watch.mjs "$HERE"/report.mjs "$HERE"/shot.mjs 2>/dev/null | shasum -a 256 | cut -c1-12)\",\"pid\":$$}" >> "$J"
echo $$ > "$OUT/capture.pid" # stop with: kill -TERM "$(cat "$OUT/capture.pid")" (writes a "stopped" line)
served_streak=0
while [ "$(now_s)" -lt "$until_b" ]; do
  T=$(date -u +%Y%m%dT%H%M%SZ); n=$((n + 1))
  phase=A; [ "$(now_s)" -ge "$until_a" ] && phase=B; [ "$ONCE" = 1 ] && phase=once
  act=""; for ev in $EVS; do active "$ev" && act="$act $ev"; done
  act=${act# }
  echo "{\"t\":\"$T\",\"name\":\"pass\",\"n\":$n,\"phase\":\"$phase\",\"active\":[$(echo "$act" | sed 's/ /,/g; s/[0-9][0-9]*/"&"/g')]}" >> "$J"
  if [ -z "$act" ]; then nap "$INTERVAL"; continue; fi
  get slate "$B/api/live/?sport=nfl" "$OUT/$T-slate.json"
  get live-html "$B/live/" "$OUT/$T-live.html"
  get build-info "$B/data/build-info.json" "$OUT/$T-build-info.json"
  for ev in $act; do
    # players=1, exactly what the client sends (use-live-props.ts): the gateway enables the NFL box score only for
    # players === "1" (api/_live-core.mjs). The SEA@DEN capture used players=true and so recorded no playerStats.
    get event "$B/api/live/?sport=nfl&event=$ev&players=1" "$OUT/$T-event-$ev.json" "$ev"
    get game-html "$B/nfl/game/$ev/" "$OUT/$T-game-$ev.html" "$ev"
    # Ground truth from the gateway's own free public source, so scores, states and player stats can be checked
    # even when our endpoints are challenged (VERCEL_BOT_CHALLENGE is absence of evidence, not a site failure).
    get espn-summary "$ESPN/apis/site/v2/sports/football/nfl/summary?event=$ev" "$OUT/$T-espn-$ev.json" "$ev"
  done
  [ "${NO_FETCH:-0}" = 1 ] || git -C "$REPO" fetch -q origin 2>/dev/null
  DEP=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['commit']['sha'])" "$OUT/$T-build-info.json" 2>/dev/null || echo "")
  ghflag=0; [ "$GH" = 1 ] && [ "$phase" != A ] && ghflag=1
  node "$HERE/git-watch.mjs" --repo "$REPO" --out "$OUT" --t "$T" --events "$EVENTS" --date "$SETTLE_DATE" \
      --deployed "$DEP" --gh "$ghflag" >> "$J" 2>>"$OUT/watch-errors.log" \
    || printf '{"t":"%s","name":"settlement-watch","ok":false}\n' "$T" >> "$J"
  if [ "$ONCE" != 1 ]; then
    # Settle-and-served stop: every event's CANONICAL commit served (build-info or a GitHub Production deployment).
    allserved=$(grep "\"t\":\"$T\",\"name\":\"settlement\"" "$J" | python3 -c "
import json,sys
L=[json.loads(l) for l in sys.stdin if l.strip()]
print(1 if L and len(L)==len(sys.argv[1].split(',')) and all(x.get('servedCanonical') or x.get('ghServedCanonical') for x in L) else 0)" "$EVENTS" 2>/dev/null || echo 0)
    if [ "$allserved" = 1 ]; then served_streak=$((served_streak + 1)); else served_streak=0; fi
  fi
  now=$(now_s)
  if [ "$NO_SHOTS" != 1 ] && { [ "$phase" = once ] || [ "$served_streak" = 1 ] || [ $((n % SHOT_EVERY)) -eq 1 ] || [ "$SHOT_EVERY" -eq 1 ]; }; then
    ( cd "$REPO/app" && GTP_BASE="$B" node "$HERE/shot.mjs" "$OUT" "$T" "$(echo "$act" | tr ' ' ',')" >> "$J" 2>>"$OUT/shot-errors.log" ) \
      || printf '{"t":"%s","name":"screenshots","ok":false}\n' "$T" >> "$J"
  fi
  [ -n "$MIRROR" ] && rsync -a "$OUT/" "$MIRROR/" 2>/dev/null
  [ "$ONCE" = 1 ] && break
  if [ "$served_streak" -ge 2 ]; then echo "{\"t\":\"$T\",\"name\":\"settled-and-served\"}" >> "$J"; break; fi
  if [ "$now" -ge "$until_a" ]; then nap "$B_INTERVAL"; else nap "$INTERVAL"; fi
done
echo "{\"t\":\"$(date -u +%FT%TZ)\",\"name\":\"finished\",\"captures\":$n}" >> "$J"
( cd "$REPO/app" 2>/dev/null || cd "$REPO"; node "$HERE/report.mjs" "$OUT" > "$OUT/REPORT.md" 2>>"$OUT/report-errors.log" )
[ -n "$MIRROR" ] && rsync -a "$OUT/" "$MIRROR/" 2>/dev/null
exit 0
