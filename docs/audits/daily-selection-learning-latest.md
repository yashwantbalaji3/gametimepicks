# Daily selection learning — through 2026-09-01

Training window: **2026-08-25 → 2026-09-01** (8d). Universe legs:
**3682** (baseline 47.8%). Published legs:
**657**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 54% (725/1352, WLB 51%) shrunk 54%
- **batter_hits_runs_rbis** → `restricted` — 51% (690/1352, WLB 48%) shrunk 51%
- **batter_total_bases** → `disabled` — 44% (263/594, WLB 40%) shrunk 44%
- **pitcher_strikeouts** → `disabled` — 51% (81/160, WLB 43%) shrunk 50%

## Calibration
- Edge inverted at high values: **true** 0-5:54% (554/1032, WLB 51%) · 5-10:54% (454/836, WLB 51%) · neg:48% (387/806, WLB 45%) · 10-15:48% (240/503, WLB 43%) · 15-20:43% (85/197, WLB 36%) · 20+:46% (39/84, WLB 36%)
- Confidence predictive: **false** (spread 2.2pts) Medium:53% (263/500, WLB 48%) · High:51% (779/1536, WLB 48%) · Low:50% (717/1422, WLB 48%)

## Published leg hit rate by lane
- low: 67% (63/94, WLB 57%)
- medium: 52% (74/141, WLB 44%)
- high: 55% (102/184, WLB 48%)
- longshot: 61% (145/238, WLB 55%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 67% → 2-leg ~45%, 3-leg ~30% (rec max 2)
- medium: leg 52% → 2-leg ~28%, 3-leg ~14% (rec max 3)
- high: leg 55% → 2-leg ~31%, 3-leg ~17% (rec max 3)
- longshot: leg 61% → 2-leg ~37%, 3-leg ~23% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 2.2pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
