# Daily selection learning — through 2026-08-29

Training window: **2026-08-22 → 2026-08-29** (8d). Universe legs:
**3865** (baseline 46.7%). Published legs:
**660**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits_runs_rbis** → `restricted` — 50% (715/1441, WLB 47%) shrunk 50%
- **batter_hits** → `allowed` — 53% (765/1439, WLB 51%) shrunk 53%
- **batter_total_bases** → `disabled` — 42% (243/575, WLB 38%) shrunk 42%
- **pitcher_strikeouts** → `disabled` — 49% (82/167, WLB 42%) shrunk 49%

## Calibration
- Edge inverted at high values: **true** 0-5:52% (575/1096, WLB 50%) · neg:49% (382/773, WLB 46%) · 10-15:47% (255/545, WLB 43%) · 20+:47% (53/112, WLB 38%) · 5-10:52% (446/866, WLB 48%) · 15-20:41% (94/230, WLB 35%)
- Confidence predictive: **true** (spread 6.4pts) Medium:55% (296/540, WLB 51%) · Low:50% (716/1443, WLB 47%) · High:48% (793/1639, WLB 46%)

## Published leg hit rate by lane
- low: 65% (60/93, WLB 54%)
- medium: 56% (81/145, WLB 48%)
- high: 59% (109/186, WLB 51%)
- longshot: 62% (147/236, WLB 56%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 65% → 2-leg ~42%, 3-leg ~27% (rec max 2)
- medium: leg 56% → 2-leg ~31%, 3-leg ~17% (rec max 3)
- high: leg 59% → 2-leg ~34%, 3-leg ~20% (rec max 3)
- longshot: leg 62% → 2-leg ~39%, 3-leg ~24% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote

_Recommendation artifact only — no production logic changed by this script._
