# Daily selection learning — through 2026-07-23

Training window: **2026-07-16 → 2026-07-23** (8d). Universe legs:
**896** (baseline 41.9%). Published legs:
**170**, cards: **48**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 52% (154/299, WLB 46%) shrunk 51%
- **batter_hits_runs_rbis** → `disabled` — 47% (141/299, WLB 42%) shrunk 47%
- **batter_total_bases** → `disabled` — 39% (58/147, WLB 32%) shrunk 40%
- **pitcher_strikeouts** → `disabled` — 51% (22/43, WLB 37%) shrunk 48%

## Calibration
- Edge inverted at high values: **true** 20+:39% (9/23, WLB 22%) · 10-15:42% (50/118, WLB 34%) · neg:47% (76/161, WLB 40%) · 0-5:52% (122/235, WLB 46%) · 5-10:47% (96/203, WLB 41%) · 15-20:46% (22/48, WLB 33%)
- Confidence predictive: **true** (spread 9.4pts) Low:52% (163/315, WLB 46%) · High:46% (168/369, WLB 41%) · Medium:42% (44/104, WLB 33%)

## Published leg hit rate by lane
- low: 57% (13/23, WLB 37%)
- medium: 59% (22/37, WLB 43%)
- high: 55% (27/49, WLB 41%)
- longshot: 52% (32/61, WLB 40%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 57% → 2-leg ~32%, 3-leg ~18% (rec max 2)
- medium: leg 59% → 2-leg ~35%, 3-leg ~21% (rec max 3)
- high: leg 55% → 2-leg ~30%, 3-leg ~17% (rec max 3)
- longshot: leg 52% → 2-leg ~28%, 3-leg ~14% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote

_Recommendation artifact only — no production logic changed by this script._
