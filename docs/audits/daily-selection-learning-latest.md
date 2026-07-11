# Daily selection learning — through 2026-07-10

Training window: **2026-07-03 → 2026-07-10** (8d). Universe legs:
**2593** (baseline 46.7%). Published legs:
**0**, cards: **0**. noLiveWire=**true**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 54% (612/1124, WLB 52%) shrunk 54%
- **batter_hits_runs_rbis** → `restricted` — 50% (298/593, WLB 46%) shrunk 50%
- **batter_total_bases** → `disabled` — 44% (226/518, WLB 39%) shrunk 44%
- **pitcher_strikeouts** → `disabled` — 49% (75/154, WLB 41%) shrunk 48%

## Calibration
- Edge inverted at high values: **true** 0-5:53% (404/764, WLB 49%) · neg:52% (291/557, WLB 48%) · 5-10:50% (286/569, WLB 46%) · 10-15:49% (142/292, WLB 43%) · 20+:41% (29/71, WLB 30%) · 15-20:43% (59/136, WLB 35%)
- Confidence predictive: **false** (spread 4.8pts) Medium:54% (201/375, WLB 49%) · Low:51% (524/1019, WLB 48%) · High:49% (486/995, WLB 46%)

## Published leg hit rate by lane


## Card length (parlay-math projection from observed leg rate)


## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 4.8pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
