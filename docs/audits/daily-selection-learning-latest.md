# Daily selection learning — through 2026-10-16

Training window: **2026-10-09 → 2026-10-16** (8d). Universe legs:
**370** (baseline 41.1%). Published legs:
**58**, cards: **22**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 56% (75/135, WLB 47%) shrunk 54%
- **batter_hits_runs_rbis** → `disabled` — 46% (62/135, WLB 38%) shrunk 45%
- **batter_total_bases** → `disabled` — 26% (7/27, WLB 13%) shrunk 32%
- **pitcher_strikeouts** → `insufficient_sample` — 50% (8/16, WLB 28%) shrunk 45%

## Calibration
- Edge inverted at high values: **true** 20+:39% (9/23, WLB 22%) · 0-5:47% (30/64, WLB 35%) · neg:58% (11/19, WLB 36%) · 5-10:47% (45/95, WLB 38%) · 10-15:50% (36/72, WLB 39%) · 15-20:53% (21/40, WLB 38%)
- Confidence predictive: **true** (spread 15.4pts) Low:43% (32/75, WLB 32%) · Medium:58% (18/31, WLB 41%) · High:49% (102/207, WLB 43%)

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
