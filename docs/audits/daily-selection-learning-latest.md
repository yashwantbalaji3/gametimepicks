# Daily selection learning — through 2026-09-22

Training window: **2026-09-15 → 2026-09-22** (8d). Universe legs:
**4094** (baseline 45.9%). Published legs:
**647**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 56% (817/1450, WLB 54%) shrunk 56%
- **batter_hits_runs_rbis** → `restricted` — 50% (715/1442, WLB 47%) shrunk 50%
- **batter_total_bases** → `disabled` — 41% (250/603, WLB 38%) shrunk 42%
- **pitcher_strikeouts** → `restricted` — 52% (98/187, WLB 45%) shrunk 52%

## Calibration
- Edge inverted at high values: **true** 0-5:54% (562/1049, WLB 51%) · neg:51% (389/765, WLB 47%) · 10-15:50% (304/604, WLB 46%) · 5-10:52% (450/871, WLB 48%) · 15-20:43% (115/266, WLB 37%) · 20+:47% (60/127, WLB 39%)
- Confidence predictive: **false** (spread 2.6pts) Low:52% (770/1481, WLB 49%) · Medium:52% (242/461, WLB 48%) · High:50% (868/1740, WLB 48%)

## Published leg hit rate by lane
- low: 65% (59/91, WLB 55%)
- medium: 54% (79/145, WLB 46%)
- high: 58% (104/180, WLB 50%)
- longshot: 58% (134/231, WLB 52%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 65% → 2-leg ~42%, 3-leg ~27% (rec max 2)
- medium: leg 54% → 2-leg ~30%, 3-leg ~16% (rec max 3)
- high: leg 58% → 2-leg ~33%, 3-leg ~19% (rec max 3)
- longshot: leg 58% → 2-leg ~34%, 3-leg ~20% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 2.6pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
