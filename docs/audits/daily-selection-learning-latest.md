# Daily selection learning — through 2026-09-24

Training window: **2026-09-17 → 2026-09-24** (8d). Universe legs:
**3929** (baseline 46.1%). Published legs:
**657**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 56% (789/1415, WLB 53%) shrunk 56%
- **batter_hits_runs_rbis** → `restricted` — 49% (690/1407, WLB 46%) shrunk 49%
- **batter_total_bases** → `disabled` — 43% (241/562, WLB 39%) shrunk 43%
- **pitcher_strikeouts** → `restricted` — 51% (91/180, WLB 43%) shrunk 50%

## Calibration
- Edge inverted at high values: **true** 10-15:49% (287/589, WLB 45%) · 5-10:52% (443/858, WLB 48%) · neg:50% (368/731, WLB 47%) · 0-5:54% (527/975, WLB 51%) · 15-20:46% (124/271, WLB 40%) · 20+:44% (62/140, WLB 36%)
- Confidence predictive: **false** (spread 4.6pts) High:50% (853/1717, WLB 47%) · Low:51% (718/1405, WLB 48%) · Medium:54% (240/442, WLB 50%)

## Published leg hit rate by lane
- low: 62% (56/90, WLB 52%)
- medium: 53% (77/146, WLB 45%)
- high: 55% (102/186, WLB 48%)
- longshot: 56% (131/235, WLB 49%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 62% → 2-leg ~39%, 3-leg ~24% (rec max 2)
- medium: leg 53% → 2-leg ~28%, 3-leg ~15% (rec max 3)
- high: leg 55% → 2-leg ~30%, 3-leg ~17% (rec max 3)
- longshot: leg 56% → 2-leg ~31%, 3-leg ~17% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 4.6pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
