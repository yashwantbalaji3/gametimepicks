# Daily selection learning — through 2026-08-10

Training window: **2026-08-03 → 2026-08-10** (8d). Universe legs:
**4086** (baseline 46.1%). Published legs:
**659**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 53% (799/1522, WLB 50%) shrunk 52%
- **batter_hits_runs_rbis** → `restricted` — 49% (708/1437, WLB 47%) shrunk 49%
- **batter_total_bases** → `disabled` — 41% (291/708, WLB 38%) shrunk 41%
- **pitcher_strikeouts** → `disabled` — 46% (85/186, WLB 39%) shrunk 46%

## Calibration
- Edge inverted at high values: **true** neg:52% (507/972, WLB 49%) · 0-5:48% (587/1212, WLB 46%) · 5-10:48% (424/889, WLB 44%) · 15-20:44% (96/220, WLB 37%) · 20+:51% (52/102, WLB 41%) · 10-15:47% (217/458, WLB 43%)
- Confidence predictive: **false** (spread 4.2pts) Low:51% (882/1724, WLB 49%) · Medium:47% (264/562, WLB 43%) · High:47% (737/1567, WLB 45%)

## Published leg hit rate by lane
- low: 57% (54/94, WLB 47%)
- medium: 62% (93/150, WLB 54%)
- high: 56% (103/183, WLB 49%)
- longshot: 61% (141/232, WLB 54%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 57% → 2-leg ~33%, 3-leg ~19% (rec max 2)
- medium: leg 62% → 2-leg ~38%, 3-leg ~24% (rec max 3)
- high: leg 56% → 2-leg ~32%, 3-leg ~18% (rec max 3)
- longshot: leg 61% → 2-leg ~37%, 3-leg ~23% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 4.2pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
