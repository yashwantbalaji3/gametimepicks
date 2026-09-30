# Daily selection learning — through 2026-09-29

Training window: **2026-09-22 → 2026-09-29** (8d). Universe legs:
**3313** (baseline 45.8%). Published legs:
**569**, cards: **168**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 56% (670/1205, WLB 53%) shrunk 55%
- **batter_hits_runs_rbis** → `restricted` — 50% (600/1191, WLB 48%) shrunk 50%
- **batter_total_bases** → `disabled` — 47% (186/396, WLB 42%) shrunk 47%
- **pitcher_strikeouts** → `disabled` — 40% (60/150, WLB 33%) shrunk 41%

## Calibration
- Edge inverted at high values: **true** 5-10:53% (402/756, WLB 50%) · 0-5:53% (413/773, WLB 50%) · 10-15:49% (249/511, WLB 44%) · neg:51% (278/549, WLB 46%) · 15-20:50% (115/229, WLB 44%) · 20+:48% (59/124, WLB 39%)
- Confidence predictive: **false** (spread 2.7pts) High:51% (766/1496, WLB 49%) · Low:51% (539/1054, WLB 48%) · Medium:54% (211/392, WLB 49%)

## Published leg hit rate by lane
- low: 50% (37/74, WLB 39%)
- medium: 57% (73/129, WLB 48%)
- high: 59% (96/164, WLB 51%)
- longshot: 53% (107/202, WLB 46%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 50% → 2-leg ~25%, 3-leg ~13% (rec max 2)
- medium: leg 57% → 2-leg ~32%, 3-leg ~18% (rec max 3)
- high: leg 59% → 2-leg ~34%, 3-leg ~20% (rec max 3)
- longshot: leg 53% → 2-leg ~28%, 3-leg ~15% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 2.7pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
