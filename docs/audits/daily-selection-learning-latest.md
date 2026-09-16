# Daily selection learning — through 2026-09-15

Training window: **2026-09-08 → 2026-09-15** (8d). Universe legs:
**4159** (baseline 47.0%). Published legs:
**672**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 55% (848/1533, WLB 53%) shrunk 55%
- **batter_hits_runs_rbis** → `restricted` — 49% (757/1531, WLB 47%) shrunk 49%
- **batter_total_bases** → `disabled` — 45% (268/598, WLB 41%) shrunk 45%
- **pitcher_strikeouts** → `disabled` — 44% (82/188, WLB 37%) shrunk 44%

## Calibration
- Edge inverted at high values: **true** 15-20:49% (141/288, WLB 43%) · 0-5:52% (604/1167, WLB 49%) · neg:50% (388/776, WLB 46%) · 5-10:49% (462/935, WLB 46%) · 10-15:52% (283/547, WLB 48%) · 20+:56% (77/137, WLB 48%)
- Confidence predictive: **false** (spread 2.1pts) High:50% (886/1769, WLB 48%) · Medium:52% (296/567, WLB 48%) · Low:51% (773/1514, WLB 49%)

## Published leg hit rate by lane
- low: 74% (69/93, WLB 64%)
- medium: 54% (80/147, WLB 46%)
- high: 58% (113/194, WLB 51%)
- longshot: 60% (142/238, WLB 53%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 74% → 2-leg ~55%, 3-leg ~41% (rec max 2)
- medium: leg 54% → 2-leg ~30%, 3-leg ~16% (rec max 3)
- high: leg 58% → 2-leg ~34%, 3-leg ~20% (rec max 3)
- longshot: leg 60% → 2-leg ~36%, 3-leg ~21% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 2.1pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
