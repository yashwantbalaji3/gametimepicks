# Daily selection learning — through 2026-07-01

Training window: **2026-06-24 → 2026-07-01** (8d). Universe legs:
**1080** (baseline 46.0%). Published legs:
**0**, cards: **0**. noLiveWire=**true**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 51% (198/389, WLB 46%) shrunk 51%
- **batter_hits_runs_rbis** → `restricted` — 51% (196/388, WLB 46%) shrunk 50%
- **batter_total_bases** → `disabled` — 46% (86/187, WLB 39%) shrunk 46%
- **pitcher_strikeouts** → `disabled` — 37% (17/46, WLB 25%) shrunk 40%

## Calibration
- Edge inverted at high values: **true** neg:54% (120/224, WLB 47%) · 0-5:49% (135/275, WLB 43%) · 5-10:49% (113/231, WLB 43%) · 10-15:47% (64/137, WLB 39%) · 15-20:43% (32/75, WLB 32%) · 20+:49% (33/68, WLB 37%)
- Confidence predictive: **true** (spread 7.6pts) Low:50% (219/441, WLB 45%) · Medium:55% (69/126, WLB 46%) · High:47% (209/443, WLB 43%)

## Published leg hit rate by lane


## Card length (parlay-math projection from observed leg rate)


## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote

_Recommendation artifact only — no production logic changed by this script._
