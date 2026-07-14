# Projection Engine Asset Audit (2026-07-14)

What modeling/data assets actually exist before building the internal engines. Money untouched (md5 `affe6b21`).

## Soccer / World Cup

| Asset | Path | What it is | Public? |
|---|---|---|---|
| FIFA rating points | `world-cup/team-strength/team-strength-latest.json` | FIFA rank + points, **110/110 teams** (1182–1876) | public |
| Official finished scores | `world-cup/settlement/official-scores-*.json` | FT 90' scores, but **knockout window only** — ~5–6 *unique* finished matches in committed data | public |
| Market projections | `world-cup/projections/<date>.json` | de-vigged 1X2 (`moneyline_90`) + total + BTTS + DC + DNB per fixture, keyed by matchId | public |
| Expanded markets | `world-cup/expanded-markets/` | Asian handicap + team totals (thin books) | public |
| Player props/projections | `world-cup/player-projections/`, `player-markets/` | goalscorer / shots / SOT / assists | public |
| Normalized stats | `world-cup/stats/normalized-latest.json` | provider fixtures + lineups (sparse) | public |
| Schedule / squads / teams | `world-cup/schedule.json`, `squads.json`, `teams.json`, `groups.json` | 104 fixtures, rosters | public |
| **Internal projection engine** | — | **Did NOT exist before this mission** | — |

**Soccer verdict:** we had a strong strength signal (FIFA points, full coverage) and a market anchor, but the "projection" was **market-implied de-vig only** — no internal model. Backtest data in committed artifacts is **tiny** (settlement is knockout-only, re-fetched daily → ~5 unique finished matches). A real validation set requires the 2022 WC (64 matches) via API-Football.

## MLB

| Asset | Path | What it is | Public? |
|---|---|---|---|
| Player-prop 10k sim | `mlb/game-simulations/<date>.json` | 10,000-run **player-prop** sim (picks + distributions). No full-game score. | public |
| **Internal full-game sim** | `data/internal/mlb/full-game-sim/<date>.json` | market-anchored Monte Carlo: winProbability + projectedScore + total/margin distributions, `modelMode: market_anchored_simulation`, `public:false` | **internal** |
| Full-game backtests | `data/internal/mlb/full-game-sim-backtests/` | rolling backtest, strictly-earlier-dates leakage note | internal |
| Team market lines | `data/internal/mlb/team-market-lines/`, `mlb/team-markets/` | de-vigged ML/RL/total | mixed |
| Model inputs | `data/internal/mlb/model-inputs/` (park factors) | static park factors | internal |
| Linescores / settlement | `data/internal/mlb/linescores/`, `mlb/results/` | official box-score settlement | internal/public |

**MLB verdict:** the internal full-game Monte Carlo engine **already exists** (prior slice) and is honest — market-anchored, `public:false`, not web-served, 20/20 honesty tests. The public report stays a player-prop sim + market-anchored lines until the rolling backtest beats the market baseline.

## Existing public UI (source mode)

| Route | Source mode | User-facing claim | SimTheGame-flow gap |
|---|---|---|---|
| `/games/world-cup/france-vs-spain-2026-07-14` | `soccer_market_implied` | "Market-implied · 90′" simulation result + bracket impact | had no internal projection; now has an internal engine (not surfaced) |
| `/games/mlb/*` | `mlb_player_prop_simulation` | "Simulation result" (player-prop) + market-anchored lines | full-game engine internal-only |
| `/simulate` | mixed | availability chips per game | honest |

## What this mission added
- **Internal soccer projection engine V1** (`internal-soccer-projection-engine.ts`) + build + backtest scripts + internal artifacts. Rating-driven bivariate Poisson. `public:false`. See `PROJECTION_ENGINE_CONTRACTS.md` + `SOCCER_PROJECTION_ENGINE_V1_BACKTEST.md`.
- Verified/kept the MLB internal full-game engine (no rebuild).
