# Daily selection learning — through 2026-07-22

Training window: **2026-07-15 → 2026-07-22** (8d). Universe legs:
**690** (baseline 40.6%). Published legs:
**80**, cards: **24**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 52% (116/222, WLB 46%) shrunk 51%
- **batter_hits_runs_rbis** → `disabled` — 46% (102/222, WLB 40%) shrunk 46%
- **batter_total_bases** → `disabled` — 38% (44/117, WLB 29%) shrunk 38%
- **pitcher_strikeouts** → `disabled` — 53% (18/34, WLB 37%) shrunk 48%

## Calibration
- Edge inverted at high values: **true** 20+:28% (5/18, WLB 13%) · 10-15:44% (36/82, WLB 34%) · neg:46% (60/130, WLB 38%) · 0-5:52% (93/180, WLB 44%) · 5-10:47% (73/154, WLB 40%) · 15-20:42% (13/31, WLB 26%)
- Confidence predictive: **true** (spread 6.3pts) Low:50% (121/243, WLB 44%) · High:46% (122/267, WLB 40%) · Medium:44% (37/85, WLB 34%)

## Published leg hit rate by lane
- low: 55% (6/11, WLB 28%)
- medium: 75% (12/16, WLB 51%)
- high: 58% (14/24, WLB 39%)
- longshot: 62% (18/29, WLB 44%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 55% → 2-leg ~30%, 3-leg ~16% (rec max 2)
- medium: leg 75% → 2-leg ~56%, 3-leg ~42% (rec max 3)
- high: leg 58% → 2-leg ~34%, 3-leg ~20% (rec max 3)
- longshot: leg 62% → 2-leg ~39%, 3-leg ~24% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote

_Recommendation artifact only — no production logic changed by this script._
