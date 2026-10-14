# Daily selection learning — through 2026-10-13

Training window: **2026-10-06 → 2026-10-13** (8d). Universe legs:
**459** (baseline 46.4%). Published legs:
**93**, cards: **27**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 56% (106/189, WLB 49%) shrunk 55%
- **batter_hits_runs_rbis** → `disabled` — 47% (88/189, WLB 40%) shrunk 47%
- **batter_total_bases** → `disabled` — 18% (7/38, WLB 9%) shrunk 28%
- **pitcher_strikeouts** → `disabled` — 55% (12/22, WLB 35%) shrunk 51%

## Calibration
- Edge inverted at high values: **true** 10-15:47% (48/103, WLB 37%) · 5-10:52% (61/118, WLB 43%) · 15-20:41% (23/56, WLB 29%) · 0-5:52% (49/95, WLB 42%) · neg:56% (19/34, WLB 39%) · 20+:41% (13/32, WLB 26%)
- Confidence predictive: **true** (spread 5.2pts) High:48% (132/277, WLB 42%) · Low:49% (53/108, WLB 40%) · Medium:53% (28/53, WLB 40%)

## Published leg hit rate by lane
- low: 73% (11/15, WLB 48%)
- medium: 71% (15/21, WLB 50%)
- high: 73% (19/26, WLB 54%)
- longshot: 68% (21/31, WLB 50%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 73% → 2-leg ~54%, 3-leg ~39% (rec max 2)
- medium: leg 71% → 2-leg ~51%, 3-leg ~36% (rec max 3)
- high: leg 73% → 2-leg ~53%, 3-leg ~39% (rec max 3)
- longshot: leg 68% → 2-leg ~46%, 3-leg ~31% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote

_Recommendation artifact only — no production logic changed by this script._
