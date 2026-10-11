# Daily selection learning — through 2026-10-10

Training window: **2026-10-03 → 2026-10-10** (8d). Universe legs:
**575** (baseline 43.8%). Published legs:
**232**, cards: **69**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 51% (127/249, WLB 45%) shrunk 50%
- **batter_hits_runs_rbis** → `disabled` — 41% (99/241, WLB 35%) shrunk 41%
- **batter_total_bases** → `disabled` — 21% (9/42, WLB 12%) shrunk 29%
- **pitcher_strikeouts** → `disabled` — 61% (17/28, WLB 42%) shrunk 54%

## Calibration
- Edge inverted at high values: **true** 15-20:41% (29/70, WLB 31%) · 0-5:48% (60/125, WLB 39%) · neg:60% (27/45, WLB 45%) · 10-15:40% (55/136, WLB 33%) · 5-10:46% (60/131, WLB 38%) · 20+:40% (21/53, WLB 28%)
- Confidence predictive: **true** (spread 7.5pts) High:43% (144/336, WLB 38%) · Medium:44% (32/73, WLB 33%) · Low:50% (76/151, WLB 42%)

## Published leg hit rate by lane
- low: 36% (14/39, WLB 23%)
- medium: 58% (35/60, WLB 46%)
- high: 52% (38/73, WLB 41%)
- longshot: 55% (33/60, WLB 42%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 36% → 2-leg ~13%, 3-leg ~5% (rec max 2)
- medium: leg 58% → 2-leg ~34%, 3-leg ~20% (rec max 3)
- high: leg 52% → 2-leg ~27%, 3-leg ~14% (rec max 3)
- longshot: leg 55% → 2-leg ~30%, 3-leg ~17% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote

_Recommendation artifact only — no production logic changed by this script._
