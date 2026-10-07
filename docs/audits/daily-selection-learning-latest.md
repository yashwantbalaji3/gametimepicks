# Daily selection learning — through 2026-10-06

Training window: **2026-09-29 → 2026-10-06** (8d). Universe legs:
**697** (baseline 45.6%). Published legs:
**312**, cards: **93**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 49% (149/303, WLB 44%) shrunk 49%
- **batter_hits_runs_rbis** → `disabled` — 45% (132/295, WLB 39%) shrunk 45%
- **batter_total_bases** → `disabled` — 37% (20/54, WLB 25%) shrunk 39%
- **pitcher_strikeouts** → `disabled` — 55% (17/31, WLB 38%) shrunk 51%

## Calibration
- Edge inverted at high values: **true** 0-5:49% (73/149, WLB 41%) · 5-10:47% (77/163, WLB 40%) · neg:52% (33/64, WLB 40%) · 15-20:47% (40/85, WLB 37%) · 10-15:42% (73/172, WLB 35%) · 20+:44% (22/50, WLB 31%)
- Confidence predictive: **true** (spread 10.8pts) Medium:41% (35/85, WLB 31%) · High:45% (190/419, WLB 41%) · Low:52% (93/179, WLB 45%)

## Published leg hit rate by lane
- low: 38% (20/52, WLB 26%)
- medium: 47% (35/75, WLB 36%)
- high: 49% (47/95, WLB 40%)
- longshot: 43% (39/90, WLB 34%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 38% → 2-leg ~15%, 3-leg ~6% (rec max 2)
- medium: leg 47% → 2-leg ~22%, 3-leg ~10% (rec max 3)
- high: leg 49% → 2-leg ~25%, 3-leg ~12% (rec max 3)
- longshot: leg 43% → 2-leg ~19%, 3-leg ~8% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote

_Recommendation artifact only — no production logic changed by this script._
