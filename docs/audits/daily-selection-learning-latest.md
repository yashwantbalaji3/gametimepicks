# Daily selection learning — through 2026-08-12

Training window: **2026-08-05 → 2026-08-12** (8d). Universe legs:
**4565** (baseline 45.8%). Published legs:
**666**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 52% (870/1659, WLB 50%) shrunk 52%
- **batter_hits_runs_rbis** → `restricted` — 49% (815/1659, WLB 47%) shrunk 49%
- **batter_total_bases** → `disabled` — 40% (316/781, WLB 37%) shrunk 41%
- **pitcher_strikeouts** → `disabled` — 45% (91/204, WLB 38%) shrunk 45%

## Calibration
- Edge inverted at high values: **true** 0-5:48% (665/1372, WLB 46%) · neg:51% (537/1057, WLB 48%) · 5-10:48% (472/984, WLB 45%) · 10-15:46% (245/530, WLB 42%) · 20+:50% (61/122, WLB 41%) · 15-20:47% (112/238, WLB 41%)
- Confidence predictive: **false** (spread 4.5pts) Medium:46% (297/643, WLB 42%) · Low:51% (967/1909, WLB 48%) · High:47% (828/1751, WLB 45%)

## Published leg hit rate by lane
- low: 60% (56/93, WLB 50%)
- medium: 59% (87/148, WLB 51%)
- high: 60% (112/188, WLB 52%)
- longshot: 61% (144/237, WLB 54%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 60% → 2-leg ~36%, 3-leg ~22% (rec max 2)
- medium: leg 59% → 2-leg ~35%, 3-leg ~20% (rec max 3)
- high: leg 60% → 2-leg ~36%, 3-leg ~21% (rec max 3)
- longshot: leg 61% → 2-leg ~37%, 3-leg ~22% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 4.5pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
