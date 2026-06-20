# Daily selection learning — through 2026-06-19

Training window: **2026-06-12 → 2026-06-19** (8d). Universe legs:
**4260** (baseline 48.3%). Published legs:
**546**, cards: **168**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits_runs_rbis** → `restricted` — 51% (780/1543, WLB 48%) shrunk 51%
- **batter_hits** → `allowed` — 54% (830/1542, WLB 51%) shrunk 54%
- **batter_total_bases** → `disabled` — 46% (361/778, WLB 43%) shrunk 46%
- **pitcher_strikeouts** → `disabled` — 44% (85/193, WLB 37%) shrunk 44%

## Calibration
- Edge inverted at high values: **true** 15-20:52% (156/302, WLB 46%) · 10-15:48% (281/581, WLB 44%) · 5-10:49% (467/951, WLB 46%) · neg:55% (474/864, WLB 52%) · 0-5:51% (617/1214, WLB 48%) · 20+:42% (61/144, WLB 35%)
- Confidence predictive: **true** (spread 5.9pts) High:49% (902/1831, WLB 47%) · Low:53% (898/1685, WLB 51%) · Medium:47% (256/540, WLB 43%)

## Published leg hit rate by lane
- low: 69% (48/70, WLB 57%)
- medium: 58% (68/117, WLB 49%)
- high: 62% (98/159, WLB 54%)
- longshot: 63% (126/200, WLB 56%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 69% → 2-leg ~47%, 3-leg ~32% (rec max 2)
- medium: leg 58% → 2-leg ~34%, 3-leg ~20% (rec max 3)
- high: leg 62% → 2-leg ~38%, 3-leg ~23% (rec max 3)
- longshot: leg 63% → 2-leg ~40%, 3-leg ~25% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote

_Recommendation artifact only — no production logic changed by this script._
