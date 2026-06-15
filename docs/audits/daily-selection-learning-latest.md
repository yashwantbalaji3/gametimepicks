# Daily selection learning — through 2026-06-14

Training window: **2026-06-07 → 2026-06-14** (8d). Universe legs:
**4100** (baseline 51.3%). Published legs:
**642**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 55% (850/1550, WLB 52%) shrunk 55%
- **batter_hits_runs_rbis** → `high_risk_only` — 50% (772/1548, WLB 47%) shrunk 50%
- **batter_total_bases** → `high_risk_only` — 48% (389/809, WLB 45%) shrunk 48%
- **pitcher_strikeouts** → `disabled` — 48% (92/193, WLB 41%) shrunk 48%

## Calibration
- Edge inverted at high values: **true** 5-10:51% (518/1021, WLB 48%) · 0-5:53% (648/1233, WLB 50%) · neg:51% (427/836, WLB 48%) · 10-15:50% (290/584, WLB 46%) · 15-20:52% (144/277, WLB 46%) · 20+:51% (76/149, WLB 43%)
- Confidence predictive: **false** (spread 1.9pts) High:51% (950/1878, WLB 48%) · Medium:50% (280/555, WLB 46%) · Low:52% (873/1667, WLB 50%)

## Published leg hit rate by lane
- low: 69% (56/81, WLB 58%)
- medium: 61% (89/145, WLB 53%)
- high: 66% (123/186, WLB 59%)
- longshot: 59% (136/230, WLB 53%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 69% → 2-leg ~48%, 3-leg ~33% (rec max 2)
- medium: leg 61% → 2-leg ~38%, 3-leg ~23% (rec max 3)
- high: leg 66% → 2-leg ~44%, 3-leg ~29% (rec max 3)
- longshot: leg 59% → 2-leg ~35%, 3-leg ~21% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 1.9pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
