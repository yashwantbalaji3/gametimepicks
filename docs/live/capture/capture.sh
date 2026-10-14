#!/bin/sh
# Thursday SEA @ DEN (ESPN 401872995) — read-only evidence capture for docs/live/LIVE_V2_THURSDAY_ACCEPTANCE.md (v2, 2026-10-14).
# Reads ONLY our own Production gateway/pages (the gateway reads the free ESPN public feed, CDN-cached) and origin/main
# via git. No writes to the repo, no workflow triggers, no paid calls.
#   Phase A  every INTERVAL s until UNTIL (kickoff −60 min → final + ~90 min): envelopes, HTML, frozen-forecast fingerprint;
#            screenshots at 390 px and 1440 px every SHOT_EVERY-th capture.
#   Phase B  every 1800 s until SETTLE_UNTIL: the same, to catch the canonical settlement run.
# Every request is logged to captures.jsonl with HTTP status and size — a failed or empty capture is RECORDED, never
# skipped silently. report.mjs turns the folder into a pass/gap report. Mirrored to $HOME/gtp-evidence/<event> each pass.
# Usage: sh capture.sh [interval=300] [until=2026-10-16T05:00:00Z] [settle_until=2026-10-16T16:00:00Z]
set -u
B=https://gametimepicks.yashwantbalaji.com
EV=401872995
REPO="${GTP_REPO:-$(cd "$(dirname "$0")/../../.." && pwd)}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${CAPTURE_OUT:-$HOME/gtp-evidence/live-v2-$EV/captures}"
MIRROR="${CAPTURE_MIRROR:-$HOME/gtp-evidence/live-v2-$EV}"
INTERVAL="${1:-300}"; UNTIL="${2:-2026-10-16T05:00:00Z}"; SETTLE_UNTIL="${3:-2026-10-16T16:00:00Z}"
SHOT_EVERY="${SHOT_EVERY:-3}"
mkdir -p "$OUT" "$MIRROR"
ep() { date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$1" +%s 2>/dev/null || date -u -d "$1" +%s; }
until_a=$(ep "$UNTIL"); until_b=$(ep "$SETTLE_UNTIL")
get() { # name url file
  meta=$(curl -s -L --max-time 30 -o "$3" -w '%{http_code} %{size_download}' "$2" 2>/dev/null || echo "000 0")
  printf '{"t":"%s","name":"%s","http":%s,"bytes":%s,"file":"%s"}\n' "$T" "$1" "${meta%% *}" "${meta##* }" "$(basename "$3")" >> "$OUT/captures.jsonl"
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
  git -C "$REPO" fetch -q origin 2>/dev/null
  {
    git -C "$REPO" show origin/main:app/public/data/nfl/forecasts/latest.json 2>/dev/null \
      | python3 -c "import json,sys,hashlib;d=json.load(sys.stdin);f=[x for x in d.get('forecasts',[]) if x.get('providerEventId')=='$EV'];print('forecast', hashlib.sha256(json.dumps(f,sort_keys=True).encode()).hexdigest() if f else 'ABSENT')" 2>/dev/null || echo "forecast UNREADABLE"
    git -C "$REPO" ls-tree -r --name-only origin/main app/public/data/nfl/player-board 2>/dev/null | grep "$EV" | while read -r f; do
      echo "board $f $(git -C "$REPO" show "origin/main:$f" | shasum -a 256 | cut -c1-64)"; done
    git -C "$REPO" ls-tree -r --name-only origin/main data/internal/nfl/forecast-receipts 2>/dev/null | grep "$EV" | sed 's/^/receipt /'
    echo "main $(git -C "$REPO" rev-parse --short origin/main)"
  } > "$OUT/$T-frozen.txt"
  now=$(date -u +%s)
  if [ "$now" -ge "$until_a" ] || [ $((n % SHOT_EVERY)) -eq 1 ] || [ "$SHOT_EVERY" -eq 1 ]; then
    ( cd "$REPO/app" && node "$HERE/shot.mjs" "$OUT" "$T" "$EV" >> "$OUT/captures.jsonl" 2>>"$OUT/shot-errors.log" ) \
      || printf '{"t":"%s","name":"screenshots","ok":false}\n' "$T" >> "$OUT/captures.jsonl"
  fi
  rsync -a "$OUT/" "$MIRROR/" 2>/dev/null
  if [ "$now" -ge "$until_a" ]; then sleep 1800; else sleep "$INTERVAL"; fi
done
echo "{\"t\":\"$(date -u +%FT%TZ)\",\"name\":\"finished\",\"captures\":$n}" >> "$OUT/captures.jsonl"
( cd "$REPO/app" && node "$HERE/report.mjs" "$OUT" > "$OUT/REPORT.md" 2>>"$OUT/shot-errors.log" )
rsync -a "$OUT/" "$MIRROR/" 2>/dev/null
