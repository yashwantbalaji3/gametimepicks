# June 10 Settlement Scope

## Items settled (official sources)
- **MLB:** 15 games · `mlb/results/comparison_report_2026-06-10.json` (MLB Stats API).
- **NBA Game 4 (Spurs @ Knicks):** player props graded from ESPN summary box score
  → `results/comparison_report_2026-06-10.json` + `results/settled_leans.jsonl`
  (PTS/REB/AST; 3PM/PRA/BLK/STL remain market=invalid in the settler by design).
- **Suggested parlays:** `parlays/graded/2026-06-10.json` +
  `parlays/optimizer-graded/2026-06-10.json` (grade_parlays + grade_optimizer --all).
- **Bank Builder tracked ladder:** `bank-builder/ledger-2026-06-10.json` (MLB pick win).
- **Featured NBA Finals card:** `bank-builder/featured-2026-06-10.json` (HIT).

## Source artifact paths
- NBA board: `boards/2026-06-10.json` (201 leans) — pregame, unchanged.
- MLB board: `mlb/boards/2026-06-10.json` (685 leans) — pregame, unchanged.
- Optimizer snapshot: `parlays/optimizer/2026-06-10.json` — pregame, unchanged.

## Pending before settlement → after
Before: NBA + MLB results absent; ledger/featured June 10 unsettled.
After: all finished games settled; bankroll advanced; featured card graded. No
finished-game item left pending.
