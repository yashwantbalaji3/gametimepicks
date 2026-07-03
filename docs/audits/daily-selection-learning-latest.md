# Daily selection learning — through 2026-07-02

Training window: **2026-06-25 → 2026-07-02** (8d). Universe legs:
**847** (baseline 51.9%). Published legs:
**0**, cards: **0**. noLiveWire=**true**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 58% (179/310, WLB 52%) shrunk 57%
- **batter_hits_runs_rbis** → `allowed` — 56% (173/309, WLB 50%) shrunk 56%
- **batter_total_bases** → `disabled` — 49% (72/148, WLB 41%) shrunk 49%
- **pitcher_strikeouts** → `disabled` — 44% (16/36, WLB 30%) shrunk 47%

## Calibration
- Edge inverted at high values: **true** 20+:45% (25/56, WLB 32%) · 15-20:45% (30/67, WLB 33%) · neg:59% (102/173, WLB 52%) · 0-5:53% (127/240, WLB 47%) · 10-15:58% (66/114, WLB 49%) · 5-10:59% (90/153, WLB 51%)
- Confidence predictive: **false** (spread 3.8pts) Low:53% (194/364, WLB 48%) · High:56% (186/334, WLB 50%) · Medium:57% (60/105, WLB 48%)

## Published leg hit rate by lane


## Card length (parlay-math projection from observed leg rate)


## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 3.8pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
