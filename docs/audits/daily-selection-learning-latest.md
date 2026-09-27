# Daily selection learning — through 2026-09-26

Training window: **2026-09-19 → 2026-09-26** (8d). Universe legs:
**3942** (baseline 46.7%). Published legs:
**662**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 56% (806/1439, WLB 53%) shrunk 56%
- **batter_hits_runs_rbis** → `restricted` — 50% (722/1438, WLB 48%) shrunk 50%
- **batter_total_bases** → `disabled` — 43% (224/519, WLB 39%) shrunk 43%
- **pitcher_strikeouts** → `disabled` — 48% (87/180, WLB 41%) shrunk 48%

## Calibration
- Edge inverted at high values: **true** 20+:45% (65/146, WLB 37%) · 0-5:54% (522/958, WLB 51%) · neg:50% (359/720, WLB 46%) · 5-10:53% (466/880, WLB 50%) · 10-15:49% (296/600, WLB 45%) · 15-20:48% (131/272, WLB 42%)
- Confidence predictive: **false** (spread 4.8pts) Low:51% (687/1356, WLB 48%) · Medium:55% (260/469, WLB 51%) · High:51% (892/1751, WLB 49%)

## Published leg hit rate by lane
- low: 57% (50/87, WLB 47%)
- medium: 54% (81/150, WLB 46%)
- high: 57% (107/188, WLB 50%)
- longshot: 57% (136/237, WLB 51%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 57% → 2-leg ~33%, 3-leg ~19% (rec max 2)
- medium: leg 54% → 2-leg ~29%, 3-leg ~16% (rec max 3)
- high: leg 57% → 2-leg ~32%, 3-leg ~18% (rec max 3)
- longshot: leg 57% → 2-leg ~33%, 3-leg ~19% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 4.8pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
