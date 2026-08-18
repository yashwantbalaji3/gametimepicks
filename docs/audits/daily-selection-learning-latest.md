# Daily selection learning — through 2026-08-17

Training window: **2026-08-10 → 2026-08-17** (8d). Universe legs:
**4203** (baseline 45.4%). Published legs:
**668**, cards: **192**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 53% (804/1522, WLB 50%) shrunk 53%
- **batter_hits_runs_rbis** → `restricted` — 49% (753/1522, WLB 47%) shrunk 49%
- **batter_total_bases** → `disabled` — 39% (262/678, WLB 35%) shrunk 39%
- **pitcher_strikeouts** → `disabled` — 47% (88/186, WLB 40%) shrunk 47%

## Calibration
- Edge inverted at high values: **true** 0-5:50% (604/1213, WLB 47%) · neg:49% (419/859, WLB 45%) · 5-10:50% (451/908, WLB 46%) · 10-15:45% (253/563, WLB 41%) · 15-20:48% (117/243, WLB 42%) · 20+:52% (63/122, WLB 43%)
- Confidence predictive: **false** (spread 2.0pts) Low:50% (793/1588, WLB 47%) · High:48% (820/1711, WLB 46%) · Medium:48% (294/609, WLB 44%)

## Published leg hit rate by lane
- low: 55% (51/92, WLB 45%)
- medium: 55% (79/144, WLB 47%)
- high: 59% (112/190, WLB 52%)
- longshot: 57% (139/242, WLB 51%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 55% → 2-leg ~31%, 3-leg ~17% (rec max 2)
- medium: leg 55% → 2-leg ~30%, 3-leg ~17% (rec max 3)
- high: leg 59% → 2-leg ~35%, 3-leg ~21% (rec max 3)
- longshot: leg 57% → 2-leg ~33%, 3-leg ~19% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 2.0pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
