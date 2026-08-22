# Daily selection learning — through 2026-08-21

Training window: **2026-08-14 → 2026-08-21** (8d). Universe legs:
**4297** (baseline 47.1%). Published legs:
**685**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 55% (874/1592, WLB 52%) shrunk 55%
- **batter_hits_runs_rbis** → `restricted` — 51% (808/1592, WLB 48%) shrunk 51%
- **batter_total_bases** → `disabled` — 38% (249/649, WLB 35%) shrunk 39%
- **pitcher_strikeouts** → `restricted` — 51% (95/186, WLB 44%) shrunk 51%

## Calibration
- Edge inverted at high values: **true** 0-5:51% (599/1173, WLB 48%) · 5-10:51% (501/975, WLB 48%) · 10-15:48% (288/606, WLB 44%) · neg:51% (452/882, WLB 48%) · 15-20:48% (125/263, WLB 42%) · 20+:51% (61/120, WLB 42%)
- Confidence predictive: **false** (spread 1.9pts) Low:52% (815/1582, WLB 49%) · Medium:50% (297/595, WLB 46%) · High:50% (914/1842, WLB 47%)

## Published leg hit rate by lane
- low: 53% (47/89, WLB 43%)
- medium: 59% (91/155, WLB 51%)
- high: 55% (109/198, WLB 48%)
- longshot: 56% (135/243, WLB 49%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 53% → 2-leg ~28%, 3-leg ~15% (rec max 2)
- medium: leg 59% → 2-leg ~35%, 3-leg ~20% (rec max 3)
- high: leg 55% → 2-leg ~30%, 3-leg ~17% (rec max 3)
- longshot: leg 56% → 2-leg ~31%, 3-leg ~17% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 1.9pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
