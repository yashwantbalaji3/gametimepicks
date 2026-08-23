# Daily selection learning — through 2026-08-22

Training window: **2026-08-15 → 2026-08-22** (8d). Universe legs:
**4338** (baseline 47.3%). Published legs:
**690**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 55% (882/1616, WLB 52%) shrunk 54%
- **batter_hits_runs_rbis** → `restricted` — 51% (821/1616, WLB 48%) shrunk 51%
- **batter_total_bases** → `disabled` — 40% (257/645, WLB 36%) shrunk 40%
- **pitcher_strikeouts** → `disabled` — 49% (92/189, WLB 42%) shrunk 49%

## Calibration
- Edge inverted at high values: **true** 0-5:51% (605/1188, WLB 48%) · neg:51% (459/895, WLB 48%) · 5-10:51% (505/988, WLB 48%) · 15-20:48% (123/254, WLB 42%) · 10-15:48% (298/618, WLB 44%) · 20+:50% (62/123, WLB 42%)
- Confidence predictive: **false** (spread 1.4pts) Low:51% (819/1600, WLB 49%) · High:50% (926/1858, WLB 48%) · Medium:50% (307/608, WLB 47%)

## Published leg hit rate by lane
- low: 51% (46/90, WLB 41%)
- medium: 58% (90/156, WLB 50%)
- high: 55% (110/200, WLB 48%)
- longshot: 53% (129/244, WLB 47%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 51% → 2-leg ~26%, 3-leg ~13% (rec max 2)
- medium: leg 58% → 2-leg ~33%, 3-leg ~19% (rec max 3)
- high: leg 55% → 2-leg ~30%, 3-leg ~17% (rec max 3)
- longshot: leg 53% → 2-leg ~28%, 3-leg ~15% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 1.4pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
