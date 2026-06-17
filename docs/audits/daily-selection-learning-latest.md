# Daily selection learning — through 2026-06-16

Training window: **2026-06-09 → 2026-06-16** (8d). Universe legs:
**4194** (baseline 50.6%). Published legs:
**624**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 54% (852/1570, WLB 52%) shrunk 54%
- **batter_hits_runs_rbis** → `restricted` — 50% (784/1570, WLB 47%) shrunk 50%
- **batter_total_bases** → `high_risk_only` — 48% (391/811, WLB 45%) shrunk 48%
- **pitcher_strikeouts** → `disabled` — 47% (94/198, WLB 41%) shrunk 48%

## Calibration
- Edge inverted at high values: **true** 20+:47% (72/152, WLB 40%) · neg:53% (466/878, WLB 50%) · 0-5:52% (650/1261, WLB 49%) · 5-10:49% (490/1003, WLB 46%) · 10-15:50% (285/573, WLB 46%) · 15-20:56% (158/282, WLB 50%)
- Confidence predictive: **false** (spread 4.1pts) Low:53% (916/1733, WLB 51%) · Medium:49% (274/562, WLB 45%) · High:50% (931/1854, WLB 48%)

## Published leg hit rate by lane
- low: 71% (53/75, WLB 60%)
- medium: 63% (90/142, WLB 55%)
- high: 69% (126/182, WLB 62%)
- longshot: 66% (149/225, WLB 60%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 71% → 2-leg ~50%, 3-leg ~35% (rec max 2)
- medium: leg 63% → 2-leg ~40%, 3-leg ~26% (rec max 3)
- high: leg 69% → 2-leg ~48%, 3-leg ~33% (rec max 3)
- longshot: leg 66% → 2-leg ~44%, 3-leg ~29% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 4.1pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
