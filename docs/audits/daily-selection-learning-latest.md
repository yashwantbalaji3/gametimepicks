# Daily selection learning — through 2026-09-18

Training window: **2026-09-11 → 2026-09-18** (8d). Universe legs:
**4402** (baseline 47.9%). Published legs:
**662**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 57% (911/1604, WLB 54%) shrunk 57%
- **batter_hits_runs_rbis** → `restricted` — 51% (812/1594, WLB 48%) shrunk 51%
- **batter_total_bases** → `disabled` — 44% (287/649, WLB 40%) shrunk 44%
- **pitcher_strikeouts** → `disabled` — 48% (97/203, WLB 41%) shrunk 48%

## Calibration
- Edge inverted at high values: **true** 20+:57% (77/135, WLB 49%) · neg:52% (423/818, WLB 48%) · 0-5:52% (638/1217, WLB 50%) · 5-10:52% (499/961, WLB 49%) · 15-20:49% (146/297, WLB 44%) · 10-15:52% (324/622, WLB 48%)
- Confidence predictive: **false** (spread 1.0pts) Low:53% (848/1614, WLB 50%) · Medium:52% (290/556, WLB 48%) · High:52% (969/1880, WLB 49%)

## Published leg hit rate by lane
- low: 72% (67/93, WLB 62%)
- medium: 59% (85/145, WLB 50%)
- high: 61% (115/189, WLB 54%)
- longshot: 62% (146/235, WLB 56%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 72% → 2-leg ~52%, 3-leg ~37% (rec max 2)
- medium: leg 59% → 2-leg ~34%, 3-leg ~20% (rec max 3)
- high: leg 61% → 2-leg ~37%, 3-leg ~23% (rec max 3)
- longshot: leg 62% → 2-leg ~39%, 3-leg ~24% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 1.0pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
