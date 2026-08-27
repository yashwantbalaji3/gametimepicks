# Daily selection learning — through 2026-08-26

Training window: **2026-08-19 → 2026-08-26** (8d). Universe legs:
**4315** (baseline 46.9%). Published legs:
**668**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits_runs_rbis** → `restricted` — 50% (811/1612, WLB 48%) shrunk 50%
- **batter_hits** → `allowed` — 53% (861/1610, WLB 51%) shrunk 53%
- **batter_total_bases** → `disabled` — 41% (254/625, WLB 37%) shrunk 41%
- **pitcher_strikeouts** → `restricted` — 52% (97/186, WLB 45%) shrunk 52%

## Calibration
- Edge inverted at high values: **true** neg:51% (443/873, WLB 47%) · 0-5:51% (602/1181, WLB 48%) · 5-10:52% (504/978, WLB 48%) · 10-15:48% (302/626, WLB 44%) · 15-20:44% (110/248, WLB 38%) · 20+:49% (62/127, WLB 40%)
- Confidence predictive: **false** (spread 2.5pts) Low:50% (815/1617, WLB 48%) · Medium:52% (294/566, WLB 48%) · High:49% (914/1850, WLB 47%)

## Published leg hit rate by lane
- low: 62% (56/91, WLB 51%)
- medium: 61% (92/152, WLB 53%)
- high: 58% (110/191, WLB 51%)
- longshot: 59% (138/234, WLB 53%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 62% → 2-leg ~38%, 3-leg ~23% (rec max 2)
- medium: leg 61% → 2-leg ~37%, 3-leg ~22% (rec max 3)
- high: leg 58% → 2-leg ~33%, 3-leg ~19% (rec max 3)
- longshot: leg 59% → 2-leg ~35%, 3-leg ~21% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 2.5pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
