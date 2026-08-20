# Daily selection learning — through 2026-08-18

Training window: **2026-08-11 → 2026-08-18** (8d). Universe legs:
**4392** (baseline 45.9%). Published legs:
**672**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 54% (863/1597, WLB 52%) shrunk 54%
- **batter_hits_runs_rbis** → `restricted` — 49% (787/1597, WLB 47%) shrunk 49%
- **batter_total_bases** → `disabled` — 38% (271/712, WLB 35%) shrunk 38%
- **pitcher_strikeouts** → `disabled` — 49% (93/191, WLB 42%) shrunk 48%

## Calibration
- Edge inverted at high values: **true** 10-15:45% (261/579, WLB 41%) · 20+:49% (59/120, WLB 40%) · 0-5:50% (644/1281, WLB 48%) · neg:49% (444/903, WLB 46%) · 5-10:50% (482/959, WLB 47%) · 15-20:49% (124/255, WLB 43%)
- Confidence predictive: **false** (spread 1.9pts) High:48% (866/1790, WLB 46%) · Low:50% (837/1665, WLB 48%) · Medium:48% (311/642, WLB 45%)

## Published leg hit rate by lane
- low: 58% (53/91, WLB 48%)
- medium: 55% (80/146, WLB 47%)
- high: 59% (113/192, WLB 52%)
- longshot: 58% (141/243, WLB 52%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 58% → 2-leg ~34%, 3-leg ~20% (rec max 2)
- medium: leg 55% → 2-leg ~30%, 3-leg ~16% (rec max 3)
- high: leg 59% → 2-leg ~35%, 3-leg ~20% (rec max 3)
- longshot: leg 58% → 2-leg ~34%, 3-leg ~20% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 1.9pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
