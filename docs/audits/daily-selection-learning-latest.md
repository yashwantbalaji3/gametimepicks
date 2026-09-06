# Daily selection learning — through 2026-09-05

Training window: **2026-08-29 → 2026-09-05** (8d). Universe legs:
**3979** (baseline 49.4%). Published legs:
**669**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 55% (801/1449, WLB 53%) shrunk 55%
- **batter_hits_runs_rbis** → `allowed` — 53% (764/1449, WLB 50%) shrunk 53%
- **batter_total_bases** → `high_risk_only` — 48% (308/648, WLB 44%) shrunk 48%
- **pitcher_strikeouts** → `restricted` — 51% (91/177, WLB 44%) shrunk 51%

## Calibration
- Edge inverted at high values: **true** 0-5:54% (593/1098, WLB 51%) · neg:50% (439/882, WLB 46%) · 5-10:54% (473/876, WLB 51%) · 10-15:53% (283/534, WLB 49%) · 15-20:53% (118/223, WLB 46%) · 20+:53% (58/110, WLB 43%)
- Confidence predictive: **false** (spread 2.9pts) Medium:51% (273/539, WLB 46%) · Low:53% (818/1553, WLB 50%) · High:54% (873/1631, WLB 51%)

## Published leg hit rate by lane
- low: 70% (65/93, WLB 60%)
- medium: 55% (80/146, WLB 47%)
- high: 59% (112/190, WLB 52%)
- longshot: 60% (143/240, WLB 53%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 70% → 2-leg ~49%, 3-leg ~34% (rec max 2)
- medium: leg 55% → 2-leg ~30%, 3-leg ~16% (rec max 3)
- high: leg 59% → 2-leg ~35%, 3-leg ~21% (rec max 3)
- longshot: leg 60% → 2-leg ~36%, 3-leg ~21% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 2.9pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
