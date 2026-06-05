# NBA Recent-Form Post-Fix Verification (2026-06-05)

> Verifies the #282 NBA game-log provider fix and the June 5 staleness situation.

## Current June 5 board (stale — pre-#282)
- Keldon Johnson recentGames latest: **2026-04-12** (regular season).
- Sampled NBA leans recentGames latest: **2026-04-10** (regular season).
- The Spurs' playoff games (OKC + Minnesota + Knicks Finals) are **absent** — these are regular-season-only logs.
- Cause: the June 5 board was generated **before** PR #282 merged. The board data is frozen; only a regeneration/refetch updates it.

## Provider fix on main (#282) — verified
`pipeline/providers/nba_api_provider.py :: fetch_player_game_logs` now fetches **both "Playoffs" and "Regular Season"**, merges, sorts by date desc, takes most-recent N (Playoffs is a no-op off-season). `_parse_player_gamelog_rows` extracted.
- Unit tests (`nba_api_provider_test.py`): parse normalization; **most-recent-N across season types surfaces playoff games** (the 06-03/05-30 playoff rows beat the April regular-season rows); graceful non-df. All pass on main.

## Conclusion
- The current June 5 board is stale **only because it predates #282** — not a current code bug.
- The **next fresh slate** (next `morning-projections` run, pre-game) will fetch playoff-inclusive logs automatically → correct recent form + correct Low Risk natively.
- Belt-and-suspenders: the Low-Risk staleness guard fail-closes stale dated form, so even a stale board can't put NBA into Low Risk.
- A live free-endpoint refetch for June 5 specifically was NOT run (would require board regeneration; out of the no-refetch scope and the paid morning-projections is unsafe mid-slate).

*Verification only. No data/model/grading change.*
