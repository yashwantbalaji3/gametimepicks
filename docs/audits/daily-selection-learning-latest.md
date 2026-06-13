# Daily selection learning — through 2026-06-12

Training window: **2026-06-05 → 2026-06-12** (8d). Universe legs:
**4124** (baseline 50.2%). Published legs:
**636**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 54% (854/1570, WLB 52%) shrunk 54%
- **batter_hits_runs_rbis** → `high_risk_only` — 49% (766/1568, WLB 46%) shrunk 49%
- **batter_total_bases** → `disabled` — 45% (356/792, WLB 42%) shrunk 45%
- **pitcher_strikeouts** → `disabled` — 48% (93/194, WLB 41%) shrunk 48%

## Calibration
- Edge inverted at high values: **true** 0-5:50% (622/1236, WLB 48%) · 15-20:45% (132/293, WLB 39%) · neg:52% (435/835, WLB 49%) · 5-10:52% (537/1030, WLB 49%) · 10-15:47% (280/593, WLB 43%) · 20+:46% (63/137, WLB 38%)
- Confidence predictive: **false** (spread 1.6pts) Medium:50% (288/581, WLB 46%) · Low:51% (833/1629, WLB 49%) · High:50% (948/1914, WLB 47%)

## Published leg hit rate by lane
- low: 63% (53/84, WLB 52%)
- medium: 55% (81/146, WLB 47%)
- high: 58% (104/180, WLB 50%)
- longshot: 54% (122/226, WLB 47%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 63% → 2-leg ~40%, 3-leg ~25% (rec max 2)
- medium: leg 55% → 2-leg ~31%, 3-leg ~17% (rec max 3)
- high: leg 58% → 2-leg ~33%, 3-leg ~19% (rec max 3)
- longshot: leg 54% → 2-leg ~29%, 3-leg ~16% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 1.6pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
