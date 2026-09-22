# Daily selection learning — through 2026-09-21

Training window: **2026-09-14 → 2026-09-21** (8d). Universe legs:
**3889** (baseline 46.6%). Published legs:
**662**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 56% (789/1399, WLB 54%) shrunk 56%
- **batter_hits_runs_rbis** → `restricted` — 50% (699/1390, WLB 48%) shrunk 50%
- **batter_total_bases** → `disabled` — 39% (230/583, WLB 36%) shrunk 40%
- **pitcher_strikeouts** → `restricted` — 53% (93/177, WLB 45%) shrunk 52%

## Calibration
- Edge inverted at high values: **true** 5-10:51% (421/827, WLB 48%) · neg:52% (385/747, WLB 48%) · 0-5:54% (549/1023, WLB 51%) · 10-15:49% (288/583, WLB 45%) · 20+:50% (54/109, WLB 40%) · 15-20:44% (114/260, WLB 38%)
- Confidence predictive: **false** (spread 3.5pts) High:49% (822/1669, WLB 47%) · Low:53% (751/1429, WLB 50%) · Medium:53% (238/451, WLB 48%)

## Published leg hit rate by lane
- low: 69% (64/93, WLB 59%)
- medium: 54% (79/146, WLB 46%)
- high: 59% (109/185, WLB 52%)
- longshot: 60% (143/238, WLB 54%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 69% → 2-leg ~47%, 3-leg ~33% (rec max 2)
- medium: leg 54% → 2-leg ~29%, 3-leg ~16% (rec max 3)
- high: leg 59% → 2-leg ~35%, 3-leg ~21% (rec max 3)
- longshot: leg 60% → 2-leg ~36%, 3-leg ~22% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 3.5pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
