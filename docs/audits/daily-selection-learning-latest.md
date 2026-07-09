# Daily selection learning — through 2026-07-08

Training window: **2026-07-01 → 2026-07-08** (8d). Universe legs:
**2845** (baseline 47.7%). Published legs:
**0**, cards: **0**. noLiveWire=**true**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 54% (598/1100, WLB 51%) shrunk 54%
- **batter_hits_runs_rbis** → `restricted` — 52% (451/871, WLB 48%) shrunk 52%
- **batter_total_bases** → `disabled` — 44% (239/545, WLB 40%) shrunk 44%
- **pitcher_strikeouts** → `disabled` — 48% (70/145, WLB 40%) shrunk 48%

## Calibration
- Edge inverted at high values: **true** 20+:45% (50/112, WLB 36%) · 15-20:43% (76/176, WLB 36%) · neg:52% (309/599, WLB 48%) · 0-5:52% (432/826, WLB 49%) · 10-15:51% (180/351, WLB 46%) · 5-10:52% (311/597, WLB 48%)
- Confidence predictive: **false** (spread 3.8pts) Low:50% (575/1139, WLB 48%) · High:50% (566/1122, WLB 48%) · Medium:54% (217/400, WLB 49%)

## Published leg hit rate by lane


## Card length (parlay-math projection from observed leg rate)


## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 3.8pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
