# Daily selection learning — through 2026-08-23

Training window: **2026-08-16 → 2026-08-23** (8d). Universe legs:
**4312** (baseline 47.2%). Published legs:
**678**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits_runs_rbis** → `restricted` — 51% (816/1604, WLB 48%) shrunk 51%
- **batter_hits** → `allowed` — 54% (868/1602, WLB 52%) shrunk 54%
- **batter_total_bases** → `disabled` — 41% (264/645, WLB 37%) shrunk 41%
- **pitcher_strikeouts** → `disabled` — 48% (89/185, WLB 41%) shrunk 48%

## Calibration
- Edge inverted at high values: **true** 20+:51% (61/120, WLB 42%) · neg:51% (458/896, WLB 48%) · 15-20:47% (117/250, WLB 41%) · 10-15:47% (288/608, WLB 43%) · 5-10:52% (499/967, WLB 48%) · 0-5:51% (614/1195, WLB 49%)
- Confidence predictive: **false** (spread 1.8pts) Low:51% (828/1612, WLB 49%) · High:50% (903/1823, WLB 47%) · Medium:51% (306/601, WLB 47%)

## Published leg hit rate by lane
- low: 51% (45/89, WLB 40%)
- medium: 61% (92/152, WLB 53%)
- high: 55% (109/197, WLB 48%)
- longshot: 57% (136/240, WLB 50%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 51% → 2-leg ~26%, 3-leg ~13% (rec max 2)
- medium: leg 61% → 2-leg ~37%, 3-leg ~22% (rec max 3)
- high: leg 55% → 2-leg ~31%, 3-leg ~17% (rec max 3)
- longshot: leg 57% → 2-leg ~32%, 3-leg ~18% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 1.8pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
