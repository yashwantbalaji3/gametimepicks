# Daily selection learning — through 2026-09-20

Training window: **2026-09-13 → 2026-09-20** (8d). Universe legs:
**4351** (baseline 47.0%). Published legs:
**672**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 57% (890/1573, WLB 54%) shrunk 56%
- **batter_hits_runs_rbis** → `restricted` — 50% (786/1564, WLB 48%) shrunk 50%
- **batter_total_bases** → `disabled` — 41% (261/644, WLB 37%) shrunk 41%
- **pitcher_strikeouts** → `restricted` — 53% (108/204, WLB 46%) shrunk 52%

## Calibration
- Edge inverted at high values: **true** 10-15:51% (327/643, WLB 47%) · 5-10:51% (483/942, WLB 48%) · 0-5:53% (610/1149, WLB 50%) · neg:52% (417/807, WLB 48%) · 15-20:46% (142/312, WLB 40%) · 20+:50% (66/132, WLB 42%)
- Confidence predictive: **false** (spread 2.3pts) High:50% (951/1896, WLB 48%) · Low:52% (834/1590, WLB 50%) · Medium:52% (260/499, WLB 48%)

## Published leg hit rate by lane
- low: 72% (68/94, WLB 63%)
- medium: 55% (82/149, WLB 47%)
- high: 60% (113/189, WLB 53%)
- longshot: 60% (143/240, WLB 53%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 72% → 2-leg ~52%, 3-leg ~38% (rec max 2)
- medium: leg 55% → 2-leg ~30%, 3-leg ~17% (rec max 3)
- high: leg 60% → 2-leg ~36%, 3-leg ~21% (rec max 3)
- longshot: leg 60% → 2-leg ~36%, 3-leg ~21% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 2.3pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
