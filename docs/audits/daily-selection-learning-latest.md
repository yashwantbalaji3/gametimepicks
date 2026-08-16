# Daily selection learning — through 2026-08-15

Training window: **2026-08-08 → 2026-08-15** (8d). Universe legs:
**4402** (baseline 46.1%). Published legs:
**665**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 54% (862/1607, WLB 51%) shrunk 54%
- **batter_hits_runs_rbis** → `restricted` — 50% (797/1607, WLB 47%) shrunk 50%
- **batter_total_bases** → `disabled` — 38% (271/711, WLB 35%) shrunk 38%
- **pitcher_strikeouts** → `restricted` — 50% (98/196, WLB 43%) shrunk 50%

## Calibration
- Edge inverted at high values: **true** 15-20:48% (121/251, WLB 42%) · 0-5:49% (624/1282, WLB 46%) · neg:52% (484/930, WLB 49%) · 10-15:47% (262/557, WLB 43%) · 5-10:49% (470/967, WLB 45%) · 20+:50% (67/134, WLB 42%)
- Confidence predictive: **false** (spread 4.9pts) High:48% (852/1772, WLB 46%) · Low:51% (891/1735, WLB 49%) · Medium:46% (285/614, WLB 43%)

## Published leg hit rate by lane
- low: 63% (59/93, WLB 53%)
- medium: 58% (84/144, WLB 50%)
- high: 61% (115/188, WLB 54%)
- longshot: 61% (147/240, WLB 55%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 63% → 2-leg ~40%, 3-leg ~26% (rec max 2)
- medium: leg 58% → 2-leg ~34%, 3-leg ~20% (rec max 3)
- high: leg 61% → 2-leg ~37%, 3-leg ~23% (rec max 3)
- longshot: leg 61% → 2-leg ~38%, 3-leg ~23% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 4.9pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
