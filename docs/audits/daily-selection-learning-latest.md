# Daily selection learning — through 2026-09-25

Training window: **2026-09-18 → 2026-09-25** (8d). Universe legs:
**4011** (baseline 46.7%). Published legs:
**665**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 56% (820/1465, WLB 53%) shrunk 56%
- **batter_hits_runs_rbis** → `restricted` — 50% (732/1457, WLB 48%) shrunk 50%
- **batter_total_bases** → `disabled` — 43% (233/546, WLB 39%) shrunk 43%
- **pitcher_strikeouts** → `disabled` — 47% (88/186, WLB 40%) shrunk 47%

## Calibration
- Edge inverted at high values: **true** 0-5:55% (534/967, WLB 52%) · 20+:43% (65/151, WLB 35%) · neg:50% (370/742, WLB 46%) · 5-10:52% (461/887, WLB 49%) · 15-20:47% (134/286, WLB 41%) · 10-15:50% (309/621, WLB 46%)
- Confidence predictive: **false** (spread 4.6pts) Low:51% (717/1401, WLB 49%) · Medium:55% (253/460, WLB 50%) · High:50% (903/1793, WLB 48%)

## Published leg hit rate by lane
- low: 61% (55/90, WLB 51%)
- medium: 53% (79/149, WLB 45%)
- high: 57% (107/189, WLB 49%)
- longshot: 56% (133/237, WLB 50%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 61% → 2-leg ~37%, 3-leg ~23% (rec max 2)
- medium: leg 53% → 2-leg ~28%, 3-leg ~15% (rec max 3)
- high: leg 57% → 2-leg ~32%, 3-leg ~18% (rec max 3)
- longshot: leg 56% → 2-leg ~32%, 3-leg ~18% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 4.6pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
