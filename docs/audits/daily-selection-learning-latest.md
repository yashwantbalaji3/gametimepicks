# Daily selection learning — through 2026-09-12

Training window: **2026-09-05 → 2026-09-12** (8d). Universe legs:
**3897** (baseline 47.0%). Published legs:
**663**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 55% (788/1440, WLB 52%) shrunk 55%
- **batter_hits_runs_rbis** → `restricted` — 50% (715/1440, WLB 47%) shrunk 50%
- **batter_total_bases** → `disabled` — 45% (248/551, WLB 41%) shrunk 45%
- **pitcher_strikeouts** → `disabled` — 45% (79/176, WLB 38%) shrunk 45%

## Calibration
- Edge inverted at high values: **true** 15-20:50% (127/253, WLB 44%) · 20+:55% (74/134, WLB 47%) · 0-5:51% (547/1077, WLB 48%) · neg:49% (384/776, WLB 46%) · 5-10:49% (426/865, WLB 46%) · 10-15:54% (272/502, WLB 50%)
- Confidence predictive: **false** (spread 0.4pts) High:51% (824/1617, WLB 49%) · Low:51% (727/1439, WLB 48%) · Medium:51% (279/551, WLB 46%)

## Published leg hit rate by lane
- low: 69% (63/91, WLB 59%)
- medium: 55% (80/146, WLB 47%)
- high: 56% (107/191, WLB 49%)
- longshot: 57% (134/235, WLB 51%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 69% → 2-leg ~48%, 3-leg ~33% (rec max 2)
- medium: leg 55% → 2-leg ~30%, 3-leg ~16% (rec max 3)
- high: leg 56% → 2-leg ~31%, 3-leg ~18% (rec max 3)
- longshot: leg 57% → 2-leg ~33%, 3-leg ~19% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 0.4pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
