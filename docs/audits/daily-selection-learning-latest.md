# Daily selection learning — through 2026-08-08

Training window: **2026-08-01 → 2026-08-08** (8d). Universe legs:
**3060** (baseline 45.9%). Published legs:
**493**, cards: **144**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 52% (603/1150, WLB 50%) shrunk 52%
- **batter_hits_runs_rbis** → `restricted` — 49% (519/1065, WLB 46%) shrunk 49%
- **batter_total_bases** → `disabled` — 41% (217/534, WLB 37%) shrunk 41%
- **pitcher_strikeouts** → `disabled` — 47% (66/141, WLB 39%) shrunk 47%

## Calibration
- Edge inverted at high values: **true** neg:52% (381/738, WLB 48%) · 0-5:47% (437/924, WLB 44%) · 5-10:48% (311/650, WLB 44%) · 15-20:45% (76/168, WLB 38%) · 20+:54% (38/71, WLB 42%) · 10-15:48% (162/339, WLB 43%)
- Confidence predictive: **false** (spread 4.0pts) Low:50% (658/1305, WLB 48%) · Medium:46% (198/427, WLB 42%) · High:47% (549/1158, WLB 45%)

## Published leg hit rate by lane
- low: 60% (42/70, WLB 48%)
- medium: 62% (71/115, WLB 53%)
- high: 53% (72/135, WLB 45%)
- longshot: 60% (103/173, WLB 52%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 60% → 2-leg ~36%, 3-leg ~22% (rec max 2)
- medium: leg 62% → 2-leg ~38%, 3-leg ~24% (rec max 3)
- high: leg 53% → 2-leg ~28%, 3-leg ~15% (rec max 3)
- longshot: leg 60% → 2-leg ~36%, 3-leg ~21% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 4.0pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
