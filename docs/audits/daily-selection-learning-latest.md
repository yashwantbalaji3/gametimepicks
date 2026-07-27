# Daily selection learning — through 2026-07-26

Training window: **2026-07-19 → 2026-07-26** (8d). Universe legs:
**2762** (baseline 44.7%). Published legs:
**426**, cards: **120**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 52% (513/984, WLB 49%) shrunk 52%
- **batter_hits_runs_rbis** → `restricted` — 49% (475/972, WLB 46%) shrunk 49%
- **batter_total_bases** → `disabled` — 41% (185/452, WLB 36%) shrunk 41%
- **pitcher_strikeouts** → `disabled` — 50% (62/125, WLB 41%) shrunk 49%

## Calibration
- Edge inverted at high values: **true** 20+:43% (33/76, WLB 33%) · 10-15:47% (175/375, WLB 42%) · neg:48% (272/561, WLB 44%) · 0-5:50% (361/726, WLB 46%) · 5-10:50% (320/641, WLB 46%) · 15-20:48% (74/154, WLB 40%)
- Confidence predictive: **false** (spread 0.3pts) Low:49% (500/1025, WLB 46%) · High:49% (569/1169, WLB 46%) · Medium:49% (166/339, WLB 44%)

## Published leg hit rate by lane
- low: 62% (36/58, WLB 49%)
- medium: 67% (64/96, WLB 57%)
- high: 61% (74/121, WLB 52%)
- longshot: 62% (94/151, WLB 54%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 62% → 2-leg ~39%, 3-leg ~24% (rec max 2)
- medium: leg 67% → 2-leg ~44%, 3-leg ~30% (rec max 3)
- high: leg 61% → 2-leg ~37%, 3-leg ~23% (rec max 3)
- longshot: leg 62% → 2-leg ~39%, 3-leg ~24% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 0.3pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
