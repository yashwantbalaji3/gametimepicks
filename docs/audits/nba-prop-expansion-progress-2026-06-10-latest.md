# NBA Prop Expansion + Game Outlook — Progress & Plan (2026-06-10)

## Done this PR (Phase 2 — foundational, no behavior change)
Extended the ESPN gamelog parser + `GameLog` to carry the full box score:
- **`GameLog`**: added `fg3m`, `blk`, `stl`, `tov` (default 0 → backward-compatible; every
  existing provider/consumer unchanged; `build_features` still reads only pts/reb/ast/min).
- **ESPN parser**: `_stat_indices` now maps `3PT/BLK/STL/TO`; `_parse_gamelog` populates
  `fg3m` (made of the "X-Y" 3PT cell), `blk`, `stl`, `tov`. Verified on the real Brunson
  fixture (Game 3: 3PM 3, TOV 5, BLK 0, STL 0) with PTS/REB/AST unchanged. 14 tests pass.

These fields are the **prerequisite** for new NBA markets. They are NOT yet consumed by the
model, so there is no production behavior change.

## Gating fact still needed (Phase 1 — cloud)
A market is public ONLY if **real odds AND real stats** exist. Stats are now parsed; the
open question is **odds availability**. The NBA odds config currently requests only
`player_points/rebounds/assists` (config.py + odds_api_provider MARKET_MAP). Whether
OddsAPI returns `player_threes / player_blocks / player_steals / player_turnovers /
player_points_rebounds_assists` for `basketball_nba` June 10 must be confirmed by a
**credit-bounded cloud probe** (cannot run locally — needs `ODDS_API_KEY`).

## Remaining (cloud-dependent) follow-up steps — exact plan
1. **Probe (Phase 1):** add the candidate market keys to `ODDS_MARKET_MAP` + run a bounded
   `fetch_props_with_diagnostics` for Game 4 → record available markets, credits, book/player
   coverage. Write `docs/audits/nba-oddsapi-market-coverage-2026-06-10-latest.md`.
2. **Model (Phase 3):** for each confirmed market, add scoring in `score_model` (minutes/
   opportunity-led; recent5/10 + window baseline; stricter sample/edge gates for volatile
   BLK/STL; per-market σ). 3PM first, then PRA (derive from PTS/REB/AST), then BLK/STL/TO.
3. **Regenerate (Phase 4):** NBA-only run with `NBA_DATA_PROVIDER=espn_scoreboard`; verify
   no June-10 leakage, ESPN source preserved, PTS/REB/AST not regressed, parlay gates intact.
4. **Game outlook (Phase 5):** NBA `game-markets/` is stale (May 23) + MLB board lacks
   moneyline — a **new h2h/spreads/totals fetch** is required, then surface a labeled
   "Market outlook — implied by current sportsbook prices" card (NOT a model pick).
5. **UI (Phase 6):** market-coverage panel + single-game NBA messaging ("Finals is a
   single-game slate; same-game stacking is intentionally limited").

## Why these are follow-ups, not this PR
Each needs a cloud odds run (credit spend) + careful leakage testing + sequencing. The
parser foundation ships safely now; the rest is gated on the probe result and should be
done as its own PR(s) with the cloud generation verified — not rushed blind.
