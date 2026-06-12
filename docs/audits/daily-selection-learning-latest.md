# Daily selection learning — through 2026-06-11

Training window: **2026-06-04 → 2026-06-11** (8d). Universe legs:
**3908** (baseline 50.3%). Published legs:
**615**, cards: **184**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 55% (818/1490, WLB 52%) shrunk 55%
- **batter_hits_runs_rbis** → `high_risk_only` — 49% (724/1488, WLB 46%) shrunk 49%
- **batter_total_bases** → `disabled` — 45% (337/755, WLB 41%) shrunk 45%
- **pitcher_strikeouts** → `disabled` — 50% (87/175, WLB 42%) shrunk 50%

## Calibration
- Edge inverted at high values: **true** 5-10:53% (520/988, WLB 50%) · 20+:48% (60/126, WLB 39%) · 0-5:50% (593/1185, WLB 47%) · 10-15:49% (264/544, WLB 44%) · neg:51% (402/790, WLB 47%) · 15-20:46% (127/275, WLB 40%)
- Confidence predictive: **false** (spread 0.5pts) High:50% (911/1806, WLB 48%) · Low:50% (771/1540, WLB 48%) · Medium:51% (284/562, WLB 46%)

## Published leg hit rate by lane
- low: 64% (53/83, WLB 53%)
- medium: 58% (80/139, WLB 49%)
- high: 57% (101/176, WLB 50%)
- longshot: 53% (115/217, WLB 46%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 64% → 2-leg ~41%, 3-leg ~26% (rec max 2)
- medium: leg 58% → 2-leg ~33%, 3-leg ~19% (rec max 3)
- high: leg 57% → 2-leg ~33%, 3-leg ~19% (rec max 3)
- longshot: leg 53% → 2-leg ~28%, 3-leg ~15% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 0.5pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
