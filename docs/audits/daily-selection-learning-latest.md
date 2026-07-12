# Daily selection learning — through 2026-07-11

Training window: **2026-07-04 → 2026-07-11** (8d). Universe legs:
**2588** (baseline 45.7%). Published legs:
**0**, cards: **0**. noLiveWire=**true**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 54% (616/1131, WLB 52%) shrunk 54%
- **batter_hits_runs_rbis** → `disabled` — 47% (280/600, WLB 43%) shrunk 47%
- **batter_total_bases** → `disabled` — 42% (209/498, WLB 38%) shrunk 42%
- **pitcher_strikeouts** → `disabled` — 50% (78/155, WLB 43%) shrunk 50%

## Calibration
- Edge inverted at high values: **true** neg:52% (282/544, WLB 48%) · 20+:37% (28/75, WLB 27%) · 0-5:53% (413/786, WLB 49%) · 5-10:49% (264/534, WLB 45%) · 10-15:44% (131/298, WLB 38%) · 15-20:44% (65/147, WLB 36%)
- Confidence predictive: **true** (spread 5.4pts) Low:51% (521/1021, WLB 48%) · Medium:52% (202/385, WLB 47%) · High:47% (460/978, WLB 44%)

## Published leg hit rate by lane


## Card length (parlay-math projection from observed leg rate)


## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote

_Recommendation artifact only — no production logic changed by this script._
