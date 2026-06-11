# World Cup Odds Discovery — 2026-06-11

## Bounded paid run (The Odds API)
- **Sport key used:** `soccer_fifa_world_cup` (active). Endpoint `/v4/sports` (free) +
  `/v4/sports/soccer_fifa_world_cup/odds?regions=us&markets=h2h,totals&oddsFormat=american`.
- **Credits:** ~2 this run (h2h + totals × 1 region). ~19,271 remaining. Cached; no loops.
- **Events returned:** **72** matches (HTTP 200), 11 books each.
- Workflow: `.github/workflows/world-cup-odds.yml`; artifacts:
  `world-cup/odds-discovery-latest.json`, `market-outlook-latest.json`,
  `projection-readiness-latest.json`.

## Markets available
- ✅ **h2h (3-way Home/Draw/Away)** — parsed + de-vigged for all 72 matches.
- ✅ **totals (Over/Under goals)** — parsed + de-vigged.
- ❌ team totals, corners, player props (player_shots/SOT/assists/anytime goalscorer) —
  **not returned** for this sport key / region → fail-closed (not shown).

## Today (2026-06-11 ET) — market outlook ready
- **Mexico vs South Africa** — H 67% / Draw 21% / Away 11% (−235 / +340 / +750), Total 2.5
  O43% / U56% (DraftKings).
- **South Korea vs Czech Republic** ("Czechia" in schedule) — H 34% / Draw 30% / Away 34%
  (+175 / +210 / +180), Total 2.5 O41% / U58%.

## Readiness (honest, fail-closed)
| Gate | State |
|---|---|
| oddsReady / marketOutlookReady | ✅ true |
| statsReady / playerPropsReady | ❌ false (no soccer stats/xG/minutes provider) |
| projectionsReady / parlayReady | ❌ false |
- `moneyline90` / `totalGoals` → **market_outlook_only** (odds-implied, not independent model edge).
- player props + corners + team totals → unavailable (no stats / no market).

## Conclusion
World Cup is now **Market-Outlook-live** (real 90-minute 3-way + totals), with independent
projections, player props, parlays, and any Bank Builder World Cup slip **fail-closed** until
a soccer stats provider is connected. No fabricated odds, no model edge claimed.
