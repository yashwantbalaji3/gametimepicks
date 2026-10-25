# Daily selection learning — through 2026-10-24

Training window: **2026-10-17 → 2026-10-24** (8d). Universe legs:
**205** (baseline 57.1%). Published legs:
**0**, cards: **0**. noLiveWire=**true**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 58% (52/89, WLB 48%) shrunk 58%
- **batter_hits_runs_rbis** → `restricted` — 58% (52/89, WLB 48%) shrunk 58%
- **batter_total_bases** → `insufficient_sample` — 53% (9/17, WLB 31%) shrunk 55%
- **pitcher_strikeouts** → `insufficient_sample` — 50% (4/8, WLB 22%) shrunk 55%

## Calibration
- Edge inverted at high values: **true** 20+:57% (4/7, WLB 25%) · 5-10:62% (40/65, WLB 49%) · neg:57% (8/14, WLB 33%) · 0-5:64% (29/45, WLB 50%) · 15-20:41% (9/22, WLB 23%) · 10-15:54% (27/50, WLB 40%)
- Confidence predictive: **true** (spread 8.8pts) Low:61% (23/38, WLB 45%) · High:55% (76/137, WLB 47%) · Medium:64% (18/28, WLB 46%)

## Published leg hit rate by lane


## Card length (parlay-math projection from observed leg rate)


## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- market pitcher_strikeouts: insufficient sample (8)
- market batter_total_bases: insufficient sample (17)

_Recommendation artifact only — no production logic changed by this script._
