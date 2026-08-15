# Daily selection learning — through 2026-08-14

Training window: **2026-08-07 → 2026-08-14** (8d). Universe legs:
**4410** (baseline 45.6%). Published legs:
**663**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 53% (853/1607, WLB 51%) shrunk 53%
- **batter_hits_runs_rbis** → `restricted` — 49% (791/1607, WLB 47%) shrunk 49%
- **batter_total_bases** → `disabled` — 38% (271/720, WLB 34%) shrunk 38%
- **pitcher_strikeouts** → `disabled` — 49% (97/196, WLB 43%) shrunk 49%

## Calibration
- Edge inverted at high values: **true** 0-5:49% (630/1294, WLB 46%) · neg:51% (485/945, WLB 48%) · 5-10:48% (473/978, WLB 45%) · 10-15:45% (248/548, WLB 41%) · 15-20:46% (111/242, WLB 40%) · 20+:53% (65/123, WLB 44%)
- Confidence predictive: **true** (spread 5.5pts) Medium:46% (281/612, WLB 42%) · Low:51% (900/1752, WLB 49%) · High:47% (831/1766, WLB 45%)

## Published leg hit rate by lane
- low: 64% (59/92, WLB 54%)
- medium: 59% (85/144, WLB 51%)
- high: 65% (121/187, WLB 58%)
- longshot: 64% (154/240, WLB 58%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 64% → 2-leg ~41%, 3-leg ~26% (rec max 2)
- medium: leg 59% → 2-leg ~35%, 3-leg ~21% (rec max 3)
- high: leg 65% → 2-leg ~42%, 3-leg ~27% (rec max 3)
- longshot: leg 64% → 2-leg ~41%, 3-leg ~26% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote

_Recommendation artifact only — no production logic changed by this script._
