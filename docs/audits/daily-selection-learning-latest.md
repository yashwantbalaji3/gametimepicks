# Daily selection learning — through 2026-06-18

Training window: **2026-06-11 → 2026-06-18** (8d). Universe legs:
**3995** (baseline 47.6%). Published legs:
**619**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits_runs_rbis** → `restricted` — 49% (706/1448, WLB 46%) shrunk 49%
- **batter_hits** → `allowed` — 53% (761/1447, WLB 50%) shrunk 53%
- **batter_total_bases** → `disabled` — 46% (348/756, WLB 43%) shrunk 46%
- **pitcher_strikeouts** → `disabled` — 46% (85/184, WLB 39%) shrunk 46%

## Calibration
- Edge inverted at high values: **true** 10-15:48% (250/524, WLB 43%) · 20+:42% (56/132, WLB 34%) · 5-10:47% (418/889, WLB 44%) · neg:54% (446/833, WLB 50%) · 0-5:50% (585/1181, WLB 47%) · 15-20:53% (145/276, WLB 47%)
- Confidence predictive: **true** (spread 5.8pts) High:48% (811/1686, WLB 46%) · Low:52% (845/1622, WLB 50%) · Medium:46% (244/527, WLB 42%)

## Published leg hit rate by lane
- low: 71% (57/80, WLB 61%)
- medium: 59% (78/133, WLB 50%)
- high: 64% (116/181, WLB 57%)
- longshot: 63% (141/225, WLB 56%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 71% → 2-leg ~51%, 3-leg ~36% (rec max 2)
- medium: leg 59% → 2-leg ~34%, 3-leg ~20% (rec max 3)
- high: leg 64% → 2-leg ~41%, 3-leg ~26% (rec max 3)
- longshot: leg 63% → 2-leg ~39%, 3-leg ~25% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote

_Recommendation artifact only — no production logic changed by this script._
