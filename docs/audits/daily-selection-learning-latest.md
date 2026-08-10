# Daily selection learning — through 2026-08-09

Training window: **2026-08-02 → 2026-08-09** (8d). Universe legs:
**3668** (baseline 46.0%). Published legs:
**576**, cards: **168**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 52% (719/1373, WLB 50%) shrunk 52%
- **batter_hits_runs_rbis** → `restricted` — 49% (634/1288, WLB 47%) shrunk 49%
- **batter_total_bases** → `disabled` — 40% (257/636, WLB 37%) shrunk 41%
- **pitcher_strikeouts** → `disabled` — 47% (78/167, WLB 39%) shrunk 47%

## Calibration
- Edge inverted at high values: **true** neg:52% (457/881, WLB 49%) · 0-5:48% (529/1096, WLB 45%) · 5-10:48% (381/800, WLB 44%) · 15-20:44% (88/202, WLB 37%) · 20+:51% (45/89, WLB 40%) · 10-15:47% (188/396, WLB 43%)
- Confidence predictive: **false** (spread 4.0pts) Low:51% (792/1556, WLB 48%) · Medium:47% (239/510, WLB 43%) · High:47% (657/1398, WLB 44%)

## Published leg hit rate by lane
- low: 60% (49/82, WLB 49%)
- medium: 61% (81/133, WLB 52%)
- high: 55% (87/159, WLB 47%)
- longshot: 60% (122/202, WLB 54%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 60% → 2-leg ~36%, 3-leg ~21% (rec max 2)
- medium: leg 61% → 2-leg ~37%, 3-leg ~23% (rec max 3)
- high: leg 55% → 2-leg ~30%, 3-leg ~16% (rec max 3)
- longshot: leg 60% → 2-leg ~37%, 3-leg ~22% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 4.0pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
