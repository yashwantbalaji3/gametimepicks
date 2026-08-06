# Daily selection learning — through 2026-08-05

Training window: **2026-07-29 → 2026-08-05** (8d). Universe legs:
**2094** (baseline 44.0%). Published legs:
**422**, cards: **120**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 52% (429/830, WLB 48%) shrunk 52%
- **batter_hits_runs_rbis** → `disabled` — 44% (285/642, WLB 41%) shrunk 44%
- **batter_total_bases** → `disabled` — 40% (164/410, WLB 35%) shrunk 40%
- **pitcher_strikeouts** → `disabled` — 43% (43/101, WLB 33%) shrunk 43%

## Calibration
- Edge inverted at high values: **true** 15-20:41% (47/115, WLB 32%) · neg:47% (219/467, WLB 42%) · 0-5:47% (311/666, WLB 43%) · 5-10:49% (218/443, WLB 45%) · 10-15:44% (108/247, WLB 38%) · 20+:40% (18/45, WLB 27%)
- Confidence predictive: **false** (spread 3.8pts) High:46% (372/805, WLB 43%) · Low:48% (420/883, WLB 44%) · Medium:44% (129/295, WLB 38%)

## Published leg hit rate by lane
- low: 58% (35/60, WLB 46%)
- medium: 64% (63/98, WLB 54%)
- high: 52% (61/118, WLB 43%)
- longshot: 62% (90/146, WLB 54%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 58% → 2-leg ~34%, 3-leg ~20% (rec max 2)
- medium: leg 64% → 2-leg ~41%, 3-leg ~27% (rec max 3)
- high: leg 52% → 2-leg ~27%, 3-leg ~14% (rec max 3)
- longshot: leg 62% → 2-leg ~38%, 3-leg ~23% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 3.8pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
