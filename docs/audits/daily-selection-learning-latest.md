# Daily selection learning — through 2026-08-19

Training window: **2026-08-12 → 2026-08-19** (8d). Universe legs:
**4346** (baseline 46.1%). Published legs:
**672**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 54% (856/1589, WLB 51%) shrunk 54%
- **batter_hits_runs_rbis** → `restricted` — 49% (785/1589, WLB 47%) shrunk 49%
- **batter_total_bases** → `disabled` — 38% (263/688, WLB 35%) shrunk 38%
- **pitcher_strikeouts** → `restricted` — 53% (100/187, WLB 46%) shrunk 53%

## Calibration
- Edge inverted at high values: **true** 5-10:51% (487/963, WLB 47%) · 10-15:47% (273/587, WLB 43%) · 0-5:50% (619/1241, WLB 47%) · neg:51% (453/896, WLB 47%) · 15-20:47% (115/246, WLB 41%) · 20+:48% (57/120, WLB 39%)
- Confidence predictive: **false** (spread 3.0pts) High:49% (875/1794, WLB 46%) · Low:51% (828/1630, WLB 48%) · Medium:48% (301/629, WLB 44%)

## Published leg hit rate by lane
- low: 57% (51/89, WLB 47%)
- medium: 56% (84/149, WLB 48%)
- high: 56% (107/191, WLB 49%)
- longshot: 56% (137/243, WLB 50%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 57% → 2-leg ~33%, 3-leg ~19% (rec max 2)
- medium: leg 56% → 2-leg ~32%, 3-leg ~18% (rec max 3)
- high: leg 56% → 2-leg ~31%, 3-leg ~18% (rec max 3)
- longshot: leg 56% → 2-leg ~32%, 3-leg ~18% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 3.0pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
