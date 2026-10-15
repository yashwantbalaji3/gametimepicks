# Daily selection learning — through 2026-10-14

Training window: **2026-10-07 → 2026-10-14** (8d). Universe legs:
**427** (baseline 46.8%). Published legs:
**91**, cards: **27**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 58% (102/176, WLB 51%) shrunk 57%
- **batter_hits_runs_rbis** → `disabled` — 47% (82/176, WLB 39%) shrunk 47%
- **batter_total_bases** → `disabled` — 19% (7/36, WLB 10%) shrunk 29%
- **pitcher_strikeouts** → `disabled` — 45% (9/20, WLB 26%) shrunk 46%

## Calibration
- Edge inverted at high values: **true** 0-5:54% (50/93, WLB 44%) · neg:56% (18/32, WLB 39%) · 10-15:47% (42/89, WLB 37%) · 5-10:48% (55/114, WLB 39%) · 20+:45% (13/29, WLB 28%) · 15-20:43% (22/51, WLB 31%)
- Confidence predictive: **true** (spread 14.4pts) Low:49% (51/105, WLB 39%) · High:47% (119/254, WLB 41%) · Medium:61% (30/49, WLB 47%)

## Published leg hit rate by lane
- low: 69% (9/13, WLB 42%)
- medium: 71% (15/21, WLB 50%)
- high: 73% (19/26, WLB 54%)
- longshot: 68% (21/31, WLB 50%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 69% → 2-leg ~48%, 3-leg ~33% (rec max 2)
- medium: leg 71% → 2-leg ~51%, 3-leg ~36% (rec max 3)
- high: leg 73% → 2-leg ~53%, 3-leg ~39% (rec max 3)
- longshot: leg 68% → 2-leg ~46%, 3-leg ~31% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote

_Recommendation artifact only — no production logic changed by this script._
