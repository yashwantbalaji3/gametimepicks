# Daily selection learning — through 2026-10-26

Training window: **2026-10-19 → 2026-10-26** (8d). Universe legs:
**166** (baseline 56.0%). Published legs:
**0**, cards: **0**. noLiveWire=**true**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 59% (41/70, WLB 47%) shrunk 58%
- **batter_hits_runs_rbis** → `restricted` — 59% (41/70, WLB 47%) shrunk 58%
- **batter_total_bases** → `insufficient_sample` — 53% (8/15, WLB 30%) shrunk 55%
- **pitcher_strikeouts** → `insufficient_sample` — 43% (3/7, WLB 16%) shrunk 53%

## Calibration
- Edge inverted at high values: **true** 10-15:63% (26/41, WLB 48%) · 5-10:60% (28/47, WLB 45%) · neg:60% (9/15, WLB 36%) · 0-5:58% (22/38, WLB 42%) · 15-20:33% (5/15, WLB 15%) · 20+:50% (3/6, WLB 19%)
- Confidence predictive: **false** (spread 2.3pts) High:57% (59/103, WLB 48%) · Low:57% (21/37, WLB 41%) · Medium:59% (13/22, WLB 39%)

## Published leg hit rate by lane


## Card length (parlay-math projection from observed leg rate)


## Warnings
- small training universe (166 legs) — policy stays conservative
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 2.3pts) — excluded from ranking
- market pitcher_strikeouts: insufficient sample (7)
- market batter_total_bases: insufficient sample (15)

_Recommendation artifact only — no production logic changed by this script._
