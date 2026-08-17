# Daily selection learning — through 2026-08-16

Training window: **2026-08-09 → 2026-08-16** (8d). Universe legs:
**4401** (baseline 45.4%). Published legs:
**664**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 53% (842/1599, WLB 50%) shrunk 53%
- **batter_hits_runs_rbis** → `restricted` — 50% (792/1599, WLB 47%) shrunk 49%
- **batter_total_bases** → `disabled` — 38% (270/707, WLB 35%) shrunk 38%
- **pitcher_strikeouts** → `disabled` — 49% (96/195, WLB 42%) shrunk 49%

## Calibration
- Edge inverted at high values: **true** 5-10:49% (473/968, WLB 46%) · 0-5:50% (625/1253, WLB 47%) · neg:49% (460/931, WLB 46%) · 10-15:45% (255/564, WLB 41%) · 15-20:48% (120/251, WLB 42%) · 20+:50% (67/133, WLB 42%)
- Confidence predictive: **false** (spread 2.7pts) High:48% (847/1780, WLB 45%) · Low:50% (854/1697, WLB 48%) · Medium:48% (299/623, WLB 44%)

## Published leg hit rate by lane
- low: 58% (54/93, WLB 48%)
- medium: 55% (78/143, WLB 46%)
- high: 59% (111/188, WLB 52%)
- longshot: 59% (141/240, WLB 52%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 58% → 2-leg ~34%, 3-leg ~20% (rec max 2)
- medium: leg 55% → 2-leg ~30%, 3-leg ~16% (rec max 3)
- high: leg 59% → 2-leg ~35%, 3-leg ~21% (rec max 3)
- longshot: leg 59% → 2-leg ~35%, 3-leg ~20% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 2.7pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
