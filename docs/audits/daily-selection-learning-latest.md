# Daily selection learning — through 2026-07-25

Training window: **2026-07-18 → 2026-07-25** (8d). Universe legs:
**2135** (baseline 43.9%). Published legs:
**337**, cards: **96**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `restricted` — 52% (393/754, WLB 49%) shrunk 52%
- **batter_hits_runs_rbis** → `restricted` — 49% (363/742, WLB 45%) shrunk 49%
- **batter_total_bases** → `disabled` — 39% (133/343, WLB 34%) shrunk 39%
- **pitcher_strikeouts** → `disabled` — 49% (49/100, WLB 39%) shrunk 48%

## Calibration
- Edge inverted at high values: **true** 20+:42% (25/60, WLB 30%) · 10-15:47% (134/288, WLB 41%) · neg:48% (206/427, WLB 44%) · 0-5:50% (272/548, WLB 45%) · 5-10:50% (249/499, WLB 46%) · 15-20:44% (52/117, WLB 36%)
- Confidence predictive: **false** (spread 2.1pts) Low:49% (376/765, WLB 46%) · High:48% (435/904, WLB 45%) · Medium:47% (127/270, WLB 41%)

## Published leg hit rate by lane
- low: 63% (29/46, WLB 49%)
- medium: 64% (48/75, WLB 53%)
- high: 61% (59/96, WLB 51%)
- longshot: 61% (73/120, WLB 52%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 63% → 2-leg ~40%, 3-leg ~25% (rec max 2)
- medium: leg 64% → 2-leg ~41%, 3-leg ~26% (rec max 3)
- high: leg 61% → 2-leg ~38%, 3-leg ~23% (rec max 3)
- longshot: leg 61% → 2-leg ~37%, 3-leg ~23% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 2.1pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
