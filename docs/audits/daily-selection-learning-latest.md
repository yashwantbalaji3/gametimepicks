# Daily selection learning — through 2026-09-23

Training window: **2026-09-16 → 2026-09-23** (8d). Universe legs:
**4057** (baseline 46.8%). Published legs:
**653**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 57% (826/1459, WLB 54%) shrunk 56%
- **batter_hits_runs_rbis** → `restricted` — 51% (733/1451, WLB 48%) shrunk 50%
- **batter_total_bases** → `disabled` — 41% (240/586, WLB 37%) shrunk 41%
- **pitcher_strikeouts** → `restricted` — 52% (98/187, WLB 45%) shrunk 52%

## Calibration
- Edge inverted at high values: **true** 10-15:49% (293/592, WLB 45%) · 0-5:54% (547/1021, WLB 51%) · 5-10:53% (478/894, WLB 50%) · neg:52% (394/765, WLB 48%) · 20+:45% (60/133, WLB 37%) · 15-20:45% (125/278, WLB 39%)
- Confidence predictive: **false** (spread 3.4pts) High:51% (895/1763, WLB 48%) · Low:52% (751/1457, WLB 49%) · Medium:54% (251/463, WLB 50%)

## Published leg hit rate by lane
- low: 62% (56/90, WLB 52%)
- medium: 55% (79/144, WLB 47%)
- high: 56% (103/184, WLB 49%)
- longshot: 57% (134/235, WLB 51%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 62% → 2-leg ~39%, 3-leg ~24% (rec max 2)
- medium: leg 55% → 2-leg ~30%, 3-leg ~17% (rec max 3)
- high: leg 56% → 2-leg ~31%, 3-leg ~18% (rec max 3)
- longshot: leg 57% → 2-leg ~33%, 3-leg ~19% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 3.4pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
