# Daily selection learning — through 2026-10-17

Training window: **2026-10-10 → 2026-10-17** (8d). Universe legs:
**411** (baseline 42.8%). Published legs:
**58**, cards: **22**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 56% (86/153, WLB 48%) shrunk 55%
- **batter_hits_runs_rbis** → `disabled` — 47% (72/153, WLB 39%) shrunk 47%
- **batter_total_bases** → `disabled` — 29% (9/31, WLB 16%) shrunk 34%
- **pitcher_strikeouts** → `insufficient_sample` — 53% (9/17, WLB 31%) shrunk 47%

## Calibration
- Edge inverted at high values: **true** 20+:44% (11/25, WLB 27%) · 0-5:51% (38/75, WLB 40%) · neg:55% (12/22, WLB 35%) · 5-10:47% (51/108, WLB 38%) · 10-15:50% (40/80, WLB 39%) · 15-20:55% (24/44, WLB 40%)
- Confidence predictive: **true** (spread 13.2pts) Low:46% (38/83, WLB 35%) · Medium:59% (23/39, WLB 43%) · High:50% (115/232, WLB 43%)

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
- market pitcher_strikeouts: insufficient sample (17)

_Recommendation artifact only — no production logic changed by this script._
