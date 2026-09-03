# Daily selection learning — through 2026-09-02

Training window: **2026-08-26 → 2026-09-02** (8d). Universe legs:
**3622** (baseline 48.4%). Published legs:
**660**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 53% (709/1326, WLB 51%) shrunk 53%
- **batter_hits_runs_rbis** → `allowed` — 52% (692/1326, WLB 50%) shrunk 52%
- **batter_total_bases** → `disabled` — 46% (272/590, WLB 42%) shrunk 46%
- **pitcher_strikeouts** → `disabled` — 51% (79/156, WLB 43%) shrunk 50%

## Calibration
- Edge inverted at high values: **true** 0-5:55% (554/1008, WLB 52%) · 5-10:54% (437/802, WLB 51%) · 10-15:51% (246/487, WLB 46%) · neg:47% (387/820, WLB 44%) · 15-20:45% (89/198, WLB 38%) · 20+:47% (39/83, WLB 37%)
- Confidence predictive: **false** (spread 3.8pts) Medium:54% (269/497, WLB 50%) · High:52% (772/1487, WLB 49%) · Low:50% (711/1414, WLB 48%)

## Published leg hit rate by lane
- low: 66% (62/94, WLB 56%)
- medium: 55% (77/141, WLB 46%)
- high: 55% (102/184, WLB 48%)
- longshot: 61% (146/241, WLB 54%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 66% → 2-leg ~44%, 3-leg ~29% (rec max 2)
- medium: leg 55% → 2-leg ~30%, 3-leg ~16% (rec max 3)
- high: leg 55% → 2-leg ~31%, 3-leg ~17% (rec max 3)
- longshot: leg 61% → 2-leg ~37%, 3-leg ~22% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 3.8pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
