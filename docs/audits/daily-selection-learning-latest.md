# Daily selection learning — through 2026-06-13

Training window: **2026-06-06 → 2026-06-13** (8d). Universe legs:
**4102** (baseline 50.2%). Published legs:
**634**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 55% (853/1560, WLB 52%) shrunk 55%
- **batter_hits_runs_rbis** → `high_risk_only` — 49% (758/1558, WLB 46%) shrunk 49%
- **batter_total_bases** → `disabled` — 46% (360/790, WLB 42%) shrunk 46%
- **pitcher_strikeouts** → `disabled` — 46% (89/194, WLB 39%) shrunk 46%

## Calibration
- Edge inverted at high values: **true** neg:51% (416/821, WLB 47%) · 10-15:48% (285/590, WLB 44%) · 0-5:51% (612/1211, WLB 48%) · 5-10:51% (535/1047, WLB 48%) · 20+:49% (73/150, WLB 41%) · 15-20:49% (139/283, WLB 43%)
- Confidence predictive: **false** (spread 1.1pts) Low:51% (836/1647, WLB 48%) · High:50% (957/1917, WLB 48%) · Medium:50% (267/538, WLB 45%)

## Published leg hit rate by lane
- low: 63% (50/79, WLB 52%)
- medium: 60% (89/148, WLB 52%)
- high: 64% (115/180, WLB 57%)
- longshot: 57% (129/227, WLB 50%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 63% → 2-leg ~40%, 3-leg ~25% (rec max 2)
- medium: leg 60% → 2-leg ~36%, 3-leg ~22% (rec max 3)
- high: leg 64% → 2-leg ~41%, 3-leg ~26% (rec max 3)
- longshot: leg 57% → 2-leg ~32%, 3-leg ~18% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 1.1pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
