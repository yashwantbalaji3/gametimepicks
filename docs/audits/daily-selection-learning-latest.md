# Daily selection learning — through 2026-10-01

Training window: **2026-09-24 → 2026-10-01** (8d). Universe legs:
**2312** (baseline 45.9%). Published legs:
**488**, cards: **144**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 55% (468/854, WLB 51%) shrunk 55%
- **batter_hits_runs_rbis** → `restricted` — 51% (428/840, WLB 48%) shrunk 51%
- **batter_total_bases** → `disabled` — 47% (123/261, WLB 41%) shrunk 47%
- **pitcher_strikeouts** → `disabled` — 42% (42/100, WLB 33%) shrunk 43%

## Calibration
- Edge inverted at high values: **true** 10-15:49% (189/383, WLB 44%) · neg:52% (193/370, WLB 47%) · 0-5:54% (301/558, WLB 50%) · 5-10:51% (258/509, WLB 46%) · 20+:50% (40/80, WLB 39%) · 15-20:52% (80/155, WLB 44%)
- Confidence predictive: **false** (spread 2.9pts) High:50% (527/1047, WLB 47%) · Low:53% (384/722, WLB 50%) · Medium:52% (150/286, WLB 47%)

## Published leg hit rate by lane
- low: 54% (35/65, WLB 42%)
- medium: 50% (54/109, WLB 40%)
- high: 58% (81/140, WLB 50%)
- longshot: 51% (89/174, WLB 44%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 54% → 2-leg ~29%, 3-leg ~16% (rec max 2)
- medium: leg 50% → 2-leg ~25%, 3-leg ~12% (rec max 3)
- high: leg 58% → 2-leg ~34%, 3-leg ~19% (rec max 3)
- longshot: leg 51% → 2-leg ~26%, 3-leg ~13% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 2.9pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
