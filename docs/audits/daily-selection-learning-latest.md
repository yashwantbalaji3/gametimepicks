# Daily selection learning — through 2026-08-30

Training window: **2026-08-23 → 2026-08-30** (8d). Universe legs:
**3561** (baseline 46.5%). Published legs:
**651**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits_runs_rbis** → `restricted` — 50% (650/1312, WLB 47%) shrunk 50%
- **batter_hits** → `allowed` — 53% (693/1310, WLB 50%) shrunk 53%
- **batter_total_bases** → `disabled` — 42% (234/551, WLB 38%) shrunk 43%
- **pitcher_strikeouts** → `restricted` — 52% (79/153, WLB 44%) shrunk 51%

## Calibration
- Edge inverted at high values: **true** 10-15:46% (228/494, WLB 42%) · 0-5:53% (530/992, WLB 50%) · neg:49% (357/733, WLB 45%) · 5-10:52% (413/802, WLB 48%) · 20+:45% (42/93, WLB 35%) · 15-20:41% (86/212, WLB 34%)
- Confidence predictive: **true** (spread 6.5pts) High:48% (725/1506, WLB 46%) · Low:50% (666/1335, WLB 47%) · Medium:55% (265/485, WLB 50%)

## Published leg hit rate by lane
- low: 67% (62/93, WLB 57%)
- medium: 55% (78/142, WLB 47%)
- high: 56% (102/181, WLB 49%)
- longshot: 63% (149/235, WLB 57%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 67% → 2-leg ~44%, 3-leg ~30% (rec max 2)
- medium: leg 55% → 2-leg ~30%, 3-leg ~17% (rec max 3)
- high: leg 56% → 2-leg ~32%, 3-leg ~18% (rec max 3)
- longshot: leg 63% → 2-leg ~40%, 3-leg ~26% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote

_Recommendation artifact only — no production logic changed by this script._
