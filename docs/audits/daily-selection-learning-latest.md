# Daily selection learning — through 2026-10-19

Training window: **2026-10-12 → 2026-10-19** (8d). Universe legs:
**411** (baseline 45.3%). Published legs:
**58**, cards: **21**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 56% (88/156, WLB 49%) shrunk 55%
- **batter_hits_runs_rbis** → `disabled` — 51% (79/156, WLB 43%) shrunk 50%
- **batter_total_bases** → `disabled` — 38% (12/32, WLB 23%) shrunk 40%
- **pitcher_strikeouts** → `insufficient_sample` — 44% (7/16, WLB 23%) shrunk 45%

## Calibration
- Edge inverted at high values: **true** neg:55% (12/22, WLB 35%) · 0-5:53% (44/83, WLB 42%) · 5-10:52% (59/114, WLB 43%) · 10-15:47% (40/86, WLB 36%) · 15-20:59% (22/37, WLB 43%) · 20+:50% (9/18, WLB 29%)
- Confidence predictive: **true** (spread 16.3pts) Low:47% (36/77, WLB 36%) · Medium:63% (29/46, WLB 49%) · High:51% (121/237, WLB 45%)

## Published leg hit rate by lane
- low: 64% (9/14, WLB 39%)
- medium: 45% (9/20, WLB 26%)
- high: 50% (12/24, WLB 31%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 64% → 2-leg ~41%, 3-leg ~27% (rec max 2)
- medium: leg 45% → 2-leg ~20%, 3-leg ~9% (rec max 3)
- high: leg 50% → 2-leg ~25%, 3-leg ~13% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- market pitcher_strikeouts: insufficient sample (16)

_Recommendation artifact only — no production logic changed by this script._
