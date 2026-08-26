# Daily selection learning — through 2026-08-25

Training window: **2026-08-18 → 2026-08-25** (8d). Universe legs:
**4303** (baseline 47.5%). Published legs:
**669**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits_runs_rbis** → `restricted` — 50% (808/1612, WLB 48%) shrunk 50%
- **batter_hits** → `allowed` — 55% (886/1610, WLB 53%) shrunk 55%
- **batter_total_bases** → `disabled` — 41% (256/631, WLB 37%) shrunk 41%
- **pitcher_strikeouts** → `restricted` — 52% (96/186, WLB 44%) shrunk 51%

## Calibration
- Edge inverted at high values: **true** 10-15:48% (294/608, WLB 44%) · 0-5:51% (614/1201, WLB 48%) · 15-20:47% (119/255, WLB 41%) · neg:52% (454/872, WLB 49%) · 5-10:52% (507/980, WLB 49%) · 20+:47% (58/123, WLB 39%)
- Confidence predictive: **false** (spread 1.6pts) High:50% (918/1841, WLB 48%) · Medium:51% (296/580, WLB 47%) · Low:51% (832/1618, WLB 49%)

## Published leg hit rate by lane
- low: 60% (55/91, WLB 50%)
- medium: 62% (94/152, WLB 54%)
- high: 58% (111/192, WLB 51%)
- longshot: 59% (138/234, WLB 53%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 60% → 2-leg ~37%, 3-leg ~22% (rec max 2)
- medium: leg 62% → 2-leg ~38%, 3-leg ~24% (rec max 3)
- high: leg 58% → 2-leg ~33%, 3-leg ~19% (rec max 3)
- longshot: leg 59% → 2-leg ~35%, 3-leg ~21% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 1.6pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
