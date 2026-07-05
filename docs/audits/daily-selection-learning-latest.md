# Daily selection learning — through 2026-07-04

Training window: **2026-06-27 → 2026-07-04** (8d). Universe legs:
**1733** (baseline 48.9%). Published legs:
**0**, cards: **0**. noLiveWire=**true**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 54% (373/689, WLB 50%) shrunk 54%
- **batter_hits_runs_rbis** → `restricted` — 54% (273/508, WLB 49%) shrunk 54%
- **batter_total_bases** → `disabled` — 46% (161/347, WLB 41%) shrunk 47%
- **pitcher_strikeouts** → `disabled` — 48% (41/85, WLB 38%) shrunk 48%

## Calibration
- Edge inverted at high values: **true** 20+:46% (36/78, WLB 36%) · 15-20:42% (45/107, WLB 33%) · neg:54% (198/366, WLB 49%) · 0-5:51% (256/498, WLB 47%) · 10-15:54% (117/218, WLB 47%) · 5-10:54% (196/362, WLB 49%)
- Confidence predictive: **false** (spread 4.0pts) Low:51% (361/707, WLB 47%) · High:52% (357/686, WLB 48%) · Medium:55% (130/236, WLB 49%)

## Published leg hit rate by lane


## Card length (parlay-math projection from observed leg rate)


## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 4.0pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
