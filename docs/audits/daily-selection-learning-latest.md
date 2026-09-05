# Daily selection learning — through 2026-09-04

Training window: **2026-08-28 → 2026-09-04** (8d). Universe legs:
**3736** (baseline 49.3%). Published legs:
**668**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 54% (744/1369, WLB 52%) shrunk 54%
- **batter_hits_runs_rbis** → `allowed` — 52% (718/1369, WLB 50%) shrunk 52%
- **batter_total_bases** → `high_risk_only` — 48% (294/615, WLB 44%) shrunk 48%
- **pitcher_strikeouts** → `restricted` — 52% (86/166, WLB 44%) shrunk 52%

## Calibration
- Edge inverted at high values: **true** 0-5:54% (562/1035, WLB 51%) · 20+:51% (50/99, WLB 41%) · neg:50% (412/832, WLB 46%) · 15-20:48% (104/218, WLB 41%) · 5-10:56% (462/827, WLB 52%) · 10-15:50% (252/508, WLB 45%)
- Confidence predictive: **false** (spread 0.8pts) Medium:52% (264/509, WLB 48%) · Low:52% (761/1458, WLB 50%) · High:53% (817/1552, WLB 50%)

## Published leg hit rate by lane
- low: 65% (61/94, WLB 55%)
- medium: 55% (79/144, WLB 47%)
- high: 58% (109/189, WLB 51%)
- longshot: 58% (139/241, WLB 51%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 65% → 2-leg ~42%, 3-leg ~27% (rec max 2)
- medium: leg 55% → 2-leg ~30%, 3-leg ~17% (rec max 3)
- high: leg 58% → 2-leg ~33%, 3-leg ~19% (rec max 3)
- longshot: leg 58% → 2-leg ~33%, 3-leg ~19% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 0.8pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
