# Daily selection learning — through 2026-08-28

Training window: **2026-08-21 → 2026-08-28** (8d). Universe legs:
**3942** (baseline 47.5%). Published legs:
**664**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits_runs_rbis** → `restricted` — 51% (747/1477, WLB 48%) shrunk 51%
- **batter_hits** → `allowed` — 54% (796/1475, WLB 51%) shrunk 54%
- **batter_total_bases** → `disabled` — 42% (241/568, WLB 38%) shrunk 43%
- **pitcher_strikeouts** → `disabled` — 50% (87/173, WLB 43%) shrunk 50%

## Calibration
- Edge inverted at high values: **true** 5-10:53% (466/882, WLB 50%) · 10-15:48% (275/575, WLB 44%) · 0-5:52% (569/1085, WLB 49%) · neg:50% (391/779, WLB 47%) · 15-20:44% (112/252, WLB 38%) · 20+:48% (58/120, WLB 40%)
- Confidence predictive: **true** (spread 5.0pts) High:50% (851/1707, WLB 47%) · Low:50% (727/1452, WLB 48%) · Medium:55% (293/534, WLB 51%)

## Published leg hit rate by lane
- low: 63% (59/94, WLB 53%)
- medium: 59% (87/148, WLB 51%)
- high: 57% (106/187, WLB 50%)
- longshot: 63% (149/235, WLB 57%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 63% → 2-leg ~39%, 3-leg ~25% (rec max 2)
- medium: leg 59% → 2-leg ~35%, 3-leg ~20% (rec max 3)
- high: leg 57% → 2-leg ~32%, 3-leg ~18% (rec max 3)
- longshot: leg 63% → 2-leg ~40%, 3-leg ~26% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote

_Recommendation artifact only — no production logic changed by this script._
