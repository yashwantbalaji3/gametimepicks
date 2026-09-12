# Daily selection learning — through 2026-09-11

Training window: **2026-09-04 → 2026-09-11** (8d). Universe legs:
**3912** (baseline 47.1%). Published legs:
**670**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 55% (791/1446, WLB 52%) shrunk 55%
- **batter_hits_runs_rbis** → `restricted` — 49% (714/1446, WLB 47%) shrunk 49%
- **batter_total_bases** → `disabled` — 45% (252/560, WLB 41%) shrunk 45%
- **pitcher_strikeouts** → `disabled` — 47% (85/181, WLB 40%) shrunk 47%

## Calibration
- Edge inverted at high values: **true** 5-10:49% (432/876, WLB 46%) · 0-5:51% (542/1062, WLB 48%) · neg:52% (400/776, WLB 48%) · 10-15:51% (270/527, WLB 47%) · 15-20:49% (125/255, WLB 43%) · 20+:53% (73/137, WLB 45%)
- Confidence predictive: **false** (spread 2.0pts) High:50% (825/1654, WLB 47%) · Medium:50% (266/532, WLB 46%) · Low:52% (751/1447, WLB 49%)

## Published leg hit rate by lane
- low: 67% (61/91, WLB 57%)
- medium: 53% (78/148, WLB 45%)
- high: 57% (111/194, WLB 50%)
- longshot: 56% (132/237, WLB 49%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 67% → 2-leg ~45%, 3-leg ~30% (rec max 2)
- medium: leg 53% → 2-leg ~28%, 3-leg ~15% (rec max 3)
- high: leg 57% → 2-leg ~33%, 3-leg ~19% (rec max 3)
- longshot: leg 56% → 2-leg ~31%, 3-leg ~17% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 2.0pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
