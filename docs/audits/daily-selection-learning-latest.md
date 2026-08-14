# Daily selection learning — through 2026-08-13

Training window: **2026-08-06 → 2026-08-13** (8d). Universe legs:
**4296** (baseline 46.1%). Published legs:
**659**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 53% (818/1558, WLB 50%) shrunk 52%
- **batter_hits_runs_rbis** → `restricted` — 50% (780/1558, WLB 48%) shrunk 50%
- **batter_total_bases** → `disabled` — 41% (292/720, WLB 37%) shrunk 41%
- **pitcher_strikeouts** → `disabled` — 47% (91/192, WLB 40%) shrunk 47%

## Calibration
- Edge inverted at high values: **true** 5-10:48% (457/951, WLB 45%) · neg:52% (503/974, WLB 49%) · 0-5:49% (615/1253, WLB 46%) · 10-15:47% (236/507, WLB 42%) · 20+:51% (59/115, WLB 42%) · 15-20:49% (111/228, WLB 42%)
- Confidence predictive: **false** (spread 4.9pts) High:48% (803/1684, WLB 45%) · Low:51% (904/1756, WLB 49%) · Medium:47% (274/588, WLB 43%)

## Published leg hit rate by lane
- low: 62% (58/93, WLB 52%)
- medium: 58% (84/144, WLB 50%)
- high: 63% (116/184, WLB 56%)
- longshot: 61% (145/238, WLB 55%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 62% → 2-leg ~39%, 3-leg ~24% (rec max 2)
- medium: leg 58% → 2-leg ~34%, 3-leg ~20% (rec max 3)
- high: leg 63% → 2-leg ~40%, 3-leg ~25% (rec max 3)
- longshot: leg 61% → 2-leg ~37%, 3-leg ~23% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 4.9pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
