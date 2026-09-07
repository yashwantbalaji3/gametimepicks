# Daily selection learning — through 2026-09-06

Training window: **2026-08-30 → 2026-09-06** (8d). Universe legs:
**4016** (baseline 49.0%). Published legs:
**665**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits_runs_rbis** → `allowed` — 52% (762/1456, WLB 50%) shrunk 52%
- **batter_hits** → `allowed` — 55% (806/1455, WLB 53%) shrunk 55%
- **batter_total_bases** → `high_risk_only` — 48% (301/631, WLB 44%) shrunk 48%
- **pitcher_strikeouts** → `restricted` — 53% (97/184, WLB 46%) shrunk 52%

## Calibration
- Edge inverted at high values: **true** 0-5:53% (581/1089, WLB 50%) · neg:50% (432/872, WLB 46%) · 10-15:53% (287/545, WLB 48%) · 5-10:56% (482/868, WLB 52%) · 20+:53% (60/114, WLB 44%) · 15-20:52% (124/238, WLB 46%)
- Confidence predictive: **true** (spread 5.2pts) Low:53% (815/1546, WLB 50%) · Medium:49% (260/532, WLB 45%) · High:54% (891/1648, WLB 52%)

## Published leg hit rate by lane
- low: 69% (64/93, WLB 59%)
- medium: 57% (83/146, WLB 49%)
- high: 59% (110/188, WLB 51%)
- longshot: 60% (142/238, WLB 53%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 69% → 2-leg ~47%, 3-leg ~33% (rec max 2)
- medium: leg 57% → 2-leg ~32%, 3-leg ~18% (rec max 3)
- high: leg 59% → 2-leg ~34%, 3-leg ~20% (rec max 3)
- longshot: leg 60% → 2-leg ~36%, 3-leg ~21% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote

_Recommendation artifact only — no production logic changed by this script._
