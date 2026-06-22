# Daily selection learning — through 2026-06-21

Training window: **2026-06-14 → 2026-06-21** (8d). Universe legs:
**4230** (baseline 47.8%). Published legs:
**387**, cards: **120**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits_runs_rbis** → `restricted` — 51% (773/1505, WLB 49%) shrunk 51%
- **batter_hits** → `allowed` — 55% (825/1495, WLB 53%) shrunk 55%
- **batter_total_bases** → `disabled` — 46% (329/723, WLB 42%) shrunk 46%
- **pitcher_strikeouts** → `restricted` — 51% (94/185, WLB 44%) shrunk 51%

## Calibration
- Edge inverted at high values: **true** 5-10:51% (477/933, WLB 48%) · 10-15:50% (279/563, WLB 45%) · neg:57% (456/806, WLB 53%) · 0-5:51% (603/1180, WLB 48%) · 20+:43% (61/143, WLB 35%) · 15-20:51% (145/283, WLB 45%)
- Confidence predictive: **true** (spread 6.3pts) High:51% (901/1778, WLB 48%) · Low:54% (851/1569, WLB 52%) · Medium:48% (269/561, WLB 44%)

## Published leg hit rate by lane
- low: 69% (37/54, WLB 55%)
- medium: 59% (46/78, WLB 48%)
- high: 58% (67/115, WLB 49%)
- longshot: 59% (83/140, WLB 51%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 69% → 2-leg ~47%, 3-leg ~32% (rec max 2)
- medium: leg 59% → 2-leg ~35%, 3-leg ~21% (rec max 3)
- high: leg 58% → 2-leg ~34%, 3-leg ~20% (rec max 3)
- longshot: leg 59% → 2-leg ~35%, 3-leg ~21% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote

_Recommendation artifact only — no production logic changed by this script._
