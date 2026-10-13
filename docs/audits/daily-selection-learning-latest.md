# Daily selection learning — through 2026-10-12

Training window: **2026-10-05 → 2026-10-12** (8d). Universe legs:
**488** (baseline 47.5%). Published legs:
**98**, cards: **29**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 55% (113/204, WLB 49%) shrunk 55%
- **batter_hits_runs_rbis** → `disabled` — 48% (97/204, WLB 41%) shrunk 48%
- **batter_total_bases** → `disabled` — 23% (9/40, WLB 12%) shrunk 31%
- **pitcher_strikeouts** → `disabled` — 57% (13/23, WLB 37%) shrunk 52%

## Calibration
- Edge inverted at high values: **true** 5-10:53% (63/120, WLB 44%) · 0-5:52% (53/101, WLB 43%) · 10-15:46% (54/117, WLB 37%) · 20+:41% (17/41, WLB 28%) · 15-20:45% (26/58, WLB 33%) · neg:56% (19/34, WLB 39%)
- Confidence predictive: **false** (spread 2.8pts) High:48% (143/295, WLB 43%) · Low:51% (60/117, WLB 42%) · Medium:49% (29/59, WLB 37%)

## Published leg hit rate by lane
- low: 71% (12/17, WLB 47%)
- medium: 67% (16/24, WLB 47%)
- high: 73% (19/26, WLB 54%)
- longshot: 68% (21/31, WLB 50%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 71% → 2-leg ~50%, 3-leg ~35% (rec max 2)
- medium: leg 67% → 2-leg ~44%, 3-leg ~30% (rec max 3)
- high: leg 73% → 2-leg ~53%, 3-leg ~39% (rec max 3)
- longshot: leg 68% → 2-leg ~46%, 3-leg ~31% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 2.8pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
