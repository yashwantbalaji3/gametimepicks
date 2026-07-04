# Daily selection learning — through 2026-07-03

Training window: **2026-06-26 → 2026-07-03** (8d). Universe legs:
**1423** (baseline 49.6%). Published legs:
**0**, cards: **0**. noLiveWire=**true**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 56% (284/509, WLB 51%) shrunk 56%
- **batter_hits_runs_rbis** → `restricted` — 54% (273/508, WLB 49%) shrunk 54%
- **batter_total_bases** → `disabled` — 47% (121/258, WLB 41%) shrunk 47%
- **pitcher_strikeouts** → `disabled` — 45% (28/62, WLB 33%) shrunk 46%

## Calibration
- Edge inverted at high values: **true** 20+:44% (31/70, WLB 33%) · 15-20:42% (41/97, WLB 33%) · neg:56% (166/298, WLB 50%) · 0-5:51% (202/394, WLB 46%) · 10-15:55% (100/182, WLB 48%) · 5-10:56% (166/296, WLB 50%)
- Confidence predictive: **false** (spread 2.8pts) Low:52% (298/576, WLB 48%) · High:53% (306/574, WLB 49%) · Medium:55% (102/187, WLB 47%)

## Published leg hit rate by lane


## Card length (parlay-math projection from observed leg rate)


## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 2.8pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
