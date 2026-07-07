# Daily selection learning — through 2026-07-06

Training window: **2026-06-29 → 2026-07-06** (8d). Universe legs:
**2074** (baseline 48.8%). Published legs:
**0**, cards: **0**. noLiveWire=**true**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 54% (437/811, WLB 50%) shrunk 54%
- **batter_hits_runs_rbis** → `allowed` — 53% (337/630, WLB 50%) shrunk 53%
- **batter_total_bases** → `disabled` — 46% (190/414, WLB 41%) shrunk 46%
- **pitcher_strikeouts** → `disabled` — 48% (48/99, WLB 39%) shrunk 49%

## Calibration
- Edge inverted at high values: **true** 20+:47% (40/86, WLB 36%) · 15-20:43% (56/129, WLB 35%) · neg:53% (237/448, WLB 48%) · 0-5:52% (309/594, WLB 48%) · 10-15:52% (133/255, WLB 46%) · 5-10:54% (237/442, WLB 49%)
- Confidence predictive: **false** (spread 2.8pts) Low:51% (432/843, WLB 48%) · High:52% (425/824, WLB 48%) · Medium:54% (155/287, WLB 48%)

## Published leg hit rate by lane


## Card length (parlay-math projection from observed leg rate)


## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 2.8pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
