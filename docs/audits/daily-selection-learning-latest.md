# Daily selection learning — through 2026-09-17

Training window: **2026-09-10 → 2026-09-17** (8d). Universe legs:
**3994** (baseline 46.8%). Published legs:
**666**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 56% (820/1460, WLB 54%) shrunk 56%
- **batter_hits_runs_rbis** → `restricted` — 49% (715/1457, WLB 47%) shrunk 49%
- **batter_total_bases** → `disabled` — 43% (249/575, WLB 39%) shrunk 43%
- **pitcher_strikeouts** → `disabled` — 46% (85/184, WLB 39%) shrunk 46%

## Calibration
- Edge inverted at high values: **true** 0-5:52% (575/1115, WLB 49%) · neg:51% (365/719, WLB 47%) · 5-10:50% (451/896, WLB 47%) · 10-15:50% (276/550, WLB 46%) · 15-20:49% (133/272, WLB 43%) · 20+:56% (69/124, WLB 47%)
- Confidence predictive: **false** (spread 1.5pts) Medium:51% (265/516, WLB 47%) · Low:52% (744/1443, WLB 49%) · High:50% (860/1717, WLB 48%)

## Published leg hit rate by lane
- low: 69% (64/93, WLB 59%)
- medium: 56% (82/146, WLB 48%)
- high: 58% (110/191, WLB 51%)
- longshot: 59% (139/236, WLB 53%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 69% → 2-leg ~47%, 3-leg ~33% (rec max 2)
- medium: leg 56% → 2-leg ~32%, 3-leg ~18% (rec max 3)
- high: leg 58% → 2-leg ~33%, 3-leg ~19% (rec max 3)
- longshot: leg 59% → 2-leg ~35%, 3-leg ~20% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 1.5pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
