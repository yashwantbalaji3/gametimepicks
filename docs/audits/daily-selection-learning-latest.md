# Daily selection learning — through 2026-06-22

Training window: **2026-06-15 → 2026-06-22** (8d). Universe legs:
**4227** (baseline 45.9%). Published legs:
**307**, cards: **96**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits_runs_rbis** → `restricted` — 50% (750/1486, WLB 48%) shrunk 50%
- **batter_hits** → `allowed` — 55% (807/1476, WLB 52%) shrunk 55%
- **batter_total_bases** → `disabled` — 43% (297/690, WLB 39%) shrunk 43%
- **pitcher_strikeouts** → `disabled` — 48% (87/181, WLB 41%) shrunk 48%

## Calibration
- Edge inverted at high values: **true** 5-10:51% (479/932, WLB 48%) · 20+:40% (56/141, WLB 32%) · 0-5:50% (571/1137, WLB 47%) · neg:54% (423/783, WLB 51%) · 10-15:49% (280/570, WLB 45%) · 15-20:49% (132/270, WLB 43%)
- Confidence predictive: **false** (spread 3.8pts) High:50% (890/1771, WLB 48%) · Low:52% (798/1536, WLB 49%) · Medium:48% (253/526, WLB 44%)

## Published leg hit rate by lane
- low: 64% (27/42, WLB 49%)
- medium: 61% (39/64, WLB 49%)
- high: 59% (53/90, WLB 49%)
- longshot: 61% (68/111, WLB 52%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 64% → 2-leg ~41%, 3-leg ~27% (rec max 2)
- medium: leg 61% → 2-leg ~37%, 3-leg ~23% (rec max 3)
- high: leg 59% → 2-leg ~35%, 3-leg ~20% (rec max 3)
- longshot: leg 61% → 2-leg ~38%, 3-leg ~23% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 3.8pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
