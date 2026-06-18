# Daily selection learning — through 2026-06-17

Training window: **2026-06-10 → 2026-06-17** (8d). Universe legs:
**4224** (baseline 49.2%). Published legs:
**625**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits_runs_rbis** → `restricted` — 50% (774/1555, WLB 47%) shrunk 50%
- **batter_hits** → `allowed` — 53% (828/1554, WLB 51%) shrunk 53%
- **batter_total_bases** → `high_risk_only` — 47% (380/809, WLB 44%) shrunk 47%
- **pitcher_strikeouts** → `disabled` — 49% (96/194, WLB 43%) shrunk 49%

## Calibration
- Edge inverted at high values: **true** 15-20:56% (155/279, WLB 50%) · 5-10:49% (471/964, WLB 46%) · 0-5:50% (628/1265, WLB 47%) · neg:53% (471/890, WLB 50%) · 10-15:50% (287/570, WLB 46%) · 20+:46% (66/144, WLB 38%)
- Confidence predictive: **false** (spread 4.5pts) High:50% (911/1809, WLB 48%) · Medium:47% (266/563, WLB 43%) · Low:52% (901/1740, WLB 49%)

## Published leg hit rate by lane
- low: 73% (56/77, WLB 62%)
- medium: 60% (83/138, WLB 52%)
- high: 66% (120/182, WLB 59%)
- longshot: 64% (146/228, WLB 58%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 73% → 2-leg ~53%, 3-leg ~39% (rec max 2)
- medium: leg 60% → 2-leg ~36%, 3-leg ~22% (rec max 3)
- high: leg 66% → 2-leg ~44%, 3-leg ~29% (rec max 3)
- longshot: leg 64% → 2-leg ~41%, 3-leg ~26% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 4.5pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
