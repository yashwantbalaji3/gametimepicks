# Daily selection learning — through 2026-09-03

Training window: **2026-08-27 → 2026-09-03** (8d). Universe legs:
**3317** (baseline 49.3%). Published legs:
**657**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 55% (665/1217, WLB 52%) shrunk 55%
- **batter_hits_runs_rbis** → `allowed` — 53% (642/1217, WLB 50%) shrunk 53%
- **batter_total_bases** → `high_risk_only` — 47% (253/534, WLB 43%) shrunk 47%
- **pitcher_strikeouts** → `restricted` — 51% (75/147, WLB 43%) shrunk 51%

## Calibration
- Edge inverted at high values: **true** 0-5:55% (506/915, WLB 52%) · 5-10:56% (410/738, WLB 52%) · 15-20:49% (96/196, WLB 42%) · neg:48% (355/740, WLB 44%) · 10-15:51% (226/444, WLB 46%) · 20+:51% (42/82, WLB 41%)
- Confidence predictive: **false** (spread 1.5pts) Medium:53% (243/458, WLB 48%) · Low:52% (660/1279, WLB 49%) · High:53% (732/1378, WLB 50%)

## Published leg hit rate by lane
- low: 66% (62/94, WLB 56%)
- medium: 55% (77/141, WLB 46%)
- high: 53% (97/182, WLB 46%)
- longshot: 59% (142/240, WLB 53%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 66% → 2-leg ~44%, 3-leg ~29% (rec max 2)
- medium: leg 55% → 2-leg ~30%, 3-leg ~16% (rec max 3)
- high: leg 53% → 2-leg ~28%, 3-leg ~15% (rec max 3)
- longshot: leg 59% → 2-leg ~35%, 3-leg ~21% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 1.5pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
