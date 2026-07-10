# Daily selection learning — through 2026-07-09

Training window: **2026-07-02 → 2026-07-09** (8d). Universe legs:
**2729** (baseline 47.8%). Published legs:
**0**, cards: **0**. noLiveWire=**true**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 55% (612/1112, WLB 52%) shrunk 55%
- **batter_hits_runs_rbis** → `restricted` — 51% (378/737, WLB 48%) shrunk 51%
- **batter_total_bases** → `disabled` — 44% (240/545, WLB 40%) shrunk 44%
- **pitcher_strikeouts** → `disabled` — 50% (74/149, WLB 42%) shrunk 49%

## Calibration
- Edge inverted at high values: **true** 15-20:44% (71/160, WLB 37%) · neg:52% (302/582, WLB 48%) · 0-5:52% (418/799, WLB 49%) · 5-10:53% (315/600, WLB 49%) · 10-15:52% (169/328, WLB 46%) · 20+:39% (29/74, WLB 29%)
- Confidence predictive: **false** (spread 2.5pts) High:51% (554/1086, WLB 48%) · Low:51% (539/1061, WLB 48%) · Medium:53% (211/396, WLB 48%)

## Published leg hit rate by lane


## Card length (parlay-math projection from observed leg rate)


## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 2.5pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
