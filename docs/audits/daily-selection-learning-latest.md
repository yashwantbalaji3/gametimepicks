# Daily selection learning — through 2026-10-27

Training window: **2026-10-20 → 2026-10-27** (8d). Universe legs:
**147** (baseline 55.1%). Published legs:
**0**, cards: **0**. noLiveWire=**true**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 59% (36/61, WLB 47%) shrunk 58%
- **batter_hits_runs_rbis** → `restricted` — 56% (34/61, WLB 43%) shrunk 56%
- **batter_total_bases** → `insufficient_sample` — 50% (7/14, WLB 27%) shrunk 53%
- **pitcher_strikeouts** → `insufficient_sample` — 57% (4/7, WLB 25%) shrunk 56%

## Calibration
- Edge inverted at high values: **true** 5-10:56% (22/39, WLB 41%) · neg:59% (10/17, WLB 36%) · 0-5:57% (21/37, WLB 41%) · 10-15:69% (24/35, WLB 52%) · 15-20:20% (2/10, WLB 6%) · 20+:40% (2/5, WLB 12%)
- Confidence predictive: **false** (spread 1.6pts) High:57% (48/84, WLB 46%) · Low:56% (23/41, WLB 41%) · Medium:56% (10/18, WLB 34%)

## Published leg hit rate by lane


## Card length (parlay-math projection from observed leg rate)


## Warnings
- small training universe (147 legs) — policy stays conservative
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 1.6pts) — excluded from ranking
- market pitcher_strikeouts: insufficient sample (7)
- market batter_total_bases: insufficient sample (14)

_Recommendation artifact only — no production logic changed by this script._
