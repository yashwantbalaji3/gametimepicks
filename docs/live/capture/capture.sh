#!/bin/sh
# Thursday SEA @ DEN (ESPN 401872995) — read-only evidence capture for docs/live/LIVE_V2_THURSDAY_ACCEPTANCE.md (v2, 2026-10-14).
# Reads ONLY our own Production gateway/pages (the gateway reads the free ESPN public feed, CDN-cached) and origin/main
# via git. No writes to the repo, no workflow triggers, no paid calls.
#   Phase A  every INTERVAL s until UNTIL (kickoff −60 min → final + ~90 min): envelopes, HTML, frozen-forecast fingerprint;
#            screenshots at 390 px and 1440 px every SHOT_EVERY-th capture.
#   Phase B  every 1800 s until SETTLE_UNTIL: the same, to catch the canonical settlement run.
# Every request is logged to captures.jsonl with HTTP status and size — a failed or empty capture is RECORDED, never
# skipped silently. report.mjs turns the folder into a pass/gap report. Mirrored to $HOME/gtp-evidence/<event> each pass.
#   Settlement: each pass records whether the event is in data/internal/nfl/settlement/<ET date>.json on origin/main and
#            whether the deployed build contains that commit. Phase B ends one pass after the SETTLED state is served
#            (last Thursday's game first settled on main at 16:09Z the next day), or at settle_until at the latest.
# Usage: sh capture.sh [interval=300] [until=2026-10-16T05:00:00Z] [settle_until=2026-10-17T02:00:00Z]
set -u
B=https://gametimepicks.yashwantbalaji.com
EV=401872995
REPO="${GTP_REPO:-$(cd "$(dirname "$0")/../../.." && pwd)}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${CAPTURE_OUT:-$HOME/gtp-evidence/live-v2-$EV/captures}"
MIRROR="${CAPTURE_MIRROR:-$HOME/gtp-evidence/live-v2-$EV}"
INTERVAL="${1:-300}"; UNTIL="${2:-2026-10-16T05:00:00Z}"; SETTLE_UNTIL="${3:-2026-10-17T02:00:00Z}"
SETTLE_DATE="${SETTLE_DATE:-2026-10-15}"  # ET date of the game — the settlement file key
served_settled=0
SHOT_EVERY="${SHOT_EVERY:-3}"
mkdir -p "$OUT" "$MIRROR"
ep() { date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$1" +%s 2>/dev/null || date -u -d "$1" +%s; }
until_a=$(ep "$UNTIL"); until_b=$(ep "$SETTLE_UNTIL")
get() { # name url file — records HTTP status, size, and whether Vercel bot mitigation answered (x-vercel-mitigated)
  meta=$(curl -s -L --max-time 30 -A "gtp-acceptance-capture/1.0 (read-only)" -D "$3.headers" -o "$3" -w '%{http_code} %{size_download}' "$2" 2>/dev/null || echo "000 0")
  mit=$(grep -i '^x-vercel-mitigated:' "$3.headers" 2>/dev/null | tail -1 | awk '{print $2}' | tr -d '\r')
  rm -f "$3.headers"
  printf '{"t":"%s","name":"%s","http":%s,"bytes":%s,"file":"%s","mitigated":"%s"}\n' "$T" "$1" "${meta%% *}" "${meta##* }" "$(basename "$3")" "${mit:-}" >> "$OUT/captures.jsonl"
}
n=0
echo "{\"t\":\"$(date -u +%FT%TZ)\",\"name\":\"start\",\"interval\":$INTERVAL,\"until\":\"$UNTIL\",\"settleUntil\":\"$SETTLE_UNTIL\"}" >> "$OUT/captures.jsonl"
while [ "$(date -u +%s)" -lt "$until_b" ]; do
  T=$(date -u +%Y%m%dT%H%M%SZ); n=$((n + 1))
  get slate "$B/api/live/?sport=nfl" "$OUT/$T-slate.json"
  get event "$B/api/live/?sport=nfl&event=$EV&players=true" "$OUT/$T-event.json"
  get live-html "$B/live/" "$OUT/$T-live.html"
  get game-html "$B/nfl/game/$EV/" "$OUT/$T-game.html"
  get build-info "$B/data/build-info.json" "$OUT/$T-build-info.json"
  # Ground truth from the gateway's own free public source, so scores and states can be checked even if our
  # endpoints are challenged mid-game (VERCEL_BOT_CHALLENGE is absence of evidence, not a site failure).
  get espn-summary "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=$EV" "$OUT/$T-espn.json"
  git -C "$REPO" fetch -q origin 2>/dev/null
  {
    git -C "$REPO" show origin/main:app/public/data/nfl/forecasts/latest.json 2>/dev/null \
      | python3 -c "import json,sys,hashlib;d=json.load(sys.stdin);f=[x for x in d.get('forecasts',[]) if x.get('providerEventId')=='$EV'];print('forecast', hashlib.sha256(json.dumps(f,sort_keys=True).encode()).hexdigest() if f else 'ABSENT')" 2>/dev/null || echo "forecast UNREADABLE"
    git -C "$REPO" ls-tree -r --name-only origin/main app/public/data/nfl/player-board 2>/dev/null | grep "$EV" | while read -r f; do
      echo "board $f $(git -C "$REPO" show "origin/main:$f" | shasum -a 256 | cut -c1-64)"; done
    git -C "$REPO" ls-tree -r --name-only origin/main data/internal/nfl/forecast-receipts 2>/dev/null | grep "$EV" | sed 's/^/receipt /'
    echo "main $(git -C "$REPO" rev-parse --short origin/main)"
    # Player-prop progress from the committed live-props artifact (git, so unaffected by bot mitigation): phase,
    # finality, counts, and a hash of ONLY the frozen parts — those must never change once the game starts.
    git -C "$REPO" show "origin/main:app/public/data/nfl/live-props/$EV.json" 2>/dev/null | python3 -c "
import json,sys,hashlib
d=json.load(sys.stdin); rows=d.get('rows',[])
fz=hashlib.sha256(json.dumps(sorted([[r.get('predictionId'),r.get('frozenIdentity'),r.get('frozen')] for r in rows]),sort_keys=True).encode()).hexdigest()[:16]
live=sum(1 for r in rows if (r.get('live') or {}).get('statValue') is not None)
st={}
for r in rows: k=(r.get('settlement') or {}).get('state') or 'NONE'; st[k]=st.get(k,0)+1
print('liveprops', json.dumps({'phase':d.get('phase'),'finality':d.get('finality'),'observedAt':d.get('observedAt'),'rows':len(rows),'withLive':live,'settlement':st,'frozenHash':fz,'refused':sum(1 for r in rows if r.get('frozenRefusal'))},separators=(',',':')))
" 2>/dev/null || echo "liveprops none"
  } > "$OUT/$T-frozen.txt"
  if ! git -C "$REPO" cat-file -e "origin/main:data/internal/nfl/settlement/$SETTLE_DATE.json" 2>/dev/null; then SET=no-file-yet; else
  SET=$(git -C "$REPO" show "origin/main:data/internal/nfl/settlement/$SETTLE_DATE.json" 2>/dev/null \
    | python3 -c "import json,sys;d=json.load(sys.stdin);print('settled' if any(x.get('providerEventId')=='$EV' for x in d.get('events',[])) else ('pending' if any(('$EV' in json.dumps(x)) for x in d.get('pending',[])) else 'absent'))" 2>/dev/null || echo unreadable); fi
  SETSHA=""
  [ "$SET" = settled ] && SETSHA=$(git -C "$REPO" log -1 --format=%H origin/main -- "data/internal/nfl/settlement/$SETTLE_DATE.json")
  DEP=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['commit']['sha'])" "$OUT/$T-build-info.json" 2>/dev/null || echo "")
  SERVED=no
  [ -n "$SETSHA" ] && [ -n "$DEP" ] && git -C "$REPO" merge-base --is-ancestor "$SETSHA" "$DEP" 2>/dev/null && SERVED=yes
  printf '{"t":"%s","name":"settlement","state":"%s","settlementCommit":"%s","deployed":"%s","served":"%s"}\n' "$T" "$SET" "$SETSHA" "$DEP" "$SERVED" >> "$OUT/captures.jsonl"
  now=$(date -u +%s)
  if [ "$now" -ge "$until_a" ] || [ $((n % SHOT_EVERY)) -eq 1 ] || [ "$SHOT_EVERY" -eq 1 ]; then
    ( cd "$REPO/app" && node "$HERE/shot.mjs" "$OUT" "$T" "$EV" >> "$OUT/captures.jsonl" 2>>"$OUT/shot-errors.log" ) \
      || printf '{"t":"%s","name":"screenshots","ok":false}\n' "$T" >> "$OUT/captures.jsonl"
  fi
  rsync -a "$OUT/" "$MIRROR/" 2>/dev/null
  if [ "$SERVED" = yes ]; then served_settled=$((served_settled + 1)); fi
  if [ "$served_settled" -ge 2 ]; then echo "{\"t\":\"$T\",\"name\":\"settled-and-served\"}" >> "$OUT/captures.jsonl"; break; fi
  if [ "$now" -ge "$until_a" ]; then sleep 1800; else sleep "$INTERVAL"; fi
done
echo "{\"t\":\"$(date -u +%FT%TZ)\",\"name\":\"finished\",\"captures\":$n}" >> "$OUT/captures.jsonl"
( cd "$REPO/app" && node "$HERE/report.mjs" "$OUT" > "$OUT/REPORT.md" 2>>"$OUT/shot-errors.log" )
rsync -a "$OUT/" "$MIRROR/" 2>/dev/null
