# Daily selection learning — through 2026-07-30

Training window: **2026-07-23 → 2026-07-30** (8d). Universe legs:
**2962** (baseline 44.9%). Published legs:
**504**, cards: **168**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 52% (557/1069, WLB 49%) shrunk 52%
- **batter_hits_runs_rbis** → `restricted` — 49% (513/1057, WLB 46%) shrunk 48%
- **batter_total_bases** → `disabled` — 40% (200/496, WLB 36%) shrunk 41%
- **pitcher_strikeouts** → `disabled` — 48% (60/125, WLB 39%) shrunk 48%

## Calibration
- Edge inverted at high values: **true** 20+:38% (30/80, WLB 28%) · neg:49% (301/609, WLB 45%) · 0-5:49% (398/810, WLB 46%) · 5-10:50% (344/686, WLB 46%) · 15-20:46% (76/165, WLB 39%) · 10-15:46% (181/397, WLB 41%)
- Confidence predictive: **false** (spread 2.2pts) Low:48% (536/1115, WLB 45%) · Medium:50% (194/386, WLB 45%) · High:48% (600/1246, WLB 45%)

## Published leg hit rate by lane
- low: 59% (42/71, WLB 48%)
- medium: 63% (73/115, WLB 54%)
- high: 61% (86/140, WLB 53%)
- longshot: 60% (107/178, WLB 53%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 59% → 2-leg ~35%, 3-leg ~21% (rec max 2)
- medium: leg 63% → 2-leg ~40%, 3-leg ~26% (rec max 3)
- high: leg 61% → 2-leg ~38%, 3-leg ~23% (rec max 3)
- longshot: leg 60% → 2-leg ~36%, 3-leg ~22% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 2.2pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
