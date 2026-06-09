# Daily selection learning — through 2026-06-08

Training window: **2026-06-01 → 2026-06-08** (8d). Universe legs:
**3877** (baseline 48.5%). Published legs:
**548**, cards: **160**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 53% (786/1497, WLB 50%) shrunk 52%
- **batter_hits_runs_rbis** → `restricted` — 48% (720/1497, WLB 46%) shrunk 48%
- **batter_total_bases** → `disabled` — 42% (295/706, WLB 38%) shrunk 42%
- **pitcher_strikeouts** → `disabled` — 46% (81/177, WLB 39%) shrunk 46%

## Calibration
- Edge inverted at high values: **true** neg:50% (389/772, WLB 47%) · 20+:40% (51/129, WLB 32%) · 0-5:49% (564/1146, WLB 46%) · 5-10:51% (486/947, WLB 48%) · 10-15:46% (269/589, WLB 42%) · 15-20:42% (123/294, WLB 36%)
- Confidence predictive: **false** (spread 3.0pts) Low:48% (712/1473, WLB 46%) · High:48% (877/1829, WLB 46%) · Medium:51% (293/575, WLB 47%)

## Published leg hit rate by lane
- low: 56% (46/82, WLB 45%)
- medium: 53% (63/119, WLB 44%)
- high: 52% (80/154, WLB 44%)
- longshot: 47% (90/193, WLB 40%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 56% → 2-leg ~32%, 3-leg ~18% (rec max 2)
- medium: leg 53% → 2-leg ~28%, 3-leg ~15% (rec max 3)
- high: leg 52% → 2-leg ~27%, 3-leg ~14% (rec max 3)
- longshot: leg 47% → 2-leg ~22%, 3-leg ~10% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 3.0pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
