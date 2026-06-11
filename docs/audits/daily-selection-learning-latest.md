# Daily selection learning — through 2026-06-10

Training window: **2026-06-03 → 2026-06-10** (8d). Universe legs:
**4163** (baseline 50.0%). Published legs:
**594**, cards: **176**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 54% (864/1599, WLB 52%) shrunk 54%
- **batter_hits_runs_rbis** → `high_risk_only` — 49% (780/1599, WLB 46%) shrunk 49%
- **batter_total_bases** → `disabled` — 44% (344/775, WLB 41%) shrunk 45%
- **pitcher_strikeouts** → `disabled` — 50% (95/190, WLB 43%) shrunk 50%

## Calibration
- Edge inverted at high values: **true** 15-20:45% (138/304, WLB 40%) · 5-10:52% (557/1064, WLB 49%) · 20+:48% (75/156, WLB 40%) · 10-15:48% (286/598, WLB 44%) · 0-5:51% (620/1223, WLB 48%) · neg:50% (407/818, WLB 46%)
- Confidence predictive: **false** (spread 2.4pts) High:50% (980/1964, WLB 48%) · Low:50% (797/1610, WLB 47%) · Medium:52% (306/589, WLB 48%)

## Published leg hit rate by lane
- low: 60% (49/81, WLB 50%)
- medium: 59% (79/135, WLB 50%)
- high: 55% (93/170, WLB 47%)
- longshot: 52% (109/208, WLB 46%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 60% → 2-leg ~37%, 3-leg ~22% (rec max 2)
- medium: leg 59% → 2-leg ~34%, 3-leg ~20% (rec max 3)
- high: leg 55% → 2-leg ~30%, 3-leg ~16% (rec max 3)
- longshot: leg 52% → 2-leg ~28%, 3-leg ~14% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 2.4pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
