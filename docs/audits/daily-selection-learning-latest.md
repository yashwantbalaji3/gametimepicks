# Daily selection learning — through 2026-09-08

Training window: **2026-09-01 → 2026-09-08** (8d). Universe legs:
**4024** (baseline 48.2%). Published legs:
**669**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits_runs_rbis** → `restricted` — 51% (759/1474, WLB 49%) shrunk 51%
- **batter_hits** → `allowed` — 55% (810/1473, WLB 52%) shrunk 55%
- **batter_total_bases** → `disabled` — 46% (278/600, WLB 42%) shrunk 46%
- **pitcher_strikeouts** → `restricted` — 50% (93/185, WLB 43%) shrunk 50%

## Calibration
- Edge inverted at high values: **true** 15-20:49% (132/267, WLB 43%) · neg:50% (414/822, WLB 47%) · 0-5:53% (574/1073, WLB 51%) · 10-15:52% (288/552, WLB 48%) · 5-10:53% (463/880, WLB 49%) · 20+:50% (69/138, WLB 42%)
- Confidence predictive: **false** (spread 2.7pts) High:52% (881/1696, WLB 50%) · Low:53% (794/1506, WLB 50%) · Medium:50% (265/530, WLB 46%)

## Published leg hit rate by lane
- low: 67% (62/92, WLB 57%)
- medium: 55% (80/146, WLB 47%)
- high: 59% (113/193, WLB 52%)
- longshot: 57% (135/238, WLB 50%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 67% → 2-leg ~45%, 3-leg ~31% (rec max 2)
- medium: leg 55% → 2-leg ~30%, 3-leg ~16% (rec max 3)
- high: leg 59% → 2-leg ~34%, 3-leg ~20% (rec max 3)
- longshot: leg 57% → 2-leg ~32%, 3-leg ~18% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 2.7pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
