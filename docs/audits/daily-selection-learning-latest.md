# Daily selection learning — through 2026-07-07

Training window: **2026-06-30 → 2026-07-07** (8d). Universe legs:
**2201** (baseline 48.7%). Published legs:
**0**, cards: **0**. noLiveWire=**true**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 54% (475/874, WLB 51%) shrunk 54%
- **batter_hits_runs_rbis** → `restricted` — 53% (343/645, WLB 49%) shrunk 53%
- **batter_total_bases** → `disabled` — 45% (200/441, WLB 41%) shrunk 45%
- **pitcher_strikeouts** → `disabled` — 46% (53/115, WLB 37%) shrunk 46%

## Calibration
- Edge inverted at high values: **true** 20+:47% (42/90, WLB 37%) · 15-20:43% (59/137, WLB 35%) · neg:53% (249/470, WLB 48%) · 0-5:52% (334/637, WLB 49%) · 10-15:51% (140/275, WLB 45%) · 5-10:53% (247/466, WLB 48%)
- Confidence predictive: **false** (spread 4.2pts) Low:51% (457/892, WLB 48%) · High:51% (445/876, WLB 47%) · Medium:55% (169/307, WLB 49%)

## Published leg hit rate by lane


## Card length (parlay-math projection from observed leg rate)


## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 4.2pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
