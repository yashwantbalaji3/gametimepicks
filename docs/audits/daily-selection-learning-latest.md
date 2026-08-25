# Daily selection learning — through 2026-08-24

Training window: **2026-08-17 → 2026-08-24** (8d). Universe legs:
**4116** (baseline 47.5%). Published legs:
**676**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits_runs_rbis** → `restricted` — 50% (776/1538, WLB 48%) shrunk 50%
- **batter_hits** → `allowed` — 55% (839/1536, WLB 52%) shrunk 55%
- **batter_total_bases** → `disabled` — 41% (255/616, WLB 38%) shrunk 42%
- **pitcher_strikeouts** → `disabled` — 49% (86/177, WLB 41%) shrunk 48%

## Calibration
- Edge inverted at high values: **true** neg:52% (435/839, WLB 48%) · 5-10:51% (477/928, WLB 48%) · 0-5:51% (592/1153, WLB 48%) · 10-15:49% (284/583, WLB 45%) · 15-20:46% (114/247, WLB 40%) · 20+:46% (54/117, WLB 37%)
- Confidence predictive: **false** (spread 1.6pts) Low:51% (792/1543, WLB 49%) · High:50% (873/1755, WLB 47%) · Medium:51% (291/569, WLB 47%)

## Published leg hit rate by lane
- low: 57% (51/90, WLB 46%)
- medium: 62% (95/153, WLB 54%)
- high: 58% (114/195, WLB 51%)
- longshot: 58% (139/238, WLB 52%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 57% → 2-leg ~32%, 3-leg ~18% (rec max 2)
- medium: leg 62% → 2-leg ~39%, 3-leg ~24% (rec max 3)
- high: leg 58% → 2-leg ~34%, 3-leg ~20% (rec max 3)
- longshot: leg 58% → 2-leg ~34%, 3-leg ~20% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 1.6pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
