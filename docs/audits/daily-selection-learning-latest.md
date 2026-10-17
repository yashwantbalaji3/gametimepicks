# Daily selection learning — through 2026-10-15

Training window: **2026-10-08 → 2026-10-15** (8d). Universe legs:
**367** (baseline 48.5%). Published legs:
**58**, cards: **21**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 58% (87/151, WLB 50%) shrunk 57%
- **batter_hits_runs_rbis** → `disabled` — 48% (73/151, WLB 41%) shrunk 48%
- **batter_total_bases** → `disabled` — 23% (7/30, WLB 12%) shrunk 33%
- **pitcher_strikeouts** → `insufficient_sample` — 58% (11/19, WLB 36%) shrunk 53%

## Calibration
- Edge inverted at high values: **true** 0-5:53% (41/77, WLB 42%) · 10-15:49% (38/77, WLB 38%) · 5-10:49% (51/104, WLB 40%) · neg:62% (13/21, WLB 41%) · 15-20:51% (23/45, WLB 37%) · 20+:44% (12/27, WLB 28%)
- Confidence predictive: **true** (spread 14.3pts) Medium:63% (25/40, WLB 47%) · Low:48% (41/85, WLB 38%) · High:50% (112/226, WLB 43%)

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
- market pitcher_strikeouts: insufficient sample (19)

_Recommendation artifact only — no production logic changed by this script._
