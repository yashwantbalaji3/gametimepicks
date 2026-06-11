# World Cup Public Launch Readiness — 2026-06-11

## Verdict: SCHEDULE-ONLY (fail-closed) — launched today
Real schedule + teams + groups + squads are live; **no soccer odds or stats provider is
connected**, so projections, market outlooks, and parlays stay OFF by design.

## Data artifacts (real)
- `world-cup/schedule.json` — 104 matches (FIFA Final Draw + ESPN cross-ref)
- `world-cup/teams.json` (48), `groups.json` (12), `squads.json`, `meta.json`
- `world-cup/readiness-latest.json` — the gate state

## Readiness gate (from readiness-latest.json)
| Gate | State |
|---|---|
| scheduleReady | ✅ true |
| teamsReady | ✅ true |
| oddsReady | ❌ false |
| statsReady | ❌ false |
| projectionsReady | ❌ false |
| parlayReady | ❌ false |
| publicLevel | **schedule-only** |

Blockers: no soccer odds provider (match + player-prop), no team/player stats provider
(form/lineups/xG), no soccer settlement source.

## Today (2026-06-11)
2 matches — Mexico vs South Africa, South Korea vs Czechia. **No odds available.**

## Supported markets today
- **None** (no odds). Schedule + structure only.

## Unsupported (clearly OFF until a provider is connected)
- 90-minute 3-way moneyline (Home/Draw/Away), Draw-no-bet, totals, handicap, BTTS,
  player props, advancement/futures. None are shown; no placeholder prices.

## What shipped today (public)
- `/world-cup` made current: "Tournament live" hero, **Today's fixtures** section, a
  **"Schedule live · odds & projections pending"** readiness badge, honest
  "90-minute markets unavailable — odds provider not connected yet" per-match note,
  removed stale "Squads publish June 2" copy, fail-closed framing. Schedule/Groups/Teams
  sub-pages already live.

## Recommended launch level: **schedule + (market-outlook when a provider lands)**
Next step to unlock market outlooks honestly: connect The Odds API `soccer_fifa_world_cup`
key + a 3-way (Home/Draw/Away) parser (current `fetch_game_markets` is 2-way only), then a
de-vigged 90-minute Market Outlook card. Projections/parlays require a stats/xG provider —
stay fail-closed until then.
