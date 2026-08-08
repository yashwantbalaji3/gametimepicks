# Daily selection learning — through 2026-08-07

Training window: **2026-07-31 → 2026-08-07** (8d). Universe legs:
**2759** (baseline 45.5%). Published legs:
**505**, cards: **144**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 52% (554/1069, WLB 49%) shrunk 52%
- **batter_hits_runs_rbis** → `restricted` — 48% (425/881, WLB 45%) shrunk 48%
- **batter_total_bases** → `disabled` — 42% (218/517, WLB 38%) shrunk 42%
- **pitcher_strikeouts** → `disabled` — 44% (57/130, WLB 36%) shrunk 44%

## Calibration
- Edge inverted at high values: **true** 15-20:48% (74/154, WLB 40%) · 10-15:47% (141/301, WLB 41%) · 0-5:47% (397/840, WLB 44%) · 5-10:48% (284/586, WLB 44%) · neg:50% (327/659, WLB 46%) · 20+:54% (31/57, WLB 42%)
- Confidence predictive: **false** (spread 3.8pts) High:48% (499/1042, WLB 45%) · Low:49% (581/1174, WLB 47%) · Medium:46% (174/381, WLB 41%)

## Published leg hit rate by lane
- low: 61% (43/71, WLB 49%)
- medium: 65% (77/119, WLB 56%)
- high: 56% (78/140, WLB 47%)
- longshot: 63% (111/175, WLB 56%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 61% → 2-leg ~37%, 3-leg ~22% (rec max 2)
- medium: leg 65% → 2-leg ~42%, 3-leg ~27% (rec max 3)
- high: leg 56% → 2-leg ~31%, 3-leg ~17% (rec max 3)
- longshot: leg 63% → 2-leg ~40%, 3-leg ~26% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 3.8pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
