# Daily selection learning — through 2026-10-23

Training window: **2026-10-16 → 2026-10-23** (8d). Universe legs:
**205** (baseline 42.9%). Published legs:
**0**, cards: **1**. noLiveWire=**true**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `disabled` — 54% (38/71, WLB 42%) shrunk 51%
- **batter_hits_runs_rbis** → `disabled` — 54% (38/71, WLB 42%) shrunk 51%
- **batter_total_bases** → `insufficient_sample` — 57% (8/14, WLB 33%) shrunk 49%
- **pitcher_strikeouts** → `insufficient_sample` — 67% (4/6, WLB 30%) shrunk 48%

## Calibration
- Edge inverted at high values: **true** neg:55% (6/11, WLB 28%) · 5-10:62% (32/52, WLB 48%) · 0-5:62% (21/34, WLB 45%) · 15-20:42% (8/19, WLB 23%) · 10-15:44% (18/41, WLB 30%) · 20+:60% (3/5, WLB 23%)
- Confidence predictive: **true** (spread 11.8pts) Low:57% (16/28, WLB 39%) · High:52% (58/112, WLB 43%) · Medium:64% (14/22, WLB 43%)

## Published leg hit rate by lane


## Card length (parlay-math projection from observed leg rate)


## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- market batter_total_bases: insufficient sample (14)
- market pitcher_strikeouts: insufficient sample (6)

_Recommendation artifact only — no production logic changed by this script._
