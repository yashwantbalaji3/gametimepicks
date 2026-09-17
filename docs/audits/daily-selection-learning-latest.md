# Daily selection learning — through 2026-09-16

Training window: **2026-09-09 → 2026-09-16** (8d). Universe legs:
**4178** (baseline 47.7%). Published legs:
**668**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 56% (862/1536, WLB 54%) shrunk 56%
- **batter_hits_runs_rbis** → `restricted` — 50% (774/1533, WLB 48%) shrunk 50%
- **batter_total_bases** → `disabled` — 44% (266/598, WLB 41%) shrunk 45%
- **pitcher_strikeouts** → `disabled` — 47% (90/191, WLB 40%) shrunk 47%

## Calibration
- Edge inverted at high values: **true** 0-5:52% (603/1167, WLB 49%) · 5-10:51% (483/939, WLB 48%) · neg:51% (397/778, WLB 48%) · 15-20:51% (144/282, WLB 45%) · 10-15:52% (289/560, WLB 47%) · 20+:58% (76/132, WLB 49%)
- Confidence predictive: **false** (spread 0.3pts) Medium:52% (292/564, WLB 48%) · Low:52% (784/1514, WLB 49%) · High:51% (916/1780, WLB 49%)

## Published leg hit rate by lane
- low: 71% (66/93, WLB 61%)
- medium: 57% (84/147, WLB 49%)
- high: 57% (108/191, WLB 49%)
- longshot: 60% (142/237, WLB 54%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 71% → 2-leg ~50%, 3-leg ~36% (rec max 2)
- medium: leg 57% → 2-leg ~33%, 3-leg ~19% (rec max 3)
- high: leg 57% → 2-leg ~32%, 3-leg ~18% (rec max 3)
- longshot: leg 60% → 2-leg ~36%, 3-leg ~22% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 0.3pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
