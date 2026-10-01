# Daily selection learning — through 2026-09-30

Training window: **2026-09-23 → 2026-09-30** (8d). Universe legs:
**2856** (baseline 46.1%). Published legs:
**574**, cards: **168**. noLiveWire=**false**.

## Recommended market status (Wilson-LB driven, fail-closed)
- **batter_hits** → `allowed` — 55% (583/1054, WLB 52%) shrunk 55%
- **batter_hits_runs_rbis** → `restricted` — 51% (535/1040, WLB 48%) shrunk 51%
- **batter_total_bases** → `disabled` — 45% (146/326, WLB 39%) shrunk 45%
- **pitcher_strikeouts** → `disabled` — 42% (53/127, WLB 34%) shrunk 42%

## Calibration
- Edge inverted at high values: **true** 10-15:48% (217/455, WLB 43%) · 5-10:52% (340/649, WLB 49%) · neg:53% (247/469, WLB 48%) · 0-5:54% (360/670, WLB 50%) · 15-20:51% (104/205, WLB 44%) · 20+:49% (49/99, WLB 40%)
- Confidence predictive: **false** (spread 3.6pts) High:51% (661/1309, WLB 48%) · Low:53% (470/894, WLB 49%) · Medium:54% (186/344, WLB 49%)

## Published leg hit rate by lane
- low: 55% (42/76, WLB 44%)
- medium: 51% (66/129, WLB 43%)
- high: 58% (95/165, WLB 50%)
- longshot: 52% (106/204, WLB 45%)

## Card length (parlay-math projection from observed leg rate)
- low: leg 55% → 2-leg ~31%, 3-leg ~17% (rec max 2)
- medium: leg 51% → 2-leg ~26%, 3-leg ~13% (rec max 3)
- high: leg 58% → 2-leg ~33%, 3-leg ~19% (rec max 3)
- longshot: leg 52% → 2-leg ~27%, 3-leg ~14% (rec max 3)

## Warnings
- edge signal is INVERTED at high values — edge capped, not used to promote
- confidence non-predictive (spread 3.6pts) — excluded from ranking

_Recommendation artifact only — no production logic changed by this script._
