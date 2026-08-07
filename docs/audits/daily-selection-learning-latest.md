# Daily selection learning — through 2026-08-06

Training window: **2026-07-30 → 2026-08-06** (8d). Universe legs:
**2536** (baseline 45.3%). Published legs:
**500**, cards: **144**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 51% (507/986, WLB 48%) shrunk 51%
- **batter_hits_runs_rbis** → `restricted` — 47% (378/798, WLB 44%) shrunk 47%
- **batter_total_bases** → `disabled` — 43% (211/493, WLB 39%) shrunk 43%
- **pitcher_strikeouts** → `disabled` — 43% (52/121, WLB 35%) shrunk 43%

## Calibration
- Edge inverted at high values: **true** 15-20:45% (64/141, WLB 37%) · neg:49% (291/600, WLB 45%) · 0-5:48% (375/785, WLB 44%) · 5-10:49% (260/528, WLB 45%) · 10-15:47% (134/287, WLB 41%) · 20+:42% (24/57, WLB 30%)
- Confidence predictive: **false** (spread 2.3pts) High:48% (457/956, WLB 45%) · Low:48% (529/1091, WLB 46%) · Medium:46% (162/351, WLB 41%)

## Published leg hit rate by lane
- low: 56% (40/72, WLB 44%)
- medium: 63% (74/117, WLB 54%)
- high: 51% (70/138, WLB 42%)
- longshot: 59% (102/173, WLB 52%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 56% → 2-leg ~31%, 3-leg ~17% (rec max 2)
- medium: leg 63% → 2-leg ~40%, 3-leg ~25% (rec max 3)
- high: leg 51% → 2-leg ~26%, 3-leg ~13% (rec max 3)
- longshot: leg 59% → 2-leg ~35%, 3-leg ~21% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 2.3pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
