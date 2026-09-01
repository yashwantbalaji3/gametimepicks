# Daily selection learning — through 2026-08-31

Training window: **2026-08-24 → 2026-08-31** (8d). Universe legs:
**3477** (baseline 47.1%). Published legs:
**655**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 54% (687/1281, WLB 51%) shrunk 54%
- **batter_hits_runs_rbis** → `restricted` — 50% (638/1281, WLB 47%) shrunk 50%
- **batter_total_bases** → `disabled` — 43% (235/550, WLB 39%) shrunk 43%
- **pitcher_strikeouts** → `disabled` — 50% (76/153, WLB 42%) shrunk 49%

## Calibration
- Edge inverted at high values: **true** 5-10:53% (423/793, WLB 50%) · 15-20:39% (75/191, WLB 33%) · neg:47% (349/736, WLB 44%) · 10-15:47% (230/489, WLB 43%) · 0-5:54% (522/972, WLB 51%) · 20+:44% (37/84, WLB 34%)
- Confidence predictive: **true** (spread 5.1pts) High:49% (727/1472, WLB 47%) · Low:49% (653/1323, WLB 47%) · Medium:54% (256/470, WLB 50%)

## Published leg hit rate by lane
- low: 67% (63/94, WLB 57%)
- medium: 55% (79/143, WLB 47%)
- high: 59% (106/181, WLB 51%)
- longshot: 63% (150/237, WLB 57%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 67% → 2-leg ~45%, 3-leg ~30% (rec max 2)
- medium: leg 55% → 2-leg ~31%, 3-leg ~17% (rec max 3)
- high: leg 59% → 2-leg ~34%, 3-leg ~20% (rec max 3)
- longshot: leg 63% → 2-leg ~40%, 3-leg ~25% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote

_Recommendation artifact only — no production logic changed by this script._
