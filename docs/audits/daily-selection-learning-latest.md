# Daily selection learning — through 2026-08-11

Training window: **2026-08-04 → 2026-08-11** (8d). Universe legs:
**4527** (baseline 46.3%). Published legs:
**668**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 53% (875/1651, WLB 51%) shrunk 53%
- **batter_hits_runs_rbis** → `restricted` — 49% (816/1651, WLB 47%) shrunk 49%
- **batter_total_bases** → `disabled` — 41% (320/774, WLB 38%) shrunk 41%
- **pitcher_strikeouts** → `disabled` — 43% (86/201, WLB 36%) shrunk 43%

## Calibration
- Edge inverted at high values: **true** 20+:53% (61/116, WLB 44%) · 0-5:49% (662/1351, WLB 46%) · neg:51% (538/1058, WLB 48%) · 5-10:49% (480/989, WLB 45%) · 10-15:47% (243/517, WLB 43%) · 15-20:46% (113/246, WLB 40%)
- Confidence predictive: **false** (spread 3.6pts) Low:51% (969/1906, WLB 49%) · Medium:47% (293/620, WLB 43%) · High:48% (835/1751, WLB 45%)

## Published leg hit rate by lane
- low: 60% (56/94, WLB 49%)
- medium: 63% (94/149, WLB 55%)
- high: 61% (114/188, WLB 54%)
- longshot: 63% (150/237, WLB 57%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 60% → 2-leg ~36%, 3-leg ~21% (rec max 2)
- medium: leg 63% → 2-leg ~40%, 3-leg ~25% (rec max 3)
- high: leg 61% → 2-leg ~37%, 3-leg ~22% (rec max 3)
- longshot: leg 63% → 2-leg ~40%, 3-leg ~25% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 3.6pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
