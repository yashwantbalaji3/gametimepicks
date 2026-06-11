# NBA Finals Game 5 Readiness — 2026-06-11

## Series context
Game 4 settled (Knicks beat Spurs 107-106); Knicks lead 3-1. **Game 5 = June 13** (board
`boards/2026-06-13.json` exists, 1 game). June 11 + June 12 have **0 NBA games** (off-days).

## No stale Game 4 leftovers (verified)
- NBA board for "today" (June 11) has 0 games.
- Parlay Lab NBA Finals same-game section renders ONLY for a fresh same-day slate
  (`optimizerForDate.date === today`) → the finished June 10 cards no longer appear as pre-tip.
- Bank Builder shows the **settled** featured June 10 card ("Card hit") + the canonical
  ledger; no pending June 10 override remains.

## Game 5 generation plan (fail-closed)
Projections/odds for Game 5 should generate only when: game scheduled (✅ June 13), fresh
pre-game odds posted, ESPN rosters/game-logs available, no post-game leakage. Provider stays
`NBA_DATA_PROVIDER=espn_scoreboard` (verified set). Supported markets unchanged:
PTS/REB/AST/3PM/PRA/BLK/STL. Same-game cards + a Bank Builder Game-5 slip build only once the
pre-game leg pool + odds exist; until then the next Builder Slip is honestly **pending**
($728.76 stake, $2,000 target).
