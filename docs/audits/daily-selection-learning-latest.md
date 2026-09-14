# Daily selection learning — through 2026-09-13

Training window: **2026-09-06 → 2026-09-13** (8d). Universe legs:
**3880** (baseline 46.8%). Published legs:
**656**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 55% (783/1434, WLB 52%) shrunk 54%
- **batter_hits_runs_rbis** → `restricted` — 49% (702/1434, WLB 46%) shrunk 49%
- **batter_total_bases** → `disabled` — 46% (248/541, WLB 42%) shrunk 46%
- **pitcher_strikeouts** → `disabled` — 46% (82/178, WLB 39%) shrunk 46%

## Calibration
- Edge inverted at high values: **true** 0-5:52% (563/1091, WLB 49%) · 5-10:50% (428/863, WLB 46%) · neg:49% (361/733, WLB 46%) · 10-15:52% (257/494, WLB 48%) · 15-20:50% (134/270, WLB 44%) · 20+:53% (72/136, WLB 45%)
- Confidence predictive: **false** (spread 1.8pts) Low:50% (716/1423, WLB 48%) · High:50% (818/1625, WLB 48%) · Medium:52% (281/539, WLB 48%)

## Published leg hit rate by lane
- low: 67% (61/91, WLB 57%)
- medium: 55% (78/142, WLB 47%)
- high: 55% (104/189, WLB 48%)
- longshot: 56% (132/234, WLB 50%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 67% → 2-leg ~45%, 3-leg ~30% (rec max 2)
- medium: leg 55% → 2-leg ~30%, 3-leg ~17% (rec max 3)
- high: leg 55% → 2-leg ~30%, 3-leg ~17% (rec max 3)
- longshot: leg 56% → 2-leg ~32%, 3-leg ~18% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 1.8pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
