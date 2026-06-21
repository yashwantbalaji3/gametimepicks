# Daily selection learning — through 2026-06-20

Training window: **2026-06-13 → 2026-06-20** (8d). Universe legs:
**4236** (baseline 48.5%). Published legs:
**469**, cards: **144**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits_runs_rbis** → `restricted` — 51% (781/1525, WLB 49%) shrunk 51%
- **batter_hits** → `allowed` — 55% (838/1524, WLB 52%) shrunk 55%
- **batter_total_bases** → `disabled` — 46% (348/749, WLB 43%) shrunk 47%
- **pitcher_strikeouts** → `disabled` — 47% (87/187, WLB 40%) shrunk 47%

## Calibration
- Edge inverted at high values: **true** 10-15:49% (274/558, WLB 45%) · 20+:43% (63/145, WLB 36%) · 0-5:52% (612/1187, WLB 49%) · 5-10:50% (490/972, WLB 47%) · neg:55% (458/832, WLB 52%) · 15-20:54% (157/291, WLB 48%)
- Confidence predictive: **true** (spread 5.6pts) High:51% (920/1819, WLB 48%) · Low:54% (872/1622, WLB 51%) · Medium:48% (262/544, WLB 44%)

## Published leg hit rate by lane
- low: 67% (41/61, WLB 55%)
- medium: 60% (59/98, WLB 50%)
- high: 61% (85/139, WLB 53%)
- longshot: 61% (104/171, WLB 53%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 67% → 2-leg ~45%, 3-leg ~30% (rec max 2)
- medium: leg 60% → 2-leg ~36%, 3-leg ~22% (rec max 3)
- high: leg 61% → 2-leg ~37%, 3-leg ~23% (rec max 3)
- longshot: leg 61% → 2-leg ~37%, 3-leg ~23% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote

_Recommendation artifact only — no production logic changed by this script._
