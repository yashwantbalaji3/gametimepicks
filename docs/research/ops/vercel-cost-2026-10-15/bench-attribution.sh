#!/bin/sh
# Per-route-group attribution on current origin/main (temporary uncommitted patch, reverted after).
# Usage: sh bench2.sh <label> <boardDays|0> <resultsDays|0>
set -u
L=$1; BD=$2; RD=$3; B=$(cd "$(dirname "$0")" && pwd); R=/Users/yashwantbalaji/Downloads/gametimepicks
cd $R/app || exit 2
python3 - "$BD" "$RD" <<'PY'
import sys
bd, rd = int(sys.argv[1]), int(sys.argv[2])
cut = lambda n: "new Date(Date.now() - %d * 86400000).toISOString().slice(0, 10)" % n
if bd:
    p="src/app/mlb/board/[date]/page.tsx"; s=open(p).read(); o="return Array.from(sched).map((date) => ({ date }));"; assert o in s
    open(p,"w").write(s.replace(o, "return Array.from(sched).filter((d) => d >= %s).map((date) => ({ date }));" % cut(bd)))
if rd:
    p="src/app/results/date/[date]/page.tsx"; s=open(p).read(); o="return all.map((date) => ({ date }));"; assert o in s
    open(p,"w").write(s.replace(o, "return all.filter((d) => d >= %s).map((date) => ({ date }));" % cut(rd)))
PY
PG=16384
so0=$(vm_stat | awk '/Swapouts/ {gsub("\\.","",$2); print $2}')
( while :; do r=$(ps -A -o rss=,comm= | awk '/node/ {s+=$1} END {print s+0}'); c=$(vm_stat | awk '/occupied by compressor/ {gsub("\\.","",$5); print $5}'); echo "$r $c" >> $B/m2-$L.txt; sleep 0.5; done ) & SP=$!
t0=$(date +%s); npm run build > $B/b2-$L.log 2>&1; ec=$?; t1=$(date +%s); kill $SP 2>/dev/null
so1=$(vm_stat | awk '/Swapouts/ {gsub("\\.","",$2); print $2}')
nb=$(grep -E "END +next-build" $B/b2-$L.log | sed -E 's/.*ok in ([0-9.]+)s.*/\1/')
pages=$(grep -oE "Generating static pages \(([0-9]+)/\1\)" $B/b2-$L.log | tail -1 | grep -oE "[0-9]+\)" | tr -d ')')
c0=$(head -1 $B/m2-$L.txt | awk '{print $2}')
pk=$(awk -v c0=$c0 -v pg=$PG '{t=$1*1024 + ($2-c0)*pg; if(t>m)m=t} END {printf "%.2f", m/1073741824}' $B/m2-$L.txt)
html=$(find out -name "*.html" -exec cat {} + | wc -c)
echo "$L board=$BD results=$RD exit=$ec nextbuild=${nb}s pages=$pages peak(RSS+compressor)=${pk}GiB swapouts=$((so1-so0)) html=$((html/1048576))MB" | tee -a $B/results2.txt
git -C $R checkout -q -- "app/src/app/mlb/board/[date]/page.tsx" "app/src/app/results/date/[date]/page.tsx" data/ask-projection 2>/dev/null
