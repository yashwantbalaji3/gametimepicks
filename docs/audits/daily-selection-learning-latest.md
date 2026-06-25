# Daily selection learning — through 2026-06-24

Training window: **2026-06-17 → 2026-06-24** (8d). Universe legs:
**3815** (baseline 46.3%). Published legs:
**153**, cards: **48**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits_runs_rbis** → `restricted` — 51% (686/1346, WLB 48%) shrunk 51%
- **batter_hits** → `allowed` — 55% (734/1336, WLB 52%) shrunk 55%
- **batter_total_bases** → `disabled` — 44% (271/617, WLB 40%) shrunk 44%
- **pitcher_strikeouts** → `disabled` — 47% (76/161, WLB 40%) shrunk 47%

## Calibration
- Edge inverted at high values: **true** 15-20:46% (108/236, WLB 40%) · 20+:43% (55/128, WLB 35%) · 0-5:51% (511/1002, WLB 48%) · 5-10:53% (462/866, WLB 50%) · neg:52% (367/701, WLB 49%) · 10-15:50% (264/527, WLB 46%)
- Confidence predictive: **false** (spread 1.0pts) High:51% (833/1628, WLB 49%) · Low:51% (702/1370, WLB 49%) · Medium:50% (232/462, WLB 46%)

## Published leg hit rate by lane
- low: 70% (14/20, WLB 48%)
- medium: 58% (18/31, WLB 41%)
- high: 49% (23/47, WLB 35%)
- longshot: 58% (32/55, WLB 45%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 70% → 2-leg ~49%, 3-leg ~34% (rec max 2)
- medium: leg 58% → 2-leg ~34%, 3-leg ~20% (rec max 3)
- high: leg 49% → 2-leg ~24%, 3-leg ~12% (rec max 3)
- longshot: leg 58% → 2-leg ~34%, 3-leg ~20% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 1.0pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
