# Daily selection learning — through 2026-07-31

Training window: **2026-07-24 → 2026-07-31** (8d). Universe legs:
**3055** (baseline 45.2%). Published legs:
**509**, cards: **168**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 53% (601/1135, WLB 50%) shrunk 53%
- **batter_hits_runs_rbis** → `restricted` — 49% (497/1020, WLB 46%) shrunk 49%
- **batter_total_bases** → `disabled` — 41% (221/540, WLB 37%) shrunk 41%
- **pitcher_strikeouts** → `disabled` — 46% (62/134, WLB 38%) shrunk 46%

## Calibration
- Edge inverted at high values: **true** 10-15:47% (185/396, WLB 42%) · neg:49% (313/633, WLB 46%) · 0-5:49% (417/855, WLB 45%) · 5-10:51% (358/700, WLB 47%) · 15-20:48% (79/165, WLB 40%) · 20+:36% (29/80, WLB 27%)
- Confidence predictive: **false** (spread 2.0pts) High:49% (621/1259, WLB 47%) · Low:48% (558/1165, WLB 45%) · Medium:50% (202/405, WLB 45%)

## Published leg hit rate by lane
- low: 63% (45/71, WLB 52%)
- medium: 71% (82/116, WLB 62%)
- high: 66% (95/144, WLB 58%)
- longshot: 69% (122/178, WLB 61%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 63% → 2-leg ~40%, 3-leg ~26% (rec max 2)
- medium: leg 71% → 2-leg ~50%, 3-leg ~35% (rec max 3)
- high: leg 66% → 2-leg ~44%, 3-leg ~29% (rec max 3)
- longshot: leg 69% → 2-leg ~47%, 3-leg ~32% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 2.0pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
