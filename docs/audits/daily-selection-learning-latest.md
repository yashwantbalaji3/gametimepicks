# Daily selection learning — through 2026-08-27

Training window: **2026-08-20 → 2026-08-27** (8d). Universe legs:
**3929** (baseline 46.9%). Published legs:
**659**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits_runs_rbis** → `restricted` — 50% (739/1466, WLB 48%) shrunk 50%
- **batter_hits** → `allowed` — 54% (787/1464, WLB 51%) shrunk 54%
- **batter_total_bases** → `disabled` — 41% (228/557, WLB 37%) shrunk 41%
- **pitcher_strikeouts** → `disabled` — 50% (87/173, WLB 43%) shrunk 50%

## Calibration
- Edge inverted at high values: **true** neg:50% (396/785, WLB 47%) · 0-5:52% (565/1084, WLB 49%) · 5-10:52% (448/869, WLB 48%) · 10-15:47% (268/569, WLB 43%) · 15-20:45% (107/237, WLB 39%) · 20+:49% (57/116, WLB 40%)
- Confidence predictive: **false** (spread 4.6pts) Low:50% (736/1458, WLB 48%) · Medium:54% (284/529, WLB 49%) · High:49% (821/1673, WLB 47%)

## Published leg hit rate by lane
- low: 63% (59/93, WLB 53%)
- medium: 59% (87/147, WLB 51%)
- high: 56% (104/186, WLB 49%)
- longshot: 62% (144/233, WLB 55%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 63% → 2-leg ~40%, 3-leg ~26% (rec max 2)
- medium: leg 59% → 2-leg ~35%, 3-leg ~21% (rec max 3)
- high: leg 56% → 2-leg ~31%, 3-leg ~18% (rec max 3)
- longshot: leg 62% → 2-leg ~38%, 3-leg ~24% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 4.6pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
