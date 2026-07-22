# Daily selection learning — through 2026-07-21

Training window: **2026-07-14 → 2026-07-21** (8d). Universe legs:
**72** (baseline 31.9%). Published legs:
**0**, cards: **0**. noLiveWire=**true**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `insufficient_sample` — 46% (6/13, WLB 23%) shrunk 38%
- **batter_hits_runs_rbis** → `insufficient_sample` — 69% (9/13, WLB 42%) shrunk 47%
- **batter_total_bases** → `insufficient_sample` — 50% (5/10, WLB 24%) shrunk 38%
- **pitcher_strikeouts** → `insufficient_sample` — 50% (3/6, WLB 19%) shrunk 36%

## Calibration
- Edge inverted at high values: **false** 20+:50% (1/2, WLB 9%) · 10-15:67% (2/3, WLB 21%) · neg:58% (7/12, WLB 32%) · 0-5:50% (8/16, WLB 28%) · 5-10:56% (5/9, WLB 27%)
- Confidence predictive: **true** (spread 21.6pts) Low:59% (13/22, WLB 39%) · High:58% (7/12, WLB 32%) · Medium:38% (3/8, WLB 14%)

## Published leg hit rate by lane


## Card length (parlay-math projection from observed leg rate)


## Warnings
- small training universe (72 legs) — policy stays conservative
- market pitcher_strikeouts: insufficient sample (6)
- market batter_hits: insufficient sample (13)
- market batter_total_bases: insufficient sample (10)
- market batter_hits_runs_rbis: insufficient sample (13)

_Recommendation artifact only — no production logic changed by this script._
