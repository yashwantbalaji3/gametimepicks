# June 17 — Rerun June 16 Settlement Only (SF @ ATL still suspended)

_Branch `june17-rerun-june16-settlement-only` off main `ea28eeb`. Rerun ~11:15 ET June 17. Official
MLB Stats API only. June 17 generation intentionally NOT run._

## Official SF @ ATL status (gamePk 824912)
San Francisco Giants @ Atlanta Braves — **`abstractGameState=Live`, `detailedState="Suspended:
Rain"`, `codedGameState=U`, `resumeDate=2026-06-17`**, score 3–2 in the 2nd. The game has **not yet
resumed** and is **not Final**. No official final box score exists → its legs cannot be settled.

## Command run
`SETTLE_DATE=2026-06-16 SKIP_NBA=1 bash scripts/automation_settle.sh` (MLB Stats API, free public
endpoints). The orchestrator reported "MLB partial: 1 game(s) still in progress."

## Before / after (June 16 optimizer)
| | W | L | void legs | pending slips |
|---|---|---|---|---|
| Before | 6 | 47 | 45 | 3 |
| **After** | **6** | **47** | **45** | **3** |

**No change.** Validation leans unchanged: **262 W / 283 L / 45 Void**. The rerun produced only
idempotent regrade timestamp churn (verified: 0 June-16 slip-status changes vs HEAD), which was
discarded — there is no material settlement to deploy.

## Did the 3 pending slips clear?
**No.** All 3 contain a player from the suspended SF @ ATL game (Bryce Eldridge / Matt Olson / Eli
White). Per the suspended-game rule they remain **pending** — not forced, not fabricated.

## Preservation checks (all intact)
- World Cup: team **10 W / 1 L**, player props **17 W / 33 L / 22 void**, WC cards 2 W, mixed 4 L.
- Bank Builder: Run #1 **$100 → $10,376.17 · 5–0 · completed** · Run #2 **settled · 0/2** · Run #3
  **evaluating / not launched**. UFC unchanged. No new Bank Builder run.
- **No June 17 generation artifacts** created (mlb board / WC projections / optimizer / daily cards
  for 2026-06-17 all absent). 0-AB void rule unchanged.

## Tests/audits
No code or data changed (doc-only). Copy + secret audits clean.

## Note
**June 17 slate generation intentionally not run.** Methodology/process redesign is a separate next
task and was not started here.

## Next recommended task
Once gamePk 824912 (SF @ ATL) resumes and is Final, re-run `SETTLE_DATE=2026-06-16 SKIP_NBA=1 bash
scripts/automation_settle.sh` to clear the last 3 slips. Then proceed to the comprehensive
methodology/process redesign before any June 17 generation.
