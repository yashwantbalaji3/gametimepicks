# NBA Finals Game 4 (June 10) — Generation Report

_2026-06-10. Generated from real free ESPN stats + real odds. No fake data._

## Result: ✅ Projections live from real free recovery
San Antonio Spurs @ New York Knicks (Finals Game 4) projections are **generated and
published** using the new ESPN free player-stats provider — recovering the recent-form
data that `stats.nba.com` was blocking. Generated via
`morning-projections` (run 27254178493) with `nba_data_provider=espn_scoreboard`,
`skip_mlb=true` → committed to `boards/2026-06-10.json`.

## Coverage
| Metric | Value |
|---|---|
| Game | SA @ NY (Finals Game 4, 8:30 PM ET) |
| Actionable leans | **96** (all with a projection) |
| Markets | PTS 36 · REB 31 · AST 29 |
| Confidence | High 58 · Medium 14 · Low 24 |
| Stats source | `espn_scoreboard` (status: ok) |
| Odds source | The Odds API |
| Optimizer legPool | 92 scored legs (real recent10) |
| Public Suggested-Parlay slips | **1** (see below) |

Sample (real, recent-form-based): Karl-Anthony Towns AST 4.36 vs 3.5 · Josh Hart AST
5.11 vs 4.5 · Julian Champagnie PTS 13.32 vs 9.5.

## Leakage audit: PASS
`audit-feature-leakage-safety --date 2026-06-10`: no post-game outcome fields, no
recentGames dated on/after the slate, **latest recentGames date = 2026-06-09** (Game 3,
the night before). Pre-game only — no Game 4 data.

## Why only 1 public Suggested Parlay (by design, not a failure)
The public optimizer enforces a **same-game cap of 1 leg** (PR #110: same-game stacks
are structurally correlated — blowout risk). Game 4 is the **only game on the slate**, so
no diversified ≥2-leg public parlay can be built; the public surface correctly shows a
single best-leg slip. Internal buckets contain same-game 2-leg combos but are withheld
from the public surface. We did **not** loosen the correlation safety to manufacture
parlays.

## How the recovery works
- ESPN public JSON (`site.api.espn.com` rosters + `site.web.api.espn.com` athlete
  gamelogs) — free, no auth, reachable from CI (unlike IP-blocked stats.nba.com).
- `EspnProvider` now implements `fetch_team_roster` + `fetch_player_game_logs` (PR #352).
- The board uses ESPN roster athlete ids for game logs when ESPN is active (PR #353),
  fixing the nba_api-id → ESPN-endpoint 404.

## Reproduce
```
gh workflow run morning-projections.yml -f projections_date=2026-06-10 \
  -f skip_mlb=true -f nba_data_provider=espn_scoreboard
```

## Rollback
Revert the auto-commit (NBA board) — projections disappear and the page falls back to
its fail-closed state. The ESPN provider stays available for future runs.
