# Daily selection learning — through 2026-10-03

Training window: **2026-09-26 → 2026-10-03** (8d). Universe legs:
**1503** (baseline 45.8%). Published legs:
**400**, cards: **120**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 54% (306/562, WLB 50%) shrunk 54%
- **batter_hits_runs_rbis** → `restricted` — 51% (276/541, WLB 47%) shrunk 51%
- **batter_total_bases** → `disabled` — 48% (78/163, WLB 40%) shrunk 48%
- **pitcher_strikeouts** → `disabled` — 46% (29/63, WLB 34%) shrunk 46%

## Calibration
- Edge inverted at high values: **true** 10-15:48% (112/235, WLB 41%) · neg:55% (128/232, WLB 49%) · 5-10:52% (169/326, WLB 46%) · 0-5:51% (191/371, WLB 46%) · 15-20:51% (57/111, WLB 42%) · 20+:59% (32/54, WLB 46%)
- Confidence predictive: **true** (spread 5.1pts) High:50% (338/671, WLB 47%) · Low:55% (255/465, WLB 50%) · Medium:50% (96/193, WLB 43%)

## Published leg hit rate by lane
- low: 50% (27/54, WLB 37%)
- medium: 48% (42/88, WLB 38%)
- high: 57% (65/115, WLB 47%)
- longshot: 49% (70/143, WLB 41%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 50% → 2-leg ~25%, 3-leg ~13% (rec max 2)
- medium: leg 48% → 2-leg ~23%, 3-leg ~11% (rec max 3)
- high: leg 57% → 2-leg ~32%, 3-leg ~18% (rec max 3)
- longshot: leg 49% → 2-leg ~24%, 3-leg ~12% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote

_Recommendation artifact only — no production logic changed by this script._
