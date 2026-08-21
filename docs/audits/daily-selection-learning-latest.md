# Daily selection learning — through 2026-08-20

Training window: **2026-08-13 → 2026-08-20** (8d). Universe legs:
**4067** (baseline 45.8%). Published legs:
**673**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 54% (804/1494, WLB 51%) shrunk 54%
- **batter_hits_runs_rbis** → `restricted` — 49% (737/1494, WLB 47%) shrunk 49%
- **batter_total_bases** → `disabled` — 37% (228/620, WLB 33%) shrunk 37%
- **pitcher_strikeouts** → `restricted` — 53% (93/177, WLB 45%) shrunk 52%

## Calibration
- Edge inverted at high values: **true** 15-20:44% (102/232, WLB 38%) · neg:50% (418/829, WLB 47%) · 5-10:51% (464/918, WLB 47%) · 0-5:50% (565/1129, WLB 47%) · 10-15:46% (259/566, WLB 42%) · 20+:49% (54/111, WLB 40%)
- Confidence predictive: **false** (spread 2.9pts) High:48% (825/1714, WLB 46%) · Low:51% (762/1498, WLB 48%) · Medium:48% (275/573, WLB 44%)

## Published leg hit rate by lane
- low: 54% (48/89, WLB 44%)
- medium: 58% (86/149, WLB 50%)
- high: 55% (106/192, WLB 48%)
- longshot: 55% (133/243, WLB 48%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 54% → 2-leg ~29%, 3-leg ~16% (rec max 2)
- medium: leg 58% → 2-leg ~33%, 3-leg ~19% (rec max 3)
- high: leg 55% → 2-leg ~31%, 3-leg ~17% (rec max 3)
- longshot: leg 55% → 2-leg ~30%, 3-leg ~16% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 2.9pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
