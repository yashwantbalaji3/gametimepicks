# Daily selection learning — through 2026-10-07

Training window: **2026-09-30 → 2026-10-07** (8d). Universe legs:
**691** (baseline 46.0%). Published legs:
**316**, cards: **93**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 51% (152/298, WLB 45%) shrunk 51%
- **batter_hits_runs_rbis** → `disabled` — 45% (130/290, WLB 39%) shrunk 45%
- **batter_total_bases** → `disabled` — 34% (20/58, WLB 24%) shrunk 37%
- **pitcher_strikeouts** → `disabled` — 53% (16/30, WLB 36%) shrunk 50%

## Calibration
- Edge inverted at high values: **true** neg:56% (37/66, WLB 44%) · 10-15:42% (71/168, WLB 35%) · 0-5:49% (75/153, WLB 41%) · 5-10:49% (77/156, WLB 42%) · 15-20:44% (36/81, WLB 34%) · 20+:42% (22/52, WLB 30%)
- Confidence predictive: **true** (spread 10.4pts) Low:52% (100/191, WLB 45%) · High:46% (184/404, WLB 41%) · Medium:42% (34/81, WLB 32%)

## Published leg hit rate by lane
- low: 45% (23/51, WLB 32%)
- medium: 51% (40/78, WLB 40%)
- high: 51% (49/97, WLB 41%)
- longshot: 53% (48/90, WLB 43%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 45% → 2-leg ~20%, 3-leg ~9% (rec max 2)
- medium: leg 51% → 2-leg ~26%, 3-leg ~14% (rec max 3)
- high: leg 51% → 2-leg ~26%, 3-leg ~13% (rec max 3)
- longshot: leg 53% → 2-leg ~28%, 3-leg ~15% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote

_Recommendation artifact only — no production logic changed by this script._
