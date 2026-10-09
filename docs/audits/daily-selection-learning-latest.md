# Daily selection learning — through 2026-10-08

Training window: **2026-10-01 → 2026-10-08** (8d). Universe legs:
**573** (baseline 45.4%). Published legs:
**232**, cards: **69**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 52% (128/248, WLB 45%) shrunk 51%
- **batter_hits_runs_rbis** → `disabled` — 44% (105/240, WLB 38%) shrunk 44%
- **batter_total_bases** → `disabled` — 26% (12/46, WLB 16%) shrunk 32%
- **pitcher_strikeouts** → `disabled` — 58% (15/26, WLB 39%) shrunk 52%

## Calibration
- Edge inverted at high values: **true** neg:59% (29/49, WLB 45%) · 10-15:42% (57/137, WLB 34%) · 5-10:48% (61/128, WLB 39%) · 0-5:49% (63/129, WLB 40%) · 15-20:43% (30/69, WLB 32%) · 20+:42% (20/48, WLB 29%)
- Confidence predictive: **true** (spread 7.3pts) Low:52% (81/157, WLB 44%) · High:44% (148/333, WLB 39%) · Medium:44% (31/70, WLB 33%)

## Published leg hit rate by lane
- low: 36% (14/39, WLB 23%)
- medium: 58% (35/60, WLB 46%)
- high: 52% (38/73, WLB 41%)
- longshot: 55% (33/60, WLB 42%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 36% → 2-leg ~13%, 3-leg ~5% (rec max 2)
- medium: leg 58% → 2-leg ~34%, 3-leg ~20% (rec max 3)
- high: leg 52% → 2-leg ~27%, 3-leg ~14% (rec max 3)
- longshot: leg 55% → 2-leg ~30%, 3-leg ~17% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote

_Recommendation artifact only — no production logic changed by this script._
