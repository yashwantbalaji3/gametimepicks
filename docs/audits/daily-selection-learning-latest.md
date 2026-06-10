# Daily selection learning — through 2026-06-09

Training window: **2026-06-02 → 2026-06-09** (8d). Universe legs:
**4159** (baseline 49.7%). Published legs:
**573**, cards: **168**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 54% (859/1600, WLB 51%) shrunk 54%
- **batter_hits_runs_rbis** → `high_risk_only` — 49% (778/1600, WLB 46%) shrunk 49%
- **batter_total_bases** → `disabled` — 44% (342/769, WLB 41%) shrunk 45%
- **pitcher_strikeouts** → `disabled` — 47% (89/190, WLB 40%) shrunk 47%

## Calibration
- Edge inverted at high values: **true** 10-15:47% (285/612, WLB 43%) · 15-20:44% (138/315, WLB 38%) · 5-10:52% (547/1050, WLB 49%) · 0-5:51% (625/1228, WLB 48%) · neg:51% (410/811, WLB 47%) · 20+:44% (63/143, WLB 36%)
- Confidence predictive: **false** (spread 3.4pts) High:49% (969/1976, WLB 47%) · Medium:52% (315/601, WLB 48%) · Low:50% (784/1582, WLB 47%)

## Published leg hit rate by lane
- low: 58% (49/84, WLB 48%)
- medium: 57% (73/127, WLB 49%)
- high: 55% (89/163, WLB 47%)
- longshot: 52% (103/199, WLB 45%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 58% → 2-leg ~34%, 3-leg ~20% (rec max 2)
- medium: leg 57% → 2-leg ~33%, 3-leg ~19% (rec max 3)
- high: leg 55% → 2-leg ~30%, 3-leg ~16% (rec max 3)
- longshot: leg 52% → 2-leg ~27%, 3-leg ~14% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 3.4pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
