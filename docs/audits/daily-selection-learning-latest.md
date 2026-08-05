# Daily selection learning — through 2026-08-04

Training window: **2026-07-28 → 2026-08-04** (8d). Universe legs:
**1466** (baseline 45.8%). Published legs:
**340**, cards: **120**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 53% (317/600, WLB 49%) shrunk 53%
- **batter_hits_runs_rbis** → `restricted` — 48% (198/412, WLB 43%) shrunk 48%
- **batter_total_bases** → `disabled` — 42% (124/298, WLB 36%) shrunk 42%
- **pitcher_strikeouts** → `disabled` — 44% (32/72, WLB 34%) shrunk 45%

## Calibration
- Edge inverted at high values: **true** 15-20:44% (39/88, WLB 34%) · neg:50% (157/317, WLB 44%) · 0-5:48% (215/447, WLB 44%) · 5-10:51% (167/329, WLB 45%) · 10-15:46% (79/171, WLB 39%) · 20+:47% (14/30, WLB 30%)
- Confidence predictive: **false** (spread 4.4pts) High:48% (284/587, WLB 44%) · Low:50% (299/601, WLB 46%) · Medium:45% (88/194, WLB 39%)

## Published leg hit rate by lane
- low: 63% (30/48, WLB 48%)
- medium: 66% (52/79, WLB 55%)
- high: 60% (57/95, WLB 50%)
- longshot: 64% (75/118, WLB 55%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 63% → 2-leg ~39%, 3-leg ~24% (rec max 2)
- medium: leg 66% → 2-leg ~43%, 3-leg ~28% (rec max 3)
- high: leg 60% → 2-leg ~36%, 3-leg ~22% (rec max 3)
- longshot: leg 64% → 2-leg ~40%, 3-leg ~26% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 4.4pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
