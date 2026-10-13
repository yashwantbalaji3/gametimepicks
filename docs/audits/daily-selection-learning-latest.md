# Daily selection learning — through 2026-10-11

Training window: **2026-10-04 → 2026-10-11** (8d). Universe legs:
**476** (baseline 45.8%). Published legs:
**148**, cards: **46**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 52% (106/202, WLB 46%) shrunk 52%
- **batter_hits_runs_rbis** → `disabled` — 45% (90/202, WLB 38%) shrunk 45%
- **batter_total_bases** → `disabled` — 23% (8/35, WLB 12%) shrunk 31%
- **pitcher_strikeouts** → `disabled` — 64% (14/22, WLB 43%) shrunk 55%

## Calibration
- Edge inverted at high values: **true** 5-10:52% (58/112, WLB 43%) · 0-5:51% (48/94, WLB 41%) · 10-15:44% (52/119, WLB 35%) · neg:53% (16/30, WLB 36%) · 15-20:41% (26/63, WLB 30%) · 20+:42% (18/43, WLB 28%)
- Confidence predictive: **false** (spread 3.7pts) High:46% (136/294, WLB 41%) · Low:50% (56/112, WLB 41%) · Medium:47% (26/55, WLB 35%)

## Published leg hit rate by lane
- low: 48% (13/27, WLB 31%)
- medium: 66% (27/41, WLB 51%)
- high: 53% (26/49, WLB 39%)
- longshot: 68% (21/31, WLB 50%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 48% → 2-leg ~23%, 3-leg ~11% (rec max 2)
- medium: leg 66% → 2-leg ~43%, 3-leg ~29% (rec max 3)
- high: leg 53% → 2-leg ~28%, 3-leg ~15% (rec max 3)
- longshot: leg 68% → 2-leg ~46%, 3-leg ~31% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 3.7pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
