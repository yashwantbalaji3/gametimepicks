# Daily selection learning — through 2026-09-19

Training window: **2026-09-12 → 2026-09-19** (8d). Universe legs:
**4365** (baseline 47.7%). Published legs:
**667**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 56% (895/1588, WLB 54%) shrunk 56%
- **batter_hits_runs_rbis** → `restricted` — 51% (808/1579, WLB 49%) shrunk 51%
- **batter_total_bases** → `disabled` — 43% (275/644, WLB 39%) shrunk 43%
- **pitcher_strikeouts** → `restricted` — 51% (103/203, WLB 44%) shrunk 50%

## Calibration
- Edge inverted at high values: **true** 10-15:52% (330/629, WLB 49%) · neg:50% (409/812, WLB 47%) · 5-10:53% (505/953, WLB 50%) · 0-5:53% (623/1183, WLB 50%) · 15-20:47% (143/304, WLB 42%) · 20+:53% (71/133, WLB 45%)
- Confidence predictive: **false** (spread 0.9pts) High:52% (977/1885, WLB 50%) · Low:52% (825/1598, WLB 49%) · Medium:53% (279/531, WLB 48%)

## Published leg hit rate by lane
- low: 73% (69/94, WLB 64%)
- medium: 59% (87/147, WLB 51%)
- high: 62% (116/188, WLB 55%)
- longshot: 63% (150/238, WLB 57%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 73% → 2-leg ~54%, 3-leg ~40% (rec max 2)
- medium: leg 59% → 2-leg ~35%, 3-leg ~21% (rec max 3)
- high: leg 62% → 2-leg ~38%, 3-leg ~24% (rec max 3)
- longshot: leg 63% → 2-leg ~40%, 3-leg ~25% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 0.9pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
