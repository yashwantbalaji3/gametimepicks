# Runbook — Daily Settlement Workflow

_Official sources only. Idempotent. Never fabricate stats._

## Command
```
SETTLE_DATE=<YYYY-MM-DD> SKIP_NBA=1 bash scripts/automation_settle.sh
```
Runs `settle_mlb_results` (MLB Stats API box scores) → `export_mlb_results` → `grade_parlays` →
`grade_curated` → `grade_optimizer --all` → audits. World Cup uses
`pipeline.world_cup.settle --scores <official-scores>` + `settle_player_props` +
`settle_suggested_cards`.

## Rules
- **Official sources only** — MLB Stats API, API-Football finals/player stats. Never screenshots,
  user claims, or unofficial lines.
- **0-AB / no-PA void rule** — a hitter prop voids (no-action) when the batter recorded no plate
  appearance (empty batting line, or AB=0 and PA=0). Never a loss/win. `--void-suspended` /
  `_is_suspended` + the batter void path in `settle_mlb_results.py`.
- **Suspended / rescheduled no-action rule** — a game officially Suspended/Postponed (non-Final,
  `codedGameState=U`) is **void/no-action** for the original slate when closing the date; the
  resumed game regenerates as its own dated slate. Run with `--void-suspended` to close.
- **Void legs drop** from a parlay: `[void, win, win] → win`; `[void, loss] → loss`; all-void → push
  (`grade_parlays._grade_slip_status`).
- **Pending never counts as a loss.** A still-in-progress game leaves its legs pending until Final.
- **No fabrication** — missing official stat → needs_review; never guessed.

## After settlement
- Re-run is idempotent (rewrites the date's rows). Write/update an audit under `docs/audits/`.
- Preserve history: Run #1 / Run #2 / UFC / prior settlements are never mutated.
- The site date-gate moves a settled prior day to Results/yesterday automatically.
