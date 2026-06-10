# NBA Player-Stats Provider Cascade

_2026-06-10. Order the chain tries; fail-closed at the bottom. No fabricated stats._

## Cascade (priority)
1. **Paid/official provider** if a key exists (SportsDataIO NBA, BallDontLie GOAT) — none configured today.
2. **nba_api (stats.nba.com)** — best data, but **IP-blocked from GitHub Actions** → times out in CI; usable locally.
3. **ESPN public JSON** — roster + player game logs, free, CI-safe. **This is the working free source.**
4. **Local/manual emergency artifact** — generate logs locally (nba_api or ESPN) and commit, only if CI is fully blocked.
5. **BallDontLie paid** — only if upgraded.
6. **No real stats → no projection (fail-closed).**

To force ESPN for a run (consistent ids, no nba_api timeouts):
`NBA_DATA_PROVIDER=espn_scoreboard` (now a `morning-projections` dispatch input). ESPN
then serves BOTH roster and game logs, so the player ids used for logs come from the
ESPN roster — no cross-provider id mismatch.

## Minimum data for a Game-4 projection (per player)
roster name + source player id · market from odds · stat type (PTS/REB/AST) · recent
N-game average (with games-played/sample size) · minutes proxy · active status if
available · data freshness · source label. Missing any required field → that player
fails closed (no projection), never guessed.

## Model tiers
- **Tier A:** recent10/recent5 game logs (ESPN provides this) — preferred.
- **Tier B:** playoff-only game logs (subset of A during the postseason).
- **Tier C:** season averages + last box scores (clearly labeled, weaker).
- **Tier D:** odds-only market-implied board, labeled "sportsbook implied, not a model projection", no parlays.
- **Tier F:** fail-closed (no stats → nothing public).

Game 4 targets **Tier A** via ESPN game logs.
