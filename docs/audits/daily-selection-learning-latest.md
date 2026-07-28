# Daily selection learning — through 2026-07-27

Training window: **2026-07-20 → 2026-07-27** (8d). Universe legs:
**3267** (baseline 44.3%). Published legs:
**499**, cards: **144**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 53% (607/1152, WLB 50%) shrunk 53%
- **batter_hits_runs_rbis** → `restricted` — 49% (556/1140, WLB 46%) shrunk 49%
- **batter_total_bases** → `disabled` — 40% (216/540, WLB 36%) shrunk 40%
- **pitcher_strikeouts** → `disabled` — 49% (69/142, WLB 41%) shrunk 48%

## Calibration
- Edge inverted at high values: **true** 20+:38% (34/89, WLB 29%) · 10-15:46% (196/424, WLB 42%) · neg:50% (334/664, WLB 47%) · 0-5:49% (431/872, WLB 46%) · 5-10:49% (370/750, WLB 46%) · 15-20:47% (83/175, WLB 40%)
- Confidence predictive: **false** (spread 1.0pts) Low:49% (595/1211, WLB 46%) · High:48% (649/1348, WLB 45%) · Medium:49% (204/415, WLB 44%)

## Published leg hit rate by lane
- low: 61% (43/70, WLB 50%)
- medium: 67% (75/112, WLB 58%)
- high: 62% (87/141, WLB 53%)
- longshot: 63% (110/176, WLB 55%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 61% → 2-leg ~38%, 3-leg ~23% (rec max 2)
- medium: leg 67% → 2-leg ~45%, 3-leg ~30% (rec max 3)
- high: leg 62% → 2-leg ~38%, 3-leg ~24% (rec max 3)
- longshot: leg 63% → 2-leg ~39%, 3-leg ~24% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 1.0pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
