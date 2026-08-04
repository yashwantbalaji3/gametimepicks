# Daily selection learning — through 2026-08-03

Training window: **2026-07-27 → 2026-08-03** (8d). Universe legs:
**1379** (baseline 42.9%). Published legs:
**330**, cards: **120**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 53% (289/549, WLB 48%) shrunk 52%
- **batter_hits_runs_rbis** → `disabled` — 46% (167/361, WLB 41%) shrunk 46%
- **batter_total_bases** → `disabled` — 38% (107/283, WLB 32%) shrunk 38%
- **pitcher_strikeouts** → `disabled` — 45% (29/64, WLB 34%) shrunk 45%

## Calibration
- Edge inverted at high values: **true** 0-5:48% (196/412, WLB 43%) · 5-10:48% (149/312, WLB 42%) · neg:52% (142/273, WLB 46%) · 10-15:43% (68/160, WLB 35%) · 20+:23% (7/31, WLB 11%) · 15-20:43% (30/69, WLB 32%)
- Confidence predictive: **false** (spread 3.5pts) Low:49% (258/526, WLB 45%) · High:46% (246/540, WLB 41%) · Medium:46% (88/191, WLB 39%)

## Published leg hit rate by lane
- low: 58% (28/48, WLB 44%)
- medium: 63% (48/76, WLB 52%)
- high: 60% (55/92, WLB 50%)
- longshot: 61% (69/114, WLB 51%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 58% → 2-leg ~34%, 3-leg ~20% (rec max 2)
- medium: leg 63% → 2-leg ~40%, 3-leg ~25% (rec max 3)
- high: leg 60% → 2-leg ~36%, 3-leg ~21% (rec max 3)
- longshot: leg 61% → 2-leg ~37%, 3-leg ~22% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 3.5pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
