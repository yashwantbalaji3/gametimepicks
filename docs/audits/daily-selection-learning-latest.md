# Daily selection learning — through 2026-09-14

Training window: **2026-09-07 → 2026-09-14** (8d). Universe legs:
**3737** (baseline 47.4%). Published legs:
**665**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 55% (767/1388, WLB 53%) shrunk 55%
- **batter_hits_runs_rbis** → `restricted` — 50% (690/1386, WLB 47%) shrunk 50%
- **batter_total_bases** → `disabled` — 46% (242/531, WLB 41%) shrunk 46%
- **pitcher_strikeouts** → `disabled` — 44% (74/169, WLB 37%) shrunk 44%

## Calibration
- Edge inverted at high values: **true** 15-20:51% (133/261, WLB 45%) · neg:50% (348/702, WLB 46%) · 0-5:52% (549/1053, WLB 49%) · 5-10:50% (414/835, WLB 46%) · 10-15:52% (254/486, WLB 48%) · 20+:55% (75/137, WLB 46%)
- Confidence predictive: **false** (spread 2.6pts) High:51% (801/1581, WLB 48%) · Low:51% (691/1365, WLB 48%) · Medium:53% (281/528, WLB 49%)

## Published leg hit rate by lane
- low: 70% (64/92, WLB 60%)
- medium: 56% (80/143, WLB 48%)
- high: 56% (108/192, WLB 49%)
- longshot: 59% (141/238, WLB 53%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 70% → 2-leg ~48%, 3-leg ~34% (rec max 2)
- medium: leg 56% → 2-leg ~31%, 3-leg ~18% (rec max 3)
- high: leg 56% → 2-leg ~32%, 3-leg ~18% (rec max 3)
- longshot: leg 59% → 2-leg ~35%, 3-leg ~21% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 2.6pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
