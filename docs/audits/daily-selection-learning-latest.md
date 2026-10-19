# Daily selection learning — through 2026-10-18

Training window: **2026-10-11 → 2026-10-18** (8d). Universe legs:
**411** (baseline 45.5%). Published legs:
**58**, cards: **22**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 57% (89/155, WLB 50%) shrunk 56%
- **batter_hits_runs_rbis** → `restricted` — 51% (79/155, WLB 43%) shrunk 50%
- **batter_total_bases** → `disabled` — 35% (11/31, WLB 21%) shrunk 39%
- **pitcher_strikeouts** → `insufficient_sample` — 47% (8/17, WLB 26%) shrunk 46%

## Calibration
- Edge inverted at high values: **true** 0-5:55% (41/75, WLB 43%) · neg:55% (12/22, WLB 35%) · 5-10:51% (57/112, WLB 42%) · 10-15:49% (42/85, WLB 39%) · 15-20:57% (25/44, WLB 42%) · 20+:50% (10/20, WLB 30%)
- Confidence predictive: **true** (spread 17.7pts) Medium:66% (25/38, WLB 50%) · Low:48% (38/79, WLB 37%) · High:51% (124/241, WLB 45%)

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
