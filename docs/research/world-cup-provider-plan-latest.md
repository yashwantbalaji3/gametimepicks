# FIFA World Cup 2026 — Provider Plan & Readiness Foundation

_Last updated: 2026-06-09. Fail-closed foundation. No fake matches, teams, odds, or projections._

## Current state (live)
Schedule-only, official structural data: **104 matches, 48 teams, 12 groups** (FIFA Final
Draw 2025-12-05). Public `/world-cup` pages (hub, schedule, groups, teams, team detail)
render "projections coming soon." `readiness-latest.json` now records the gates:
`scheduleReady=true, teamsReady=true`; **odds/stats/grading/projections/parlay = false.**
Squads are intentionally withheld until federations release official 26-man rosters (~June 2, 2026).

## What a real World Cup model needs (staged, only when data exists)
| Layer | Need | Candidate providers |
|---|---|---|
| Fixtures/teams | already live (official) | FIFA / ESPN structural data (in repo) |
| **Match odds** | 1X2, totals, BTTS, Asian handicap | The Odds API (`soccer_fifa_world_cup` key — verify near tournament), OpticOdds, SportsDataIO Soccer — all **paid except The Odds API budget** |
| **Player-prop odds** | anytime scorer, shots, cards | OpticOdds / SportsDataIO (paid) |
| **Team/player stats** | form, xG, lineups, minutes | StatsBomb (paid), Opta/Stats Perform (enterprise), FBref-derived (license care) |
| **Lineups (leakage-critical)** | confirmed starting XI pre-kickoff | provider feeds / official team sheets — features only valid once confirmed |
| **Grading/settlement** | deterministic per-market settlement | results from official/provider feed |

## Provider recommendation (ranked)
1. **Match-odds entry:** The Odds API — check for a `soccer_fifa_world_cup_2026` (or
   `soccer_fifa_world_cup`) key as the tournament nears; **same `ODDS_API_KEY` we already
   have** → no new spend for 1X2/totals if the market exists. Probe like UFC discovery.
2. **Stats:** StatsBomb / Opta — **paid, user approval required**; needed for any real model.
3. **Player props:** OpticOdds / SportsDataIO Soccer — **paid, approval required.**
4. No scraping of sportsbooks or stats sites without explicit approval + ToS review.

## Connected-keys check (2026-06-09)
Repo secrets present: `ODDS_API_KEY`, `BALLDONTLIE_API_KEY` only. **No soccer odds key,
no soccer stats key.** → no discovery probe possible tonight; nothing to fetch honestly.

## Leakage rules (when implemented)
No post-match stats in features; rolling form excludes the target match; lineup features
only after confirmed pre-kickoff XI. Keep a dedicated soccer pipeline behind capability
gates so it can never leak into MLB/NBA/UFC Suggested Parlays before it is real.

## Staged rollout (only when providers exist)
- **Stage 0 (now):** schedule-only + readiness artifact (done). No predictions.
- **Stage 1:** ingest match odds (1X2/totals) → projections-only surface, gated.
- **Stage 2:** add grading contract → graded suggested parlays.
- **Stage 3:** team/player stats + props (lineup-aware), as paid providers allow.

## What requires user decision
Activating any **paid** soccer odds/stats/prop provider. Until then World Cup stays
schedule-only and fully fail-closed — independent of MLB/NBA/UFC.
