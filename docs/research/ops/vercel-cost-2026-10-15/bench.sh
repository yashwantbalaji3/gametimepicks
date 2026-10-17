#!/bin/sh
# Local build benchmark on current origin/main with a TEMPORARY patch (never committed; reverted after).
# Usage: sh bench.sh <label> <cpus|-> <archiveDays|0>
set -u
L=$1; CPUS=$2; ARCH=$3; B=$(cd "$(dirname "$0")" && pwd); R=/Users/yashwantbalaji/Downloads/gametimepicks
cd $R/app || exit 2
python3 - "$CPUS" "$ARCH" <<'PY'
import sys
cpus, arch = sys.argv[1], int(sys.argv[2])
if cpus != "-":
    p="next.config.mjs"; s=open(p).read()
    s=s.replace("  trailingSlash: true,\n};","  trailingSlash: true,\n  experimental: { cpus: %s },\n};" % cpus); open(p,"w").write(s)
if arch > 0:
    cut = "new Date(Date.now() - %d * 86400000).toISOString().slice(0, 10)" % arch
    for p, old in [("src/app/mlb/board/[date]/page.tsx", "return Array.from(sched).map((date) => ({ date }));"),
                   ("src/app/results/date/[date]/page.tsx", "return all.map((date) => ({ date }));")]:
        s=open(p).read(); assert old in s, p
        new = old.replace("return Array.from(sched)", "return Array.from(sched).filter((d) => d >= %s)" % cut) if "sched" in old else old.replace("return all.map", "return all.filter((d) => d >= %s).map" % cut)
        open(p,"w").write(s.replace(old,new))
PY
git -C $R diff --stat | tail -1
so0=$(vm_stat | awk '/Swapouts/ {gsub("\\.","",$2); print $2}')
( while :; do ps -A -o rss=,comm= | awk '/node/ {s+=$1} END {print s}' >> $B/mem-$L.txt; sleep 0.5; done ) & SP=$!
t0=$(date +%s); npm run build > $B/build-$L.log 2>&1; ec=$?; t1=$(date +%s)
kill $SP 2>/dev/null
so1=$(vm_stat | awk '/Swapouts/ {gsub("\\.","",$2); print $2}')
nb=$(grep -E "END +next-build" $B/build-$L.log | sed -E 's/.*ok in ([0-9.]+)s.*/\1/')
pages=$(grep -oE "Generating static pages \(([0-9]+)/\1\)" $B/build-$L.log | tail -1 | grep -oE "[0-9]+\)" | tr -d ')')
pk=$(sort -n $B/mem-$L.txt | tail -1); p95=$(sort -n $B/mem-$L.txt | awk '{a[NR]=$1} END {print a[int(NR*0.95)]}')
size=$(du -sm out | cut -f1); html=$(find out -name "*.html" -exec cat {} + | wc -c)
echo "$L cpus=$CPUS archiveDays=$ARCH exit=$ec wall=$((t1-t0))s nextbuild=${nb}s pages=$pages peakRSS=$((pk/1024))MB p95RSS=$((p95/1024))MB swapouts=$((so1-so0)) out=${size}MB html=$((html/1048576))MB" | tee -a $B/results.txt
git -C $R checkout -q -- app/next.config.mjs "app/src/app/mlb/board/[date]/page.tsx" "app/src/app/results/date/[date]/page.tsx" data/ask-projection 2>/dev/null
