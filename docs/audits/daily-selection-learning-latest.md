# Daily selection learning — through 2026-10-05

Training window: **2026-09-28 → 2026-10-05** (8d). Universe legs:
**624** (baseline 45.7%). Published legs:
**310**, cards: **92**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 49% (134/273, WLB 43%) shrunk 49%
- **batter_hits_runs_rbis** → `disabled` — 45% (118/265, WLB 39%) shrunk 45%
- **batter_total_bases** → `disabled` — 40% (19/48, WLB 27%) shrunk 41%
- **pitcher_strikeouts** → `disabled` — 54% (14/26, WLB 35%) shrunk 50%

## Calibration
- Edge inverted at high values: **true** 0-5:51% (68/134, WLB 42%) · 5-10:46% (69/150, WLB 38%) · neg:52% (32/62, WLB 39%) · 15-20:47% (36/76, WLB 37%) · 10-15:41% (60/146, WLB 33%) · 20+:45% (20/44, WLB 32%)
- Confidence predictive: **true** (spread 9.5pts) Medium:43% (32/74, WLB 33%) · High:44% (165/371, WLB 40%) · Low:53% (88/167, WLB 45%)

## Published leg hit rate by lane
- low: 36% (18/50, WLB 24%)
- medium: 47% (35/75, WLB 36%)
- high: 49% (47/95, WLB 40%)
- longshot: 43% (39/90, WLB 34%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 36% → 2-leg ~13%, 3-leg ~5% (rec max 2)
- medium: leg 47% → 2-leg ~22%, 3-leg ~10% (rec max 3)
- high: leg 49% → 2-leg ~25%, 3-leg ~12% (rec max 3)
- longshot: leg 43% → 2-leg ~19%, 3-leg ~8% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote

_Recommendation artifact only — no production logic changed by this script._
