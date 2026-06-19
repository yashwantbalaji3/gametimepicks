# June 19 — World Cup player-prop upside pool + same-game/multi-game High & Longshot

_Branch `worldcup-player-prop-high-longshot-generation` off main `fbe0eb4c`. Audit at 2026-06-19 21:02 UTC (Scotland-Morocco 22:00Z, Brazil-Haiti 00:30Z, Turkey-Paraguay 03:00Z pre-event; USA started → excluded)._

## Audit
| area | current count | issue | intended fix | success condition |
|---|---|---|---|---|
| WC same-game High | 0 | same-game generator builds team-only Medium cards | add player-prop legs → same-game stacks reach High | High cards per pre-event game where eligible |
| WC same-game Longshot | 0 | same — no player upside | same-game stacks (team + goalscorer/SOT/shots) reach Longshot | Longshot cards per game where eligible |
| WC multi-game Longshot | 0 | 3 distinct games, team-only favorites top out in High | plus-money player props let 3-leg cross-game cards reach > +600 | Longshot > 0 when eligible |
| WC player-prop pool | not used by generators | `parlayEligible:false`, market-implied, different matchId from team legs | adapter joins by fixture → team `eventId`, guards, limited-data label | adapter returns real pre-event props |
| Coverage matrix | WC Games 0/11/0/0, WC Multi 0/5/5/0 | High/Longshot empty for WC | auto-updates from real cards | WC High/Longshot > 0 |
| Active Bank Builder | Lane A USA+Gonzales, Lane B Turkey+Hoskins | — | **never touched** | unchanged |
| Active Moonshot | Step 1 +808 | — | **never touched** | unchanged |
| Mr. Dub | core $297.88 / moonshot $25 / total $322.88 | — | **never touched** | unchanged |
| Protected history | `public/data/bank-builder/*` | — | **never touched** | unchanged |

## Player-prop source
`app/public/data/world-cup/player-projections/latest.json` → `pp.matches`. For the 3 pre-event games: **4 real markets** × ~36 each — `player_goal_scorer_anytime`, `player_shots_on_target`, `player_assists`, `player_shots`. Each prop has `fixture`, `player{name,team,photo}`, `market`, `pick`, `line`, `americanOdds`, `modelProbability`, `marketProbability`, `dataQuality: limited`, `lineupStatus`. **No `kickoffUtc`** and **no `matchId` join to the team legs** (props key on a full Odds hash; team legs key on short ids "30"/"31"/hash) → the adapter joins by **fixture string** to the team projection to inherit `eventId` + `kickoffUtc`.

## Plan
1. `world-cup-player-prop-legs.ts` adapter → real props as `EligibleLeg` (joined `eventId`, guards: pre-event, odds ∈ [-500, +1200], real market, has odds; `dataQuality: limited_data_market_implied`; settlement = official 90-minute goal record / official stat).
2. ui-loader: add the player-prop legs to the WC eligible pool. The existing **balanced** same-game + multi-game generators (leg-count spread + combined-odds bucketing) then build High/Longshot WC cards mixing team anchors + player upside — Moonshot-style, correlation-disclosed. Player props are plus-money + lower-quality, so they deprioritize into the longer High/Longshot combos, not Low/Medium.
3. Coverage matrix + diagnostics auto-update.

## Guards
No fabrication (every prop has a real bookmaker price); pre-event only; no leg < -500; real market names only (no fake "score or assist"); active Lane A/B + Moonshot + Mr. Dub untouched; protected history untouched; correlation disclosed on same-game stacks; canonical/allowed copy only.
