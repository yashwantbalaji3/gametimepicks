# Daily selection learning — through 2026-10-04

Training window: **2026-09-27 → 2026-10-04** (8d). Universe legs:
**1051** (baseline 42.2%). Published legs:
**373**, cards: **114**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 52% (206/400, WLB 47%) shrunk 51%
- **batter_hits_runs_rbis** → `disabled` — 46% (175/379, WLB 41%) shrunk 46%
- **batter_total_bases** → `disabled` — 45% (44/98, WLB 35%) shrunk 44%
- **pitcher_strikeouts** → `disabled` — 40% (18/45, WLB 27%) shrunk 41%

## Calibration
- Edge inverted at high values: **true** neg:53% (70/132, WLB 45%) · 0-5:52% (122/236, WLB 45%) · 5-10:46% (104/225, WLB 40%) · 10-15:43% (78/183, WLB 36%) · 20+:48% (22/46, WLB 34%) · 15-20:47% (47/100, WLB 38%)
- Confidence predictive: **true** (spread 8.9pts) Low:54% (161/298, WLB 48%) · Medium:45% (53/117, WLB 37%) · High:45% (229/507, WLB 41%)

## Published leg hit rate by lane
- low: 40% (23/57, WLB 29%)
- medium: 47% (40/86, WLB 36%)
- high: 49% (57/116, WLB 40%)
- longshot: 44% (50/114, WLB 35%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 40% → 2-leg ~16%, 3-leg ~7% (rec max 2)
- medium: leg 47% → 2-leg ~22%, 3-leg ~10% (rec max 3)
- high: leg 49% → 2-leg ~24%, 3-leg ~12% (rec max 3)
- longshot: leg 44% → 2-leg ~19%, 3-leg ~8% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote

_Recommendation artifact only — no production logic changed by this script._
