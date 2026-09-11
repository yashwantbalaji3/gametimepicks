# Daily selection learning — through 2026-09-10

Training window: **2026-09-03 → 2026-09-10** (8d). Universe legs:
**3631** (baseline 46.7%). Published legs:
**669**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits_runs_rbis** → `restricted` — 49% (657/1336, WLB 47%) shrunk 49%
- **batter_hits** → `allowed` — 55% (728/1335, WLB 52%) shrunk 54%
- **batter_total_bases** → `disabled` — 44% (229/520, WLB 40%) shrunk 44%
- **pitcher_strikeouts** → `disabled` — 48% (81/168, WLB 41%) shrunk 48%

## Calibration
- Edge inverted at high values: **true** neg:52% (369/708, WLB 48%) · 5-10:50% (405/811, WLB 47%) · 0-5:50% (486/963, WLB 47%) · 10-15:50% (252/504, WLB 46%) · 15-20:47% (114/241, WLB 41%) · 20+:52% (69/132, WLB 44%)
- Confidence predictive: **false** (spread 4.1pts) Low:52% (695/1328, WLB 50%) · High:50% (769/1552, WLB 47%) · Medium:48% (231/479, WLB 44%)

## Published leg hit rate by lane
- low: 66% (60/91, WLB 56%)
- medium: 54% (80/149, WLB 46%)
- high: 56% (106/191, WLB 48%)
- longshot: 55% (132/238, WLB 49%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 66% → 2-leg ~44%, 3-leg ~29% (rec max 2)
- medium: leg 54% → 2-leg ~29%, 3-leg ~16% (rec max 3)
- high: leg 56% → 2-leg ~31%, 3-leg ~17% (rec max 3)
- longshot: leg 55% → 2-leg ~31%, 3-leg ~17% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 4.1pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
