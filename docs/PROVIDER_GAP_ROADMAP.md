# Provider Gap Roadmap — what a data upgrade unlocks (2026-07-14)

The honest list of capabilities GTP *cannot* ship today purely because of data/provider limits — and exactly
what each one needs. Nothing here is faked in the product; each row stays "coming soon" until its provider box
is checked.

## Current provider footprint (free tier)
- **The Odds API** — de-vigged prices (WC 90' markets + 24 player props/fixture; MLB player-prop + full-game
  lines). Credits ~18k, floor 5000. This is what powers every market-implied read today.
- **API-Football (FREE plan)** — schedule/fixtures only. **No 2026-season player statistics** ("Free plans do
  not have access to this season, try 2022–2024"). Grading logic is built + validated on 2022 data, but LIVE
  2026 settlement is blocked.
- **MLB Stats API** — free, official box scores + linescore. Powers MLB settlement + the 10k player-prop sim's
  reality checks. **No paid gap here.**

## Gap → requirement → what it unlocks

| Want | Blocked by | Provider requirement | Unlocks |
|---|---|---|---|
| **WC live player-prop settlement** | Free API-Football, no 2026 stats | API-Football paid plan (2026 access) **or** equivalent stats feed | Flip `anytime_scorer` / `shots` from `experimental` → `supported`; real WC prop results |
| **Independent soccer model** (xG, shots, corners, cards, correct score) | No event/tracking data | xG / event-data provider (StatsBomb, Opta-class) + a validated model | A genuine soccer simulation instead of a market-implied read. **Until then: market-implied only, never faked** |
| **MLB full-game score / total-runs / margin / win-prob distribution** | No full-game sim artifact | A validated full-game model (internal prototype exists, not web-served) | Public MLB full-game simulation. Gated on backtest passing — see `MLB_FULL_GAME_MONTE_CARLO_PROTOTYPE.md` |
| **MLB team totals / F5 / alt lines / pitcher markets** | Not ingested / not settleable end-to-end | Odds ingest for those markets + settlement join | More MLB markets on the report (today they're honestly "unavailable modules") |
| **NBA props (3PM / PRA / STL / BLK)** | Historically unsettleable in our pipeline | Reliable box-score settlement join | Re-enable NBA props (currently avoided — ~unsettleable) |

## Sequencing (highest ROI first)
1. **API-Football paid plan** — cheapest unlock, flips WC props from display-only to settleable. Directly
   validates the settlement engine already built (`wc-prop-settlement.ts`, proven on 2022 data).
2. **MLB full-game model** — internal prototype → backtest vs settled July games → *only if it beats the
   market-implied baseline* does it earn a public surface.
3. **Soccer event-data provider** — the big one. Turns "market-implied read" into a real independent soccer
   sim. Expensive; do last, and never fake the intermediate state.

## The rule this roadmap enforces
A capability is **"coming soon" in the UI until its provider box is checked** — it is never surfaced as if the
data existed. That is the difference between a mature sim product and a demo that lies.
