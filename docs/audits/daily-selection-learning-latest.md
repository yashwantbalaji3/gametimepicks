# Daily selection learning — through 2026-09-27

Training window: **2026-09-20 → 2026-09-27** (8d). Universe legs:
**3880** (baseline 45.2%). Published legs:
**641**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 56% (778/1387, WLB 53%) shrunk 56%
- **batter_hits_runs_rbis** → `restricted` — 50% (681/1373, WLB 47%) shrunk 50%
- **batter_total_bases** → `disabled` — 44% (219/494, WLB 40%) shrunk 44%
- **pitcher_strikeouts** → `disabled` — 43% (74/174, WLB 35%) shrunk 43%

## Calibration
- Edge inverted at high values: **true** 5-10:52% (434/841, WLB 48%) · 0-5:54% (505/939, WLB 51%) · neg:52% (349/674, WLB 48%) · 10-15:48% (274/573, WLB 44%) · 20+:45% (63/141, WLB 37%) · 15-20:49% (127/260, WLB 43%)
- Confidence predictive: **false** (spread 3.7pts) High:50% (835/1674, WLB 47%) · Low:52% (670/1293, WLB 49%) · Medium:54% (247/461, WLB 49%)

## Published leg hit rate by lane
- low: 54% (45/84, WLB 43%)
- medium: 53% (76/144, WLB 45%)
- high: 54% (100/184, WLB 47%)
- longshot: 55% (126/229, WLB 49%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 54% → 2-leg ~29%, 3-leg ~15% (rec max 2)
- medium: leg 53% → 2-leg ~28%, 3-leg ~15% (rec max 3)
- high: leg 54% → 2-leg ~30%, 3-leg ~16% (rec max 3)
- longshot: leg 55% → 2-leg ~30%, 3-leg ~17% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 3.7pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
