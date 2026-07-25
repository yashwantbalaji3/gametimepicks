# Daily selection learning — through 2026-07-24

Training window: **2026-07-17 → 2026-07-24** (8d). Universe legs:
**1540** (baseline 43.2%). Published legs:
**256**, cards: **72**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 51% (272/530, WLB 47%) shrunk 51%
- **batter_hits_runs_rbis** → `restricted` — 48% (256/530, WLB 44%) shrunk 48%
- **batter_total_bases** → `disabled` — 40% (100/253, WLB 34%) shrunk 40%
- **pitcher_strikeouts** → `disabled` — 52% (38/73, WLB 41%) shrunk 50%

## Calibration
- Edge inverted at high values: **true** 20+:40% (16/40, WLB 26%) · 10-15:51% (105/207, WLB 44%) · neg:45% (137/302, WLB 40%) · 0-5:51% (204/401, WLB 46%) · 5-10:47% (167/352, WLB 42%) · 15-20:44% (37/84, WLB 34%)
- Confidence predictive: **false** (spread 2.6pts) Low:49% (267/548, WLB 45%) · High:48% (309/643, WLB 44%) · Medium:46% (90/195, WLB 39%)

## Published leg hit rate by lane
- low: 59% (20/34, WLB 42%)
- medium: 64% (37/58, WLB 51%)
- high: 57% (42/74, WLB 45%)
- longshot: 60% (54/90, WLB 50%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 59% → 2-leg ~35%, 3-leg ~20% (rec max 2)
- medium: leg 64% → 2-leg ~41%, 3-leg ~26% (rec max 3)
- high: leg 57% → 2-leg ~32%, 3-leg ~18% (rec max 3)
- longshot: leg 60% → 2-leg ~36%, 3-leg ~22% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 2.6pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
