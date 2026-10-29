# Daily selection learning — through 2026-10-28

Training window: **2026-10-21 → 2026-10-28** (8d). Universe legs:
**187** (baseline 54.0%). Published legs:
**0**, cards: **0**. noLiveWire=**true**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 59% (47/79, WLB 48%) shrunk 58%
- **batter_hits_runs_rbis** → `disabled` — 53% (42/79, WLB 42%) shrunk 53%
- **batter_total_bases** → `insufficient_sample` — 47% (8/17, WLB 26%) shrunk 51%
- **pitcher_strikeouts** → `insufficient_sample` — 50% (4/8, WLB 22%) shrunk 53%

## Calibration
- Edge inverted at high values: **true** 5-10:56% (30/54, WLB 42%) · neg:58% (11/19, WLB 36%) · 0-5:62% (28/45, WLB 48%) · 10-15:58% (26/45, WLB 43%) · 15-20:18% (2/11, WLB 5%) · 20+:44% (4/9, WLB 19%)
- Confidence predictive: **true** (spread 9.2pts) High:53% (58/110, WLB 43%) · Low:58% (30/52, WLB 44%) · Medium:62% (13/21, WLB 41%)

## Published leg hit rate by lane


## Card length (parlay-math projection from observed leg rate)


## Warnings
- small training universe (187 legs) — policy stays conservative
- edge signal is INVERTED at high values — edge capped, not used to promote
- market pitcher_strikeouts: insufficient sample (8)
- market batter_total_bases: insufficient sample (17)

_Recommendation artifact only — no production logic changed by this script._
