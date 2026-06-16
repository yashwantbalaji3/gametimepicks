# Daily selection learning — through 2026-06-15

Training window: **2026-06-08 → 2026-06-15** (8d). Universe legs:
**3908** (baseline 51.3%). Published legs:
**638**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 55% (808/1478, WLB 52%) shrunk 55%
- **batter_hits_runs_rbis** → `high_risk_only` — 50% (739/1478, WLB 47%) shrunk 50%
- **batter_total_bases** → `high_risk_only` — 48% (372/771, WLB 45%) shrunk 48%
- **pitcher_strikeouts** → `disabled` — 48% (86/181, WLB 40%) shrunk 48%

## Calibration
- Edge inverted at high values: **false** 0-5:52% (622/1197, WLB 49%) · 20+:51% (72/140, WLB 43%) · neg:51% (414/809, WLB 48%) · 10-15:51% (280/552, WLB 47%) · 5-10:49% (471/959, WLB 46%) · 15-20:58% (146/251, WLB 52%)
- Confidence predictive: **false** (spread 2.4pts) Low:52% (844/1616, WLB 50%) · Medium:50% (266/534, WLB 46%) · High:51% (895/1758, WLB 49%)

## Published leg hit rate by lane
- low: 71% (56/79, WLB 60%)
- medium: 62% (89/144, WLB 54%)
- high: 67% (125/187, WLB 60%)
- longshot: 64% (147/228, WLB 58%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 71% → 2-leg ~50%, 3-leg ~36% (rec max 2)
- medium: leg 62% → 2-leg ~38%, 3-leg ~24% (rec max 3)
- high: leg 67% → 2-leg ~45%, 3-leg ~30% (rec max 3)
- longshot: leg 64% → 2-leg ~42%, 3-leg ~27% (rec max 3)

## Warnings
- confidence non-predictive (spread 2.4pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
