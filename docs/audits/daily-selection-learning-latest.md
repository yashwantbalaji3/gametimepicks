# Daily selection learning — through 2026-09-07

Training window: **2026-08-31 → 2026-09-07** (8d). Universe legs:
**3923** (baseline 49.0%). Published legs:
**666**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits_runs_rbis** → `allowed` — 52% (748/1432, WLB 50%) shrunk 52%
- **batter_hits** → `allowed` — 56% (796/1431, WLB 53%) shrunk 56%
- **batter_total_bases** → `high_risk_only` — 48% (288/603, WLB 44%) shrunk 48%
- **pitcher_strikeouts** → `restricted` — 50% (91/181, WLB 43%) shrunk 50%

## Calibration
- Edge inverted at high values: **true** 5-10:56% (471/846, WLB 52%) · 0-5:53% (568/1062, WLB 50%) · neg:49% (413/835, WLB 46%) · 15-20:52% (125/242, WLB 45%) · 10-15:52% (281/537, WLB 48%) · 20+:52% (65/125, WLB 43%)
- Confidence predictive: **false** (spread 4.6pts) High:54% (875/1622, WLB 52%) · Low:53% (794/1510, WLB 50%) · Medium:49% (254/515, WLB 45%)

## Published leg hit rate by lane
- low: 67% (62/92, WLB 57%)
- medium: 60% (87/146, WLB 51%)
- high: 59% (113/190, WLB 52%)
- longshot: 60% (142/238, WLB 53%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 67% → 2-leg ~45%, 3-leg ~31% (rec max 2)
- medium: leg 60% → 2-leg ~36%, 3-leg ~21% (rec max 3)
- high: leg 59% → 2-leg ~35%, 3-leg ~21% (rec max 3)
- longshot: leg 60% → 2-leg ~36%, 3-leg ~21% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 4.6pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
