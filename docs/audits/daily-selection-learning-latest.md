# Daily selection learning — through 2026-09-09

Training window: **2026-09-02 → 2026-09-09** (8d). Universe legs:
**3984** (baseline 47.7%). Published legs:
**666**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits_runs_rbis** → `restricted` — 51% (743/1455, WLB 49%) shrunk 51%
- **batter_hits** → `allowed` — 55% (801/1454, WLB 53%) shrunk 55%
- **batter_total_bases** → `disabled` — 46% (266/584, WLB 42%) shrunk 46%
- **pitcher_strikeouts** → `disabled` — 50% (91/182, WLB 43%) shrunk 50%

## Calibration
- Edge inverted at high values: **true** 20+:53% (72/136, WLB 45%) · 0-5:52% (558/1067, WLB 49%) · 5-10:52% (448/864, WLB 49%) · neg:51% (410/798, WLB 48%) · 10-15:52% (286/548, WLB 48%) · 15-20:48% (127/262, WLB 42%)
- Confidence predictive: **false** (spread 1.7pts) Low:52% (776/1480, WLB 50%) · Medium:51% (266/524, WLB 46%) · High:51% (859/1671, WLB 49%)

## Published leg hit rate by lane
- low: 65% (59/91, WLB 55%)
- medium: 57% (85/148, WLB 49%)
- high: 58% (109/189, WLB 51%)
- longshot: 58% (139/238, WLB 52%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 65% → 2-leg ~42%, 3-leg ~27% (rec max 2)
- medium: leg 57% → 2-leg ~33%, 3-leg ~19% (rec max 3)
- high: leg 58% → 2-leg ~33%, 3-leg ~19% (rec max 3)
- longshot: leg 58% → 2-leg ~34%, 3-leg ~20% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 1.7pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
